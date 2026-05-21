@echo off
REM Max7 Vista — Self-Hosted LAN Server Startup Script (Windows)
REM Run this from the root of the repository.

title Max7 Vista Server

echo.
echo ============================================
echo  Max7 Vista -- LAN Server Setup (Windows)
echo ============================================
echo.

REM ── 1. Node.js ─────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node 20+ from https://nodejs.org and re-run.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo [max7] Node.js %NODE_VERSION% found

REM ── 2. pnpm ────────────────────────────────────
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [max7] pnpm not found -- installing via corepack...
    corepack enable
    corepack prepare pnpm@latest --activate
)

for /f "tokens=*" %%v in ('pnpm --version') do set PNPM_VERSION=%%v
echo [max7] pnpm %PNPM_VERSION% found

REM ── 3. Install dependencies ─────────────────────
echo [max7] Installing dependencies...
pnpm install --frozen-lockfile

REM ── 4. Build web frontend ──────────────────────
echo [max7] Building web frontend...
set BASE_PATH=/
set PORT_BUILD=3000
call pnpm --filter @workspace/patient-images run build

REM Copy frontend dist to api-server
if exist "artifacts\patient-images\dist\public" (
    if exist "artifacts\api-server\dist-frontend" rd /s /q "artifacts\api-server\dist-frontend"
    xcopy "artifacts\patient-images\dist\public" "artifacts\api-server\dist-frontend" /E /I /Q
    echo [max7] Frontend copied to api-server
)

REM ── 5. Build API server ─────────────────────────
echo [max7] Building API server...
pnpm --filter @workspace/api-server run build

REM ── 6. Detect LAN IP ───────────────────────────
for /f "tokens=*" %%i in ('node -e "const os=require('os');const nets=os.networkInterfaces();for(const ifaces of Object.values(nets)){for(const iface of ifaces){if(iface.family==='IPv4'&&!iface.internal){process.stdout.write(iface.address);process.exit(0)}}}"') do set LAN_IP=%%i

if not defined PORT set PORT=8080

echo.
echo [max7] Server starting on port %PORT%
if defined LAN_IP (
    echo.
    echo  +----------------------------------------------+
    echo  ^|  Web browser:  http://%LAN_IP%:%PORT%
    echo  ^|  Mobile app:   http://%LAN_IP%:%PORT%
    echo  ^|  (enter the Mobile app address in Server Setup)
    echo  +----------------------------------------------+
    echo.
)

REM ── 7. Start ────────────────────────────────────
if not defined SESSION_SECRET (
    for /f "tokens=*" %%s in ('node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"') do set SESSION_SECRET=%%s
)

node --enable-source-maps artifacts\api-server\dist\index.mjs
pause
