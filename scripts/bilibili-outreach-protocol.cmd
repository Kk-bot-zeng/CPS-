@echo off
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node"
set "NODE_PATH=%BUNDLED_NODE%\node_modules"
start "雷鸟B站建联助手" /min "%BUNDLED_NODE%\bin\node.exe" "%~dp0bilibili-outreach.mjs" "%~1"
