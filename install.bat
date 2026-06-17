@echo off
cd /d "e:\Projects\MFData"

echo Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js is not installed.
  echo Please install from https://nodejs.org
  start https://nodejs.org
  pause
  exit
)

echo Installing dependencies...
call npm install --registry=https://registry.npmmirror.com

echo Installation complete!
echo Double-click MFData on desktop to launch.
pause
