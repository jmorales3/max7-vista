@echo off
REM Max7 Vista -- Quick Start (daily use)
REM Run this after the first setup is done. Starts the server in seconds.

title Max7 Vista
setlocal EnableDelayedExpansion

if not defined PORT set PORT=8080

REM Check that the server has been built at least once
if not exist "artifacts\api-server\dist\index.mjs" (
    echo.
    echo [ERROR] Server has not been built yet.
    echo         Please run scripts\start-server.bat first to do the initial setup.
    echo.
    pause
    exit /b 1
)

REM Detect LAN IP
for /f "tokens=*" %%i in ('node -e "var os=require('os');var nets=os.networkInterfaces();var names=Object.keys(nets);for(var i=0;i<names.length;i++){var ifaces=nets[names[i]]||[];for(var j=0;j<ifaces.length;j++){if(ifaces[j].family==='IPv4'&&!ifaces[j].internal){process.stdout.write(ifaces[j].address);process.exit(0)}}}"') do set LAN_IP=%%i

echo.
echo  Max7 Vista is starting...
echo.
if defined LAN_IP (
    echo  +--------------------------------------------------+
    echo  ^|  Web browser : http://%LAN_IP%:%PORT%
    echo  ^|  Mobile app  : http://%LAN_IP%:%PORT%
    echo  ^|  PC browser  : http://localhost:%PORT%
    echo  ^|  ^(enter Mobile app address in Server Setup^)
    echo  +--------------------------------------------------+
    echo.
)

REM Set environment
if not defined SESSION_SECRET (
    for /f "tokens=*" %%s in ('node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"') do set SESSION_SECRET=%%s
)
set SELF_HOST_SQLITE=true
if not defined DATABASE_PATH set DATABASE_PATH=max7-vista.db

node --enable-source-maps artifacts\api-server\dist\index.mjs
pause
