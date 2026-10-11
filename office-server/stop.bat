@echo off
cd /d "%~dp0"
docker compose --profile bridge stop
echo Mawatheeq stopped. Data is kept.
pause
