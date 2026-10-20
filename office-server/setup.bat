@echo off
rem One-click setup of the Mawatheeq office server. Installs Docker Desktop if it is missing, starts the server,
rem brings over the online data (or creates the owner account the first time) and opens the app.
rem Safe to run again at any time: a server that already has accounts is only started and updated.
setlocal EnableExtensions
cd /d "%~dp0"
title Mawatheeq office server setup

echo.
echo [1/5] Checking Docker...
where docker >nul 2>&1
if not errorlevel 1 goto docker_installed
echo Docker Desktop is not installed on this computer.
where winget >nul 2>&1
if errorlevel 1 goto docker_manual
choice /c YN /m "Install Docker Desktop now"
if errorlevel 2 goto docker_manual
winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto docker_manual
echo.
echo Docker Desktop is installed. Restart the computer, open Docker Desktop once and accept its terms,
echo then double-click setup.bat again to continue.
pause
exit /b 0

:docker_manual
echo Download and install Docker Desktop from https://www.docker.com/products/docker-desktop/
echo then restart the computer and double-click setup.bat again.
pause
exit /b 1

:docker_installed
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
echo Starting Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a tries=0
:wait_docker
timeout /t 5 /nobreak >nul
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
set /a tries+=1
if %tries% lss 36 goto wait_docker
echo Docker Desktop did not start. Open it from the Start menu, wait until it says it is running,
echo then double-click setup.bat again.
pause
exit /b 1

:docker_ready
echo.
echo [2/5] Starting the server. The first time takes several minutes...
if not exist .env docker run --rm -v "%cd%:/work" -w /work node:22-alpine node tools/setup-env.mjs
if not exist .env goto failed
if not exist data\files mkdir data\files
if not exist data\bridge mkdir data\bridge
if not exist backups mkdir backups
set "PORT=8080"
for /f "tokens=2 delims==" %%p in ('findstr /b /c:"HTTP_PORT=" .env') do set "PORT=%%p"
set PROFILES=
findstr /r /c:"^BRIDGE_KEY=..*" .env >nul && set PROFILES=--profile bridge
docker compose %PROFILES% up -d --build --remove-orphans
if errorlevel 1 goto failed

echo.
echo [3/5] Checking accounts...
set ACCOUNTS=
for /f %%n in ('docker compose exec -T db psql -U postgres -d mawatheeq -tAc "select count(*) from mawatheeq_private.accounts"') do set "ACCOUNTS=%%n"
if not defined ACCOUNTS goto failed
if not "%ACCOUNTS%"=="0" goto already_set_up

echo This server has no accounts yet. Choose how to start:
echo   1 = Bring over everything from the online Mawatheeq: users, passwords, cases and files
echo   2 = Start empty and create the owner account
choice /c 12 /m "Your choice"
if errorlevel 2 goto fresh

:import
set "SUPABASE_URL="
for /f "usebackq delims=" %%u in (`powershell -NoProfile -Command "(Get-Content -Raw '..\public\app-config.json' | ConvertFrom-Json).supabaseUrl"`) do set "SUPABASE_URL=%%u"
if not defined SUPABASE_URL goto failed
echo.
echo Two values from the Supabase dashboard are needed. They are used for this import only and are not saved.
echo   Connection link: Connect, then Session pooler. Copy it and replace [YOUR-PASSWORD] with the database password.
echo   Secret key: Project Settings, then API Keys, then Secret keys.
echo.
set "SUPABASE_DB_URL="
set "SUPABASE_SECRET_KEY="
set /p "SUPABASE_DB_URL=Paste the connection link and press Enter: "
set /p "SUPABASE_SECRET_KEY=Paste the secret key and press Enter: "
if not defined SUPABASE_DB_URL goto import_failed
if not defined SUPABASE_SECRET_KEY goto import_failed
echo.
echo [4/5] Bringing over the online data...
docker compose run --rm import
if errorlevel 1 goto import_failed
set "SUPABASE_DB_URL="
set "SUPABASE_SECRET_KEY="
echo Sign in with your usual username and password.
goto firewall

:fresh
echo.
echo [4/5] Creating the owner account...
docker compose run --rm admin
if errorlevel 1 goto failed
goto firewall

:already_set_up
echo This server already has %ACCOUNTS% account(s): nothing to import. It has been started and updated.

:firewall
rem Other office computers reach the app on this port; adding the rule needs administrator rights.
net session >nul 2>&1
if errorlevel 1 goto firewall_hint
netsh advfirewall firewall show rule name="Mawatheeq" >nul 2>&1
if errorlevel 1 netsh advfirewall firewall add rule name="Mawatheeq" dir=in action=allow protocol=TCP localport=%PORT% profile=private,domain >nul
goto done

:firewall_hint
echo.
echo To let other office computers open the app, right-click setup.bat and choose "Run as administrator" once,
echo or allow port %PORT% in Windows Firewall.

:done
echo.
echo [5/5] Mawatheeq is running.
echo   On this computer: http://localhost:%PORT%
echo   From other office computers, use one of these addresses:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback' } | ForEach-Object { '    http://' + $_.IPAddress + ':%PORT%' }"
echo.
echo Tip: in Docker Desktop, Settings, General, tick "Start Docker Desktop when you sign in"
echo so the server comes back by itself after a restart.
start "" "http://localhost:%PORT%"
pause
exit /b 0

:import_failed
set "SUPABASE_DB_URL="
set "SUPABASE_SECRET_KEY="
echo.
echo The import did not finish. Check that the connection link has the real database password in it
echo and that the secret key is complete, then double-click setup.bat again.
echo If it stopped after the records were copied, repeat the whole import with:  docker compose run --rm -e FORCE=1 import
pause
exit /b 1

:failed
echo.
echo Setup stopped. Make sure Docker Desktop is running, then double-click setup.bat again.
echo If it stops again, send the messages above to whoever looks after Mawatheeq.
pause
exit /b 1
