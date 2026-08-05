#!/usr/bin/env python3
"""Keep persisted JD sessions active and report real login state."""
from datetime import datetime
import json
from pathlib import Path
import urllib.request

from selenium import webdriver
from selenium.webdriver.chrome.service import Service

STORES = (("store1", 9222, "京东店铺1"), ("store2", 9223, "京东店铺2"))
ORDER_URL = "https://jzt.jd.com/jtk/#/order-detail"
STATE_FILE = Path("/srv/cps-data/jd-collector/logs/login-state.json")

def browser_running(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=3):
            return True
    except Exception:
        return False

def check(store, port, label):
    result = {"store": store, "label": label, "online": False}
    if not browser_running(port):
        result["message"] = "浏览器未运行"
        return result
    options = webdriver.ChromeOptions()
    options.add_experimental_option("debuggerAddress", f"127.0.0.1:{port}")
    driver = webdriver.Chrome(service=Service("/usr/bin/chromedriver"), options=options)
    try:
        driver.get(ORDER_URL)
        driver.execute_script("window.localStorage.getItem('keepalive')")
        url = driver.current_url.lower()
        title = driver.title
        online = "#/order-detail" in url and not any(x in url for x in ("login", "passport", "captcha", "/gw/index"))
        result.update(online=online, url=driver.current_url, title=title,
                      message="登录有效" if online else "登录已失效，需要重新验证")
    finally:
        driver.quit()
    return result

def main():
    state = {"checkedAt": datetime.now().isoformat(timespec="seconds"), "stores": []}
    for store, port, label in STORES:
        try: state["stores"].append(check(store, port, label))
        except Exception as error: state["stores"].append({"store":store,"label":label,"online":False,"message":str(error)})
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(state, ensure_ascii=False))
    return 0 if all(x["online"] for x in state["stores"]) else 1

if __name__ == "__main__": raise SystemExit(main())
