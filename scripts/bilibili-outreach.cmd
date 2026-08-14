@echo off
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node"
if not exist "%BUNDLED_NODE%\bin\node.exe" (
  echo Browser automation runtime was not found.
  pause
  exit /b 1
)
set "NODE_PATH=%BUNDLED_NODE%\node_modules"
"%BUNDLED_NODE%\bin\node.exe" "%~dp0bilibili-outreach.mjs" %*
