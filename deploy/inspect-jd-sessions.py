from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

for store, port in (("store1", 9222), ("store2", 9223)):
    options = Options()
    options.debugger_address = f"127.0.0.1:{port}"
    options.binary_location = "/snap/bin/chromium"
    driver = webdriver.Chrome(service=Service("/usr/bin/chromedriver"), options=options)
    print(store, driver.current_url, driver.title, sep="\t")
