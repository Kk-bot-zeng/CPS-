#!/usr/bin/env python3
"""Export both persisted JD sessions and upsert their valid orders into CPS."""
from datetime import datetime
from pathlib import Path
import csv, json, os, re, shutil, sys, time, uuid

import psycopg2
from psycopg2.extras import Json
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By

ORDER_URL = "https://jzt.jd.com/jtk/#/order-detail"
STORES = (("store1", 9222, "京东店铺1"), ("store2", 9223, "京东店铺2"))
ARCHIVE = Path("/srv/cps-data/jd-collector/downloads")
MAPPING_FILE = Path("/srv/cps-data/jd-collector/config/jd-mappings.json")
# These are combination/accessory SKUs and never represent a television model.
EXCLUDED_SKUS = {"100099000000", "100135000000", "100153327609", "100144531546", "100144531526", "100144531514"}
SKU_OVERRIDES = {"100200856802": "32雀4 25款", "100200856804": "32雀4 25款"}

def attach(port):
    options = webdriver.ChromeOptions()
    options.add_experimental_option("debuggerAddress", f"127.0.0.1:{port}")
    log = open(f"/srv/cps-data/jd-collector/logs/chromedriver-{port}.log", "a", encoding="utf-8")
    return webdriver.Chrome(service=Service("/usr/bin/chromedriver", log_output=log), options=options)

def click(driver, element): driver.execute_script("arguments[0].click()", element)

def wait_for(driver, selector, seconds=30):
    end = time.time() + seconds
    while time.time() < end:
        items = [e for e in driver.find_elements(By.CSS_SELECTOR, selector) if e.is_displayed()]
        if items: return items[0]
        time.sleep(.5)
    raise RuntimeError(f"页面控件加载超时: {selector}")

def export_store(store, port, label):
    driver = attach(port)
    if "#/order-detail" not in driver.current_url:
        driver.get(ORDER_URL); time.sleep(6)
    if any(x in driver.current_url.lower() for x in ("login", "passport", "captcha")):
        raise RuntimeError(f"{label} 登录已失效，请重新验证")

    date_input = next(e for e in driver.find_elements(By.CSS_SELECTOR, "input.jad-input")
                      if e.get_attribute("placeholder") == "请选择日期" and not e.get_attribute("disabled"))
    click(driver, date_input); time.sleep(1)
    shortcuts = driver.find_elements(By.XPATH, "//*[contains(@class,'date-picker-shortcut') and contains(.,'最近30天')]//*[normalize-space()='最近30天'] | //*[contains(@class,'date-picker-shortcut') and normalize-space()='最近30天']")
    if not shortcuts: shortcuts = driver.find_elements(By.XPATH, "//*[normalize-space()='最近30天']")
    if not shortcuts: raise RuntimeError(f"{label} 未找到日期快捷选项")
    click(driver, shortcuts[-1]); time.sleep(1)

    valid = driver.find_element(By.XPATH, "//span[contains(@class,'jad-checkbox-label') and contains(.,'仅查看有效订单')]/ancestor::label")
    if "checked" not in valid.get_attribute("class"): click(driver, valid)
    click(driver, driver.find_element(By.XPATH, "//button[contains(@class,'jad-btn-primary') and contains(.,'查询')]"))
    time.sleep(5)

    home_dir = Path(f"/home/zlq/Downloads/jd-{store}")
    home_dir.mkdir(parents=True, exist_ok=True)
    for old in home_dir.glob("*"): old.unlink() if old.is_file() else None
    driver.execute_cdp_cmd("Page.setDownloadBehavior", {"behavior":"allow", "downloadPath":str(home_dir)})
    click(driver, wait_for(driver, ".jad-icon-download2").find_element(By.XPATH, "..")); time.sleep(5)
    # The generation dialog is informational; opening the report list is more reliable than its timer.
    nav = driver.find_elements(By.XPATH, "//a[.//span[normalize-space()='下载报表']]")
    if not nav: raise RuntimeError(f"{label} 未找到下载报表页面")
    click(driver, nav[0]); time.sleep(6)
    links = driver.find_elements(By.CSS_SELECTOR, "a.blue2.pointer")
    if not links: raise RuntimeError(f"{label} 报表尚未生成")
    click(driver, links[0])
    end = time.time() + 60
    result = None
    while time.time() < end:
        ready = [p for p in home_dir.glob("*.csv") if not p.name.endswith(".crdownload")]
        if ready: result = max(ready, key=lambda p: p.stat().st_mtime); break
        time.sleep(1)
    if not result: raise RuntimeError(f"{label} 报表下载超时")
    target_dir = ARCHIVE / store; target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{datetime.now():%Y%m%d-%H%M%S}-{result.name}"
    shutil.copy2(result, target)
    return target

def text(value): return "" if value is None else str(value).strip()
def key(value):
    value = text(value)
    return value[:-2] if value.endswith(".0") else value

def load_mappings():
    if not MAPPING_FILE.exists(): raise RuntimeError("缺少京东匹配配置")
    configured = json.loads(MAPPING_FILE.read_text(encoding="utf-8"))
    plans = set(configured["plans"])
    skus = {sku: name for sku, name in configured["skus"].items() if sku not in EXCLUDED_SKUS}
    skus.update(SKU_OVERRIDES)
    alliances = configured["alliances"]
    return plans, skus, alliances

def read_rows(path, store, label, mappings):
    plans, skus, alliances = mappings
    rows = []
    stats = {"valid": 0, "plan": 0, "sku": 0, "alliance": 0, "kept": 0}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for raw in csv.DictReader(handle):
            if raw.get("是否有效", "").strip() != "有效": continue
            stats["valid"] += 1
            plan = raw.get("所属计划/活动", "").strip()
            if plan not in plans: stats["plan"] += 1; continue
            order_no = raw.get("订单编号", "").strip().strip("\t")
            sku = raw.get("商品编号", "").strip()
            model = skus.get(sku)
            if not model: stats["sku"] += 1; continue
            product = raw.get("SKU名称", "").strip()
            talent = raw.get("推客pin", "").strip() or "-"
            alliance_id = next((value for value in re.findall(r"\((\d+)\)", talent) if value in alliances), None)
            if not alliance_id: stats["alliance"] += 1; continue
            qty = max(1, int(float(raw.get("商品数量") or 1)))
            rows.append({"platform":"jd", "source_key":f"{store}:{order_no}:{sku}",
                "order_no":order_no, "external_product_id":sku or None, "merchant_code":sku or None,
                "quantity":qty, "paid_at":raw.get("下单日期"), "order_status":raw.get("订单状态") or "未知",
                "payable_amount":float(raw.get("计佣金额") or 0), "talent_name_raw":alliances[alliance_id],
                "is_talent":True, "product_name_raw":product or None, "model_name":model,
                "source_payload":Json({**raw, "店铺":label, "联盟ID":alliance_id, "团长名称":alliances[alliance_id], "推广名":model})})
            stats["kept"] += 1
    return rows, stats

def import_rows(files):
    dsn = os.environ.get("DATABASE_URL")
    if not dsn: raise RuntimeError("采集服务未配置数据库连接")
    mappings = load_mappings(); all_rows = []; stats = {"valid":0,"plan":0,"sku":0,"alliance":0,"kept":0}
    for store, label, path in files:
        rows, report = read_rows(path, store, label, mappings); all_rows.extend(rows)
        for name, value in report.items(): stats[name] += value
    conn = psycopg2.connect(dsn)
    try:
        with conn, conn.cursor() as cur:
            job_id = str(uuid.uuid4())
            # The owner requested that all unmatched JD rows are discarded, not stored for later review.
            cur.execute("delete from orders where platform='jd'")
            cur.execute("delete from import_jobs where channel='jd'")
            cur.execute("insert into import_jobs(id,channel,file_name,status,total_rows,created_at) values(%s,'jd',%s,'processing',%s,now())", (job_id, "京东双店自动同步", len(all_rows)))
            sql = """insert into orders(platform,source_key,order_no,external_product_id,merchant_code,quantity,paid_at,order_status,payable_amount,talent_name_raw,is_talent,product_name_raw,model_name,import_job_id,source_payload,updated_at)
              values(%(platform)s,%(source_key)s,%(order_no)s,%(external_product_id)s,%(merchant_code)s,%(quantity)s,%(paid_at)s,%(order_status)s,%(payable_amount)s,%(talent_name_raw)s,%(is_talent)s,%(product_name_raw)s,%(model_name)s,%(import_job_id)s,%(source_payload)s,now())
              on conflict(platform,source_key) do update set quantity=excluded.quantity,paid_at=excluded.paid_at,order_status=excluded.order_status,payable_amount=excluded.payable_amount,talent_name_raw=excluded.talent_name_raw,is_talent=excluded.is_talent,product_name_raw=excluded.product_name_raw,model_name=excluded.model_name,import_job_id=excluded.import_job_id,source_payload=excluded.source_payload,updated_at=now()"""
            for row in all_rows: row["import_job_id"] = job_id; cur.execute(sql, row)
            cur.execute("update import_jobs set status='completed',inserted_rows=%s,completed_at=now() where id=%s", (len(all_rows), job_id))
        return len(all_rows), job_id, stats
    finally: conn.close()

def main():
    exported = []
    for store, port, label in STORES:
        print(f"[{label}] 正在导出", flush=True)
        exported.append((store, label, export_store(store, port, label)))
    count, job, stats = import_rows(exported)
    print(json.dumps({"ok":True, "stores":2, "rows":count, "jobId":job,
                      "filter":stats, "files":[str(x[2]) for x in exported]}, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    try: raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr); raise
