@echo off
REM Max7 Vista — Self-Hosted LAN Server Startup Script (Windows)
REM Run this from the root of the repository.

title Max7 Vista Server
setlocal EnableDelayedExpansion

REM ── Defaults (set early so they are available to all build steps) ───────────
if not defined PORT set PORT=8080

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

REM ── 3. Detect database mode ─────────────────────
REM Priority:
REM   (a) DATABASE_URL is set  -> PostgreSQL mode
REM   (b) psql is on PATH      -> auto-create max7vista, PostgreSQL mode
REM   (c) neither              -> SQLite self-host mode

set USE_SQLITE=false

if defined DATABASE_URL (
    echo [max7] DATABASE_URL found -- using PostgreSQL mode
    goto :db_ready
)

where psql >nul 2>&1
if errorlevel 1 (
    echo [WARN] DATABASE_URL not set and psql not found -- using SQLite self-host mode
    echo [WARN] Data will be stored in max7-vista.db ^(not suitable for multi-user setups^)
    set USE_SQLITE=true
    goto :db_mode_done
)

REM psql found — try to auto-create database
echo [WARN] DATABASE_URL not set, but psql found -- trying to auto-create 'max7vista'
set DATABASE_URL=postgresql://localhost/max7vista
for /f "tokens=*" %%e in ('psql postgresql://localhost/postgres -tAc "SELECT 1 FROM pg_database WHERE datname='"'"'max7vista'"'"'" 2^>nul') do set DB_EXISTS=%%e
if not defined DB_EXISTS (
    psql postgresql://localhost/postgres -c "CREATE DATABASE max7vista;" >nul 2>&1
    if errorlevel 1 (
        echo [WARN] Could not auto-create database -- falling back to SQLite mode
        set USE_SQLITE=true
        set DATABASE_URL=
    ) else (
        echo [max7] Database 'max7vista' created
    )
) else (
    echo [max7] Database 'max7vista' exists
)

:db_ready
:db_mode_done

REM ── 4. Install dependencies ─────────────────────
echo [max7] Installing dependencies...
pnpm install --frozen-lockfile

REM ── 5. Database schema ──────────────────────────
if "%USE_SQLITE%"=="false" (
    echo [max7] Applying database schema ^(PostgreSQL^)...
    pnpm --filter @workspace/db exec drizzle-kit push
) else (
    echo [max7] SQLite mode -- schema created automatically by the server on startup
)

REM ── 6. Build web frontend ──────────────────────
echo [max7] Building web frontend...
set BASE_PATH=/
call pnpm --filter @workspace/patient-images run build

if exist "artifacts\patient-images\dist\public" (
    if exist "artifacts\api-server\dist-frontend" rd /s /q "artifacts\api-server\dist-frontend"
    xcopy "artifacts\patient-images\dist\public" "artifacts\api-server\dist-frontend" /E /I /Q
    echo [max7] Frontend copied to api-server
)

REM ── 7. Build API server ─────────────────────────
echo [max7] Building API server...
if "%USE_SQLITE%"=="true" (
    REM ELECTRON_BUILD=true makes esbuild alias @workspace/db to sqlite-compat.ts
    set ELECTRON_BUILD=true
    pnpm --filter @workspace/api-server run build
    set ELECTRON_BUILD=
) else (
    pnpm --filter @workspace/api-server run build
)

REM ── 8. Detect LAN IP ───────────────────────────
for /f "tokens=*" %%i in ('node -e "const os=require('os');const nets=os.networkInterfaces();for(const ifaces of Object.values(nets)){for(const iface of (ifaces??[])){if(iface.family==='IPv4'&&!iface.internal){process.stdout.write(iface.address);process.exit(0)}}}"') do set LAN_IP=%%i

echo.
if "%USE_SQLITE%"=="true" (
    echo [max7] Starting server ^(SQLite mode^) on port %PORT%
) else (
    echo [max7] Starting server ^(PostgreSQL mode^) on port %PORT%
)
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
if "%USE_SQLITE%"=="true" (
    set SELF_HOST_SQLITE=true
    if not defined DATABASE_PATH set DATABASE_PATH=max7-vista.db
)

node --enable-source-maps artifacts\api-server\dist\index.mjs
pause
