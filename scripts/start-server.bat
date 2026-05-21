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

REM ── 3. DATABASE_URL (required) ─────────────────
if not defined DATABASE_URL (
    echo.
    echo [ERROR] DATABASE_URL is not set.
    echo.
    echo   Set it before running this script, for example:
    echo     set DATABASE_URL=postgresql://max7:password@localhost:5432/max7vista
    echo.
    echo   See SELF_HOSTING.md for PostgreSQL setup instructions.
    echo.
    pause
    exit /b 1
)
echo [max7] DATABASE_URL found

REM ── 4. Install dependencies ─────────────────────
echo [max7] Installing dependencies...
pnpm install --frozen-lockfile

REM ── 5. Bootstrap the database ──────────────────
REM Extract DB name from DATABASE_URL and create it if psql is available.
for /f "tokens=*" %%n in ('node -e "try{const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.pathname.replace(/^\//,''));}catch{process.stdout.write('');}"') do set DB_NAME=%%n
for /f "tokens=*" %%b in ('node -e "try{const u=new URL(process.env.DATABASE_URL);u.pathname='/postgres';process.stdout.write(u.toString());}catch{process.stdout.write('');}"') do set DB_BASE=%%b

where psql >nul 2>&1
if not errorlevel 1 (
    if defined DB_NAME (
        echo [max7] Checking for database "%DB_NAME%"...
        for /f "tokens=*" %%e in ('psql "%DB_BASE%" -tAc "SELECT 1 FROM pg_database WHERE datname='%DB_NAME%'" 2^>nul') do set DB_EXISTS=%%e
        if not defined DB_EXISTS (
            echo [max7] Creating database "%DB_NAME%"...
            psql "%DB_BASE%" -c "CREATE DATABASE \"%DB_NAME%\";" >nul 2>&1 && echo [max7] Database created || echo [WARN] Could not auto-create database -- it may already exist
        ) else (
            echo [max7] Database "%DB_NAME%" exists
        )
    )
) else (
    echo [WARN] psql not found -- skipping auto-create. Make sure the database exists.
)

REM Apply schema
echo [max7] Applying database schema...
pnpm --filter @workspace/db exec drizzle-kit push

REM ── 6. Build web frontend ──────────────────────
echo [max7] Building web frontend...
set BASE_PATH=/
call pnpm --filter @workspace/patient-images run build

REM Copy frontend dist to api-server
if exist "artifacts\patient-images\dist\public" (
    if exist "artifacts\api-server\dist-frontend" rd /s /q "artifacts\api-server\dist-frontend"
    xcopy "artifacts\patient-images\dist\public" "artifacts\api-server\dist-frontend" /E /I /Q
    echo [max7] Frontend copied to api-server
)

REM ── 7. Build API server ─────────────────────────
echo [max7] Building API server...
pnpm --filter @workspace/api-server run build

REM ── 8. Detect LAN IP ───────────────────────────
for /f "tokens=*" %%i in ('node -e "const os=require('os');const nets=os.networkInterfaces();for(const ifaces of Object.values(nets)){for(const iface of (ifaces??[])){if(iface.family==='IPv4'&&!iface.internal){process.stdout.write(iface.address);process.exit(0)}}}"') do set LAN_IP=%%i

if not defined PORT set PORT=8080

echo.
echo [max7] Starting server on port %PORT%
if defined LAN_IP (
    echo.
    echo  +--------------------------------------------------+
    echo  ^|  Web browser : http://%LAN_IP%:%PORT%
    echo  ^|  Mobile app  : http://%LAN_IP%:%PORT%
    echo  ^|  ^(enter the Mobile app address in Server Setup^)
    echo  +--------------------------------------------------+
    echo.
)

REM ── 9. Start ────────────────────────────────────
if not defined SESSION_SECRET (
    for /f "tokens=*" %%s in ('node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"') do set SESSION_SECRET=%%s
)

node --enable-source-maps artifacts\api-server\dist\index.mjs
pause
