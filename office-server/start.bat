@echo off
rem Starts (or updates) the Mawatheeq office server. Double-click, or run from this folder.
cd /d "%~dp0"
if not exist .env docker run --rm -v "%cd%:/work" -w /work node:22-alpine node tools/setup-env.mjs
if not exist data\files mkdir data\files
if not exist data\bridge mkdir data\bridge
if not exist backups mkdir backups
set PROFILES=
findstr /r /c:"^BRIDGE_KEY=..*" .env >nul && set PROFILES=--profile bridge
docker compose %PROFILES% up -d --build --remove-orphans
if errorlevel 1 (
  echo.
  echo Could not start. Make sure Docker Desktop is running, then try again.
  pause
  exit /b 1
)
echo.
echo Mawatheeq is running. Open http://localhost:8080 on this computer, or http://THIS-COMPUTER-IP:8080 from other computers.
echo First time only: create the owner account with:  docker compose run --rm admin
pause
