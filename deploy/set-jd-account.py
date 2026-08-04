from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
import sys, time

port = int(sys.argv[1])
value = sys.argv[2]
options = Options()
options.debugger_address = f"127.0.0.1:{port}"
options.binary_location = "/snap/bin/chromium"
driver = webdriver.Chrome(service=Service("/usr/bin/chromedriver"), options=options)
time.sleep(1)
def find_account_input():
    visible = [element for element in driver.find_elements(By.CSS_SELECTOR, "input") if element.is_displayed()]
    target = next((element for element in visible if element.get_attribute("type") in ("text", "")), None)
    if target is not None:
        return target
    for frame in driver.find_elements(By.CSS_SELECTOR, "iframe"):
        try:
            driver.switch_to.frame(frame)
            target = find_account_input()
            if target is not None:
                return target
            driver.switch_to.parent_frame()
        except Exception:
            driver.switch_to.default_content()
    return None

target = find_account_input()
if target is None:
    raise SystemExit("No visible account input found")
driver.execute_script("""
const element = arguments[0];
const value = arguments[1];
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
setter.call(element, value);
element.dispatchEvent(new Event('input', { bubbles: true }));
element.dispatchEvent(new Event('change', { bubbles: true }));
element.focus();
""", target, value)
print(target.get_attribute("value"))
