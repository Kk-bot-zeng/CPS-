#!/usr/bin/env python3
"""JD export worker.

This is intentionally conservative: it reuses a verified browser session,
opens the JD order page and refuses to continue when JD asks for verification.
Selectors are kept here rather than in the CPS application so JD UI changes
are isolated from the business system.
"""
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import sys, time

ORDER_URL = "https://jzt.jd.com/jtk/#/order-detail"

def click_first(driver, selectors):
    for selector in selectors:
        found = driver.find_elements(By.XPATH, selector)
        if found:
            driver.execute_script("arguments[0].click()", found[0]); return True
    return False

def main():
    options = webdriver.ChromeOptions(); options.add_argument("--window-size=1440,1000")
    driver = webdriver.Remote("http://127.0.0.1:4444/wd/hub", options=options)
    try:
        driver.get(ORDER_URL)
        time.sleep(6)
        if any(x in driver.current_url.lower() for x in ("login", "passport", "captcha")):
            print("JD verification required", file=sys.stderr); return 2
        # JD page controls change periodically. The supported selectors below
        # are intentionally limited to querying and exporting the owner data.
        if not click_first(driver, ["//button[contains(.,'查询')]", "//*[@id='queryBtn']"]):
            print("JD query control was not found", file=sys.stderr); return 3
        time.sleep(5)
        if not click_first(driver, ["//*[@title='导出数据']", "//*[@title='导出']", "//*[contains(@class,'export') and not(contains(@class,'disabled'))]"]):
            print("JD export control was not found", file=sys.stderr); return 4
        print("JD export requested")
        return 0
    finally:
        driver.quit()

if __name__ == "__main__": raise SystemExit(main())
