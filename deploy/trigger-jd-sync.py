#!/usr/bin/env python3
import json, os, urllib.request
action = os.sys.argv[1] if len(os.sys.argv) > 1 else "start"
method = "GET" if action == "status" else "POST"
path = "/status" if action == "status" else f"/{action}"
request = urllib.request.Request(f"http://127.0.0.1:3210{path}", method=method,
    headers={"X-Collector-Token":os.environ["JD_COLLECTOR_TOKEN"]})
print(urllib.request.urlopen(request).read().decode())
