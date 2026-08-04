#!/usr/bin/env python3
"""Private control plane for the isolated JD browser collector.

The service intentionally does not store JD passwords and never attempts to
bypass a captcha.  A persisted browser profile is used after the owner has
completed JD's first interactive verification.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime
import json, os, subprocess, threading

ROOT = "/srv/cps-data/jd-collector"
TOKEN = os.environ.get("JD_COLLECTOR_TOKEN", "")
state = {"ready": False, "status": "not_initialized", "message": "采集浏览器尚未初始化", "lastRun": None}
lock = threading.Lock()

def browser_running():
    result = subprocess.run(["docker", "inspect", "-f", "{{.State.Running}}", "jd-browser"], capture_output=True, text=True)
    return result.returncode == 0 and result.stdout.strip() == "true"

def start_browser():
    if browser_running(): return
    command = [
        "docker", "run", "-d", "--name", "jd-browser", "--restart", "unless-stopped",
        "--shm-size", "2g", "-p", "127.0.0.1:4444:4444", "-p", "127.0.0.1:7900:7900",
        "-v", f"{ROOT}/profile:/home/seluser", "-v", f"{ROOT}/downloads:/home/seluser/Downloads",
        "-e", "SE_VNC_NO_PASSWORD=0", "selenium/standalone-chrome:latest"
    ]
    old = subprocess.run(["docker", "ps", "-aq", "-f", "name=^/jd-browser$"], capture_output=True, text=True).stdout.strip()
    if old:
        subprocess.run(["docker", "start", "jd-browser"], check=True)
    else:
        subprocess.run(command, check=True)

def run_export(payload):
    with lock:
        state.update(status="running", message="正在从京东联盟获取订单数据…")
        # The worker is deliberately a separate process: browser failures
        # cannot take down the CPS web app.
        result = subprocess.run(["/usr/bin/python3", f"{ROOT}/runner.py"], capture_output=True, text=True, timeout=900)
        state["lastRun"] = datetime.now().strftime("%Y-%m-%d %H:%M")
        if result.returncode == 0:
            state.update(status="completed", ready=True, message="京东数据已下载，正在等待系统导入")
        else:
            state.update(status="needs_attention", ready=True, message="京东采集未完成，请检查浏览器登录状态")
        open(f"{ROOT}/logs/latest.log", "w", encoding="utf-8").write(result.stdout + "\n" + result.stderr)

class Handler(BaseHTTPRequestHandler):
    def reply(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def valid(self): return bool(TOKEN) and self.headers.get("X-Collector-Token") == TOKEN
    def do_GET(self):
        if not self.valid(): return self.reply(403, {"error": "forbidden"})
        self.reply(200, {**state, "ready": browser_running() and state["ready"]})
    def do_POST(self):
        if not self.valid(): return self.reply(403, {"error": "forbidden"})
        if self.path == "/prepare":
            try:
                start_browser(); state.update(ready=False, status="needs_verification", message="浏览器已准备好，请完成一次京东验证")
                return self.reply(200, state)
            except Exception as error: return self.reply(503, {"error": str(error)})
        if self.path == "/start":
            if not browser_running(): return self.reply(409, {"error": "请先初始化并完成京东验证"})
            if state["status"] == "running": return self.reply(409, state)
            threading.Thread(target=run_export, args=({},), daemon=True).start()
            return self.reply(202, {"ready": True, "status": "running", "message": "京东数据同步任务已启动"})
        self.reply(404, {"error": "not found"})

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 3210), Handler).serve_forever()
