#!/usr/bin/env python3
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from datetime import date
import json, os, sys, time

port = int(sys.argv[1]); store = sys.argv[2]
download_dir = f"/home/zlq/Downloads/jd-{store}"
os.makedirs(download_dir, exist_ok=True)
o = webdriver.ChromeOptions(); o.add_experimental_option("debuggerAddress", f"127.0.0.1:{port}")
d = webdriver.Chrome(service=Service('/usr/bin/chromedriver'), options=o)
d.execute_cdp_cmd('Page.setDownloadBehavior', {'behavior':'allow','downloadPath':download_dir})
w = WebDriverWait(d, 20)
if '#/order-detail' not in d.current_url: d.get('https://jzt.jd.com/jtk/#/order-detail'); time.sleep(6)

# Open date picker and choose this month's first day and today.
date_input = next(e for e in d.find_elements(By.CSS_SELECTOR, 'input.jad-input') if e.get_attribute('placeholder') == '请选择日期' and not e.get_attribute('disabled'))
if not any(e.is_displayed() for e in d.find_elements(By.CSS_SELECTOR, '.jad-date-picker-default')):
    d.execute_script('arguments[0].click()', date_input); time.sleep(1)
def day(n):
    cells = d.find_elements(By.CSS_SELECTOR, '.jad-date-picker-content-left .jad-date-picker-cell')
    return next(e for e in cells if e.text.strip() == str(n) and 'prev-month' not in e.get_attribute('class') and 'disabled' not in e.get_attribute('class'))
d.execute_script('arguments[0].click()', day(1)); time.sleep(.5)
d.execute_script('arguments[0].click()', day(date.today().day)); time.sleep(1)

# Select valid orders only.
valid = d.find_element(By.XPATH, "//span[contains(@class,'jad-checkbox-label') and contains(.,'仅查看有效订单')]/ancestor::label")
if 'checked' not in valid.get_attribute('class'): d.execute_script('arguments[0].click()', valid)
query = d.find_element(By.XPATH, "//button[contains(@class,'jad-btn-primary') and contains(.,'查询')]")
d.execute_script('arguments[0].click()', query); time.sleep(5)
button = d.find_element(By.CSS_SELECTOR, '.jad-icon-download2').find_element(By.XPATH, '..')
d.execute_script('arguments[0].click()', button); time.sleep(3)
print(json.dumps({'url':d.current_url,'date':date_input.get_attribute('value'),'body':d.find_element(By.TAG_NAME,'body').text[-3000:]}, ensure_ascii=False))
confirms = d.find_elements(By.XPATH, "//button[contains(.,'确定')]")
if confirms: d.execute_script('arguments[0].click()', confirms[-1])
time.sleep(8)
nav = d.find_elements(By.XPATH, "//a[.//span[normalize-space()='下载报表']]")
if nav: d.execute_script('arguments[0].click()', nav[0]); time.sleep(6)
print(json.dumps({'afterUrl':d.current_url,'afterBody':d.find_element(By.TAG_NAME,'body').text[-4000:]}, ensure_ascii=False))
links = d.find_elements(By.CSS_SELECTOR, 'a.blue2.pointer')
if links: d.execute_script('arguments[0].click()', links[0])
time.sleep(8)
print(json.dumps({'files':os.listdir(download_dir)}, ensure_ascii=False))
