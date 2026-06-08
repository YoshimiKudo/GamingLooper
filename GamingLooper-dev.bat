@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo node_modules was not found.
  echo Run npm.cmd install first.
  pause
  exit /b 1
)

echo Checking GamingLooper renderer on http://127.0.0.1:5173 ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5173' -TimeoutSec 2; if ($r.StatusCode -eq 200 -and $r.Content -like '*<title>GamingLooper</title>*') { exit 0 }; if ($r.StatusCode -eq 200) { exit 2 } } catch { exit 1 }"

if errorlevel 2 (
  echo Port 5173 is already used by another app.
  echo Close that server, then run this file again.
  pause
  exit /b 1
)

if errorlevel 1 (
  echo Starting renderer server...
  start "GamingLooper Renderer" /D "%~dp0" cmd /k "call npm.cmd run dev:renderer"
  echo Waiting for renderer...
  call ".\node_modules\.bin\wait-on.cmd" tcp:5173
) else (
  echo Renderer is already running.
)

echo Starting GamingLooper...
call npm.cmd run dev:electron

echo.
echo GamingLooper dev session ended.
pause
