from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
import time

options = Options(); options.debugger_address = "127.0.0.1:9222"; options.binary_location = "/snap/bin/chromium"
driver = webdriver.Chrome(service=Service("/usr/bin/chromedriver"), options=options)
date_input = next(x for x in driver.find_elements(By.CSS_SELECTOR, "input.jad-input") if x.is_displayed() and not x.get_attribute("disabled"))
driver.execute_script("arguments[0].click()", date_input); time.sleep(1)
for element in driver.find_elements(By.CSS_SELECTOR, "[class*='date-picker']"):
    if element.is_displayed():
        text = " ".join(element.text.split())
        if text: print(element.tag_name, element.get_attribute("class"), text[:500], sep="\t")
