#!/usr/bin/env bash
set -euo pipefail

ROOT=/srv/cps-data/jd-collector
STORE_ID=${STORE_ID:-store1}
PROFILE=/home/zlq/snap/chromium/common/jd-collector-${STORE_ID}-profile
DISPLAY=${DISPLAY:-:99}
VNC_PORT=${VNC_PORT:-5901}
NOVNC_PORT=${NOVNC_PORT:-6080}
DEBUG_PORT=${DEBUG_PORT:-9222}
export DISPLAY

cleanup() {
  kill "${BROWSER_PID:-}" "${VNC_PID:-}" "${NOVNC_PID:-}" "${XVFB_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

Xvfb "$DISPLAY" -screen 0 1440x960x24 -nolisten tcp -ac &
XVFB_PID=$!
sleep 1
x11vnc -display "$DISPLAY" -localhost -forever -shared -noxkb \
  -rfbauth "$ROOT/config/vnc.pass" -rfbport "$VNC_PORT" &
VNC_PID=$!
websockify --web /usr/share/novnc "127.0.0.1:${NOVNC_PORT}" "127.0.0.1:${VNC_PORT}" &
NOVNC_PID=$!

/usr/bin/chromium-browser \
  --user-data-dir="$PROFILE" \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port="$DEBUG_PORT" \
  --no-first-run --no-default-browser-check --disable-gpu \
  --window-size=1440,960 "https://jzt.jd.com/jtk/#/order-detail" &
BROWSER_PID=$!
wait "$BROWSER_PID"
