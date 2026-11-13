@echo off
REM Mawatheeq Files: lets the Files page of Mawatheeq work in any browser. Keep this window open.
chcp 65001 >nul
cd /d "%~dp0"
where node >/dev/null 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org then run this file again.
  pause
  exit /b 1
)
:loop
node mawatheeq-files.mjs
if %errorlevel%==3 (
  echo Mawatheeq Files is already running on this computer.
  pause
  exit /b 0
)
echo Mawatheeq Files stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
