#!/usr/bin/env python3
"""Keep persisted JD sessions active and report login state safely.

This job attaches to the already-running, persisted Chromium instances.  It
does not read cookies, enter credentials, solve challenges, or terminate the
attached WebDriver session: ending an attached session can terminate the
user's long-lived browser process.  A keepalive run is best-effort per store;
a login expiration is an operational state, not a failed systemd job.
"""

from datetime import datetime
import json
import os
from pathlib import Path
import tempfile
import time
import urllib.request
from urllib.parse import urlsplit, urlunsplit

from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.service import Service


STORES = (("store1", 9222, "京东店铺1"), ("store2", 9223, "京东店铺2"))
ORDER_URL = "https://jzt.jd.com/jtk/#/order-detail"
STATE_FILE = Path("/srv/cps-data/jd-collector/logs/login-state.json")
CHROMEDRIVER_PATH = os.environ.get("CHROMEDRIVER_PATH", "/usr/bin/chromedriver")

# Ten minutes is frequent enough to keep an active frontend warm while
# avoiding the repeated navigation pattern that can look like automation.
PAGE_LOAD_TIMEOUT_SECONDS = 20
PAGE_STABLE_TIMEOUT_SECONDS = 20
PAGE_STABLE_FOR_SECONDS = 0.5
PAGE_POLL_SECONDS = 0.1

EXPECTED_HOST = "jzt.jd.com"
EXPECTED_ROUTE = "#/order-detail"
LOGIN_URL_MARKERS = (
    "/gw/index",
    "login",
    "passport",
    "captcha",
    "verify",
    "sso",
)
LOGIN_TITLE_MARKERS = ("登录", "验证码", "验证", "安全校验")


def browser_running(port):
    """Return whether the store's remote-debugging endpoint is reachable."""
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/json/version", timeout=3
        ):
            return True
    except (OSError, ValueError):
        return False


def _safe_current_url(driver):
    """Return a URL without query parameters, or an empty string on failure."""
    try:
        raw_url = driver.current_url or ""
    except WebDriverException:
        return ""
    try:
        parts = urlsplit(raw_url)
        if not parts.scheme and not parts.netloc:
            return raw_url.split("?", 1)[0]
        # Query parameters can contain transient tokens.  The route fragment
        # is retained because it is needed to distinguish the order page.
        return urlunsplit((parts.scheme, parts.netloc, parts.path, "", parts.fragment))
    except ValueError:
        return raw_url.split("?", 1)[0]


def _safe_title(driver):
    try:
        return (driver.title or "")[:120]
    except WebDriverException:
        return ""


def _classify_page(url, title):
    """Classify a settled page without inspecting cookies or page contents."""
    lowered_url = (url or "").lower()
    if any(marker in lowered_url for marker in LOGIN_URL_MARKERS) or any(
        marker in (title or "") for marker in LOGIN_TITLE_MARKERS
    ):
        return "login_expired", "登录已失效，需要重新验证", "login_required"

    try:
        host = urlsplit(url).netloc.lower()
    except ValueError:
        host = ""
    if host != EXPECTED_HOST or EXPECTED_ROUTE.lower() not in lowered_url:
        return "temporary_page_error", "京东页面暂未稳定，请稍后重试", "page_not_stable"
    return "online", "登录有效", None


def _wait_for_page_stable(driver):
    """Wait for readyState and URL to remain unchanged for a short interval."""
    deadline = time.monotonic() + PAGE_STABLE_TIMEOUT_SECONDS
    last_url = None
    stable_since = None
    while time.monotonic() < deadline:
        try:
            ready_state = driver.execute_script("return document.readyState")
            current_url = driver.current_url or ""
        except WebDriverException:
            raise

        if ready_state in ("interactive", "complete") and current_url == last_url:
            if stable_since is None:
                stable_since = time.monotonic()
            if time.monotonic() - stable_since >= PAGE_STABLE_FOR_SECONDS:
                return current_url
        else:
            last_url = current_url
            stable_since = None
        time.sleep(PAGE_POLL_SECONDS)
    raise TimeoutException("page did not stabilize")


def _touch_page(driver):
    """Perform a small, user-like page lifecycle activity.

    This only dispatches normal focus/page-show events.  It does not make
    hidden API calls, inspect storage, enter credentials, or bypass a
    captcha/slider.  Loading ORDER_URL itself is what lets the JD frontend
    perform its normal session refresh behavior.
    """
    driver.execute_script(
        """
        window.focus();
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('pageshow'));
        return document.readyState;
        """
    )


def _safe_disconnect(driver, service):
    """Disconnect Selenium without sending QUIT to an attached Chrome.

    Sending a QUIT command can close the persistent browser/profile that the
    operator needs for future verification.  Closing
    the HTTP command executor and stopping only our short-lived chromedriver
    leaves the attached Chromium instance running.
    """
    if driver is not None:
        executor = getattr(driver, "command_executor", None)
        close_executor = getattr(executor, "close", None)
        if callable(close_executor):
            try:
                close_executor()
            except Exception:
                pass
    if service is not None:
        try:
            service.stop()
        except Exception:
            pass


def check(store, port, label):
    """Check one store independently and return a non-throwing status record."""
    result = {
        "store": store,
        "label": label,
        "online": False,
        "status": "unknown",
    }
    if not browser_running(port):
        result.update(
            status="browser_fault",
            errorType="browser_unavailable",
            message="浏览器未运行",
        )
        return result

    options = webdriver.ChromeOptions()
    options.add_experimental_option("debuggerAddress", f"127.0.0.1:{port}")
    service = Service(CHROMEDRIVER_PATH)
    driver = None
    try:
        try:
            driver = webdriver.Chrome(service=service, options=options)
        except WebDriverException:
            result.update(
                status="browser_fault",
                errorType="webdriver_attach",
                message="无法连接浏览器",
            )
            return result

        driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT_SECONDS)
        try:
            driver.get(ORDER_URL)
            settled_url = _wait_for_page_stable(driver)
            _touch_page(driver)
            settled_url = _wait_for_page_stable(driver)
        except TimeoutException:
            settled_url = _safe_current_url(driver)
            title = _safe_title(driver)
            status, message, error_type = _classify_page(settled_url, title)
            if status == "online":
                status, message, error_type = (
                    "temporary_page_error",
                    "京东页面响应超时，请稍后重试",
                    "page_timeout",
                )
            result.update(
                status=status,
                errorType=error_type,
                message=message,
                url=_safe_current_url(driver),
                title=title,
            )
            return result
        except WebDriverException:
            status = (
                "browser_fault" if not browser_running(port) else "temporary_page_error"
            )
            result.update(
                status=status,
                errorType=(
                    "browser_disconnected" if status == "browser_fault" else "page_error"
                ),
                message=(
                    "浏览器连接中断"
                    if status == "browser_fault"
                    else "京东页面暂时无法访问，请稍后重试"
                ),
                url=_safe_current_url(driver),
                title=_safe_title(driver),
            )
            return result

        url = _safe_current_url(driver)
        title = _safe_title(driver)
        status, message, error_type = _classify_page(url, title)
        result.update(
            status=status,
            online=status == "online",
            message=message,
            url=url,
            title=title,
        )
        if error_type:
            result["errorType"] = error_type
        return result
    finally:
        # Deliberately do not send a WebDriver QUIT command; this browser owns
        # the persistent profile and must remain available after this check.
        _safe_disconnect(driver, service)


def _write_state_atomically(state):
    """Write the state file with fsync + replace so readers never see JSON half-written."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(
        prefix=f".{STATE_FILE.name}.", suffix=".tmp", dir=str(STATE_FILE.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(state, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, STATE_FILE)
    except Exception:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def main():
    state = {
        "checkedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "stores": [],
    }
    script_failed = False
    for store, port, label in STORES:
        try:
            # A failure in one persistent profile is recorded and the next
            # store is still checked independently.
            state["stores"].append(check(store, port, label))
        except Exception as error:
            script_failed = True
            state["stores"].append(
                {
                    "store": store,
                    "label": label,
                    "online": False,
                    "status": "script_error",
                    "errorType": type(error).__name__,
                    "message": "保活脚本异常",
                }
            )

    # Login expiration, browser unavailability, and temporary page errors all
    # remain successful operational states for systemd.  Only an unexpected
    # script error or an inability to persist state returns non-zero.
    _write_state_atomically(state)
    print(json.dumps(state, ensure_ascii=False))
    return 1 if script_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
