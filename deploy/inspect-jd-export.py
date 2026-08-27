#!/usr/bin/env python3
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
import json, sys, time

port = int(sys.argv[1] if len(sys.argv) > 1 else 9222)
options = webdriver.ChromeOptions()
options.add_experimental_option("debuggerAddress", f"127.0.0.1:{port}")
driver = webdriver.Chrome(service=Service("/usr/bin/chromedriver"), options=options)
time.sleep(2)
script = r"""
const nodes = [...document.querySelectorAll('button,a,i,svg,span,div')];
return nodes.map((e, i) => ({
  i, tag:e.tagName, text:(e.innerText||e.textContent||'').trim().replace(/\s+/g,' ').slice(0,100),
  cls:typeof e.className==='string'?e.className:(e.className&&e.className.baseVal)||'',
  title:e.getAttribute('title')||'', aria:e.getAttribute('aria-label')||''
})).filter(x => /导出|下载|export|download/i.test(`${x.text} ${x.cls} ${x.title} ${x.aria}`)).slice(0,300)
"""
print(json.dumps({"url": driver.current_url, "title": driver.title,
                  "candidates": driver.execute_script(script),
                  "downloadParents": driver.execute_script("return [...document.querySelectorAll('.jad-icon-download2')].map(e => e.parentElement.outerHTML)"),
                  "downloadTexts": driver.execute_script("return [...document.querySelectorAll('*')].filter(e => e.children.length===0 && e.textContent.trim()==='下载').map(e=>e.outerHTML)"),
                  "checkboxes": driver.execute_script("return [...document.querySelectorAll('input[type=checkbox]')].map(e=>({checked:e.checked,disabled:e.disabled,html:e.parentElement.parentElement.outerHTML.slice(0,1000)}))")}, ensure_ascii=False, indent=2))
