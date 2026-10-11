@echo off
REM Mawatheeq Bridge - keeps running and restarts after errors.
cd /d "%~dp0"
if not exist node_modules call npm ci --omit=dev
:loop
node mawatheeq-bridge.mjs
echo Bridge stopped. Restarting in 10 seconds...
timeout /t 10 /nobreak >nul
goto loop
