#!/usr/bin/env python3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timezone
import json, os, subprocess, threading

ROOT = "/srv/cps-data/jd-collector"
TOKEN = os.environ.get("JD_COLLECTOR_TOKEN", "")
state = {"ready": True, "status":"ready", "message":"两个京东店铺均已登录，可以开始同步", "lastRun":None, "stores":2}
lock = threading.Lock()
LOGIN_STATE_FILE = f"{ROOT}/logs/login-state.json"
LOGIN_STATE_MAX_AGE_SECONDS = 20 * 60

def service_active(name): return subprocess.run(["systemctl","is-active","--quiet",name]).returncode == 0
def browsers_ready(): return service_active("jd-browser.service") and service_active("jd-browser-store2.service")

def current_status():
    """Combine task history with the independent, fresh session health check."""
    result = {**state, "store1": service_active("jd-browser.service"), "store2": service_active("jd-browser-store2.service")}
    result["ready"] = result["store1"] and result["store2"] and state.get("ready", False)
    try:
        with open(LOGIN_STATE_FILE, encoding="utf-8") as handle:
            login_state = json.load(handle)
        checked_at = datetime.fromisoformat(login_state["checkedAt"])
        if checked_at.tzinfo is None:
            checked_at = checked_at.replace(tzinfo=timezone.utc)
        fresh = (datetime.now(timezone.utc) - checked_at).total_seconds() <= LOGIN_STATE_MAX_AGE_SECONDS
        stores = login_state.get("stores", [])
        result["loginCheckedAt"] = login_state.get("checkedAt")
        result["loginStores"] = stores
        if fresh and stores:
            offline = [item for item in stores if item.get("status") != "online"]
            if offline:
                result.update(
                    ready=False,
                    status="needs_attention",
                    message="；".join(f"{item.get('label', item.get('store', '店铺'))}：{item.get('message', '需要重新验证')}" for item in offline),
                )
            elif result.get("status") != "running" and "登录已失效" in str(result.get("message", "")):
                result.update(ready=True, status="ready", message="两个京东店铺当前登录有效，可以开始同步")
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        pass
    return result

def start_browsers():
    for name in ("jd-browser.service", "jd-browser-store2.service"):
        if not service_active(name):
            subprocess.run(["sudo", "/bin/systemctl", "start", name], check=True)

def run_export():
    with lock:
        state.update(status="running", message="正在获取两个京东店铺最近30天的有效订单")
        try:
            result = subprocess.run(["/usr/bin/flock","-w","120",f"{ROOT}/logs/browser.lock","/usr/bin/python3",f"{ROOT}/runner.py"],capture_output=True,text=True,timeout=1320)
            state["lastRun"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            if result.returncode == 0:
                payload = json.loads(result.stdout.strip().splitlines()[-1])
                refunded = payload.get("filter", {}).get("refunded", 0)
                state.update(status="completed",ready=True,message=f"同步完成，本次处理 {payload['rows']} 条有效订单，排除退款 {refunded} 条",rows=payload["rows"],refunded=refunded)
            else: state.update(status="needs_attention",ready=browsers_ready(),message=(result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "京东同步失败"))
            open(f"{ROOT}/logs/latest.log","w",encoding="utf-8").write(result.stdout+"\n"+result.stderr)
        except Exception as error: state.update(status="needs_attention",message=str(error))

class Handler(BaseHTTPRequestHandler):
    def reply(self,code,body):
        data=json.dumps(body,ensure_ascii=False).encode(); self.send_response(code); self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Content-Length",str(len(data))); self.end_headers(); self.wfile.write(data)
    def valid(self): return bool(TOKEN) and self.headers.get("X-Collector-Token")==TOKEN
    def do_GET(self):
        if not self.valid(): return self.reply(403,{"error":"forbidden"})
        self.reply(200,current_status())
    def do_POST(self):
        if not self.valid(): return self.reply(403,{"error":"forbidden"})
        if self.path == "/prepare":
            try:
                start_browsers()
                state.update(ready=browsers_ready(), status="ready" if browsers_ready() else "needs_attention",
                             message="两个京东浏览器已恢复，请确认登录状态后开始同步")
                return self.reply(200, state)
            except Exception as error:
                return self.reply(503, {"error":str(error)})
        if self.path=="/start":
            if not browsers_ready(): return self.reply(409,{"error":"两个京东浏览器未全部运行"})
            if state["status"]=="running": return self.reply(409,state)
            threading.Thread(target=run_export,daemon=True).start(); return self.reply(202,{"ready":True,"status":"running","message":"双店同步任务已启动"})
        self.reply(404,{"error":"not found"})

if __name__=="__main__": ThreadingHTTPServer(("127.0.0.1",3210),Handler).serve_forever()
