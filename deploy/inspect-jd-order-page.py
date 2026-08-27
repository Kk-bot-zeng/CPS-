from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

options = Options()
options.debugger_address = "127.0.0.1:9222"
options.binary_location = "/snap/bin/chromium"
driver = webdriver.Chrome(service=Service("/usr/bin/chromedriver"), options=options)
print("INPUTS")
for i, element in enumerate(driver.find_elements(By.CSS_SELECTOR, "input")):
    if element.is_displayed():
        print(i, element.get_attribute("type"), element.get_attribute("placeholder"), element.get_attribute("value"), element.get_attribute("class"), sep="\t")
print("BUTTONS")
for i, element in enumerate(driver.find_elements(By.CSS_SELECTOR, "button,a")):
    if element.is_displayed():
        text = " ".join(element.text.split())
        title = element.get_attribute("title") or ""
        if text or title:
            print(i, text[:80], title[:80], element.get_attribute("class")[:100], sep="\t")
print("MATCHES")
for selector in ("[title]", "label", "[class*='export']", "[class*='download']", "[class*='checkbox']"):
    for element in driver.find_elements(By.CSS_SELECTOR, selector):
        if element.is_displayed():
            text = " ".join(element.text.split())
            title = element.get_attribute("title") or ""
            if text or title:
                print(selector, text[:100], title[:100], element.get_attribute("class")[:120], sep="\t")
