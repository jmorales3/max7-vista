#!/usr/bin/env bash
# Max7 Vista — Self-Hosted LAN Server Startup Script
# Run this from the root of the repository on macOS or Linux.
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

log()   { echo -e "${GREEN}[max7]${RESET} $*"; }
warn()  { echo -e "${YELLOW}[max7]${RESET} $*"; }
error() { echo -e "${RED}[max7]${RESET} $*" >&2; }

echo -e "${BOLD}Max7 Vista — LAN Server Setup${RESET}"
echo "--------------------------------------------"

# ── 1. Node.js ──────────────────────────────────
if ! command -v node &>/dev/null; then
  error "Node.js not found. Install Node 20+ from https://nodejs.org and re-run."
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 20 ]; then
  error "Node.js 20 or later is required. Current version: $(node --version)"
  exit 1
fi
log "Node.js $(node --version) ✓"

# ── 2. pnpm ─────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found — installing via corepack..."
  corepack enable
  corepack prepare pnpm@latest --activate
fi
log "pnpm $(pnpm --version) ✓"

# ── 3. Detect database mode ──────────────────────
#
# Priority:
#   (a) DATABASE_URL is set → PostgreSQL mode
#   (b) DATABASE_URL is absent but psql is on PATH → try to auto-create the DB,
#       then use PostgreSQL mode
#   (c) Neither → SQLite self-host mode (no PostgreSQL needed)
#
USE_SQLITE=false

if [ -n "$DATABASE_URL" ]; then
  log "DATABASE_URL found — using PostgreSQL mode"
elif command -v psql &>/dev/null; then
  warn "DATABASE_URL is not set, but psql is available — attempting to auto-create database"
  # Default to a local database named max7vista
  export DATABASE_URL="postgresql://localhost/max7vista"
  # Build a connection to the maintenance DB to create max7vista if needed
  DB_BASE="postgresql://localhost/postgres"
  EXISTS=$(psql "$DB_BASE" -tAc "SELECT 1 FROM pg_database WHERE datname='max7vista'" 2>/dev/null || echo "")
  if [ "$EXISTS" != "1" ]; then
    log "Creating database 'max7vista'..."
    psql "$DB_BASE" -c "CREATE DATABASE max7vista;" 2>/dev/null && log "Database created ✓" || {
      warn "Could not auto-create database — falling back to SQLite mode"
      USE_SQLITE=true
      unset DATABASE_URL
    }
  else
    log "Database 'max7vista' exists ✓"
  fi
else
  warn "DATABASE_URL is not set and psql is not found — using SQLite self-host mode"
  warn "Data will be stored in ./max7-vista.db (not suitable for multi-user setups)"
  USE_SQLITE=true
fi

# ── 4. Install dependencies ──────────────────────
log "Installing dependencies..."
pnpm install --frozen-lockfile

# ── 5. Database schema ───────────────────────────
if [ "$USE_SQLITE" = "false" ]; then
  log "Applying database schema (PostgreSQL)..."
  pnpm --filter @workspace/db exec drizzle-kit push 2>&1 | tail -10 || {
    warn "Schema push returned non-zero — if this is a first run, ensure the database is reachable."
  }
else
  log "SQLite mode — schema will be created automatically by the server on startup"
fi

# ── 6. Build the web frontend ────────────────────
log "Building web frontend..."
BASE_PATH=/ PORT=3000 pnpm --filter @workspace/patient-images run build

# Copy built frontend into api-server dist-frontend so it is served from
# the same port as the API (static-file middleware in app.ts picks it up).
FRONTEND_DIST="artifacts/patient-images/dist/public"
API_DIST="artifacts/api-server/dist-frontend"
if [ -d "$FRONTEND_DIST" ]; then
  rm -rf "$API_DIST"
  cp -r "$FRONTEND_DIST" "$API_DIST"
  log "Frontend copied to api-server ✓"
fi

# ── 7. Build the API server ──────────────────────
log "Building API server..."
if [ "$USE_SQLITE" = "true" ]; then
  # ELECTRON_BUILD=true makes esbuild alias @workspace/db → sqlite-compat.ts
  ELECTRON_BUILD=true pnpm --filter @workspace/api-server run build
else
  pnpm --filter @workspace/api-server run build
fi

# ── 8. Detect LAN IP ─────────────────────────────
PORT="${PORT:-8080}"
LAN_IP=$(node -e "
  const os = require('os');
  const nets = os.networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of (ifaces ?? [])) {
      if (iface.family === 'IPv4' && !iface.internal) {
        process.stdout.write(iface.address);
        process.exit(0);
      }
    }
  }
" 2>/dev/null)

echo ""
if [ "$USE_SQLITE" = "true" ]; then
  echo -e "${BOLD}Starting server (SQLite mode) on port ${PORT}${RESET}"
else
  echo -e "${BOLD}Starting server (PostgreSQL mode) on port ${PORT}${RESET}"
fi
if [ -n "$LAN_IP" ]; then
  echo -e "${GREEN}┌──────────────────────────────────────────────────┐${RESET}"
  echo -e "${GREEN}│  Web browser : http://${LAN_IP}:${PORT}              │${RESET}"
  echo -e "${GREEN}│  Mobile app  : http://${LAN_IP}:${PORT}              │${RESET}"
  echo -e "${GREEN}│  (enter the Mobile app address in Server Setup)  │${RESET}"
  echo -e "${GREEN}└──────────────────────────────────────────────────┘${RESET}"
fi
echo ""

# ── 9. Start ─────────────────────────────────────
export PORT="${PORT}"
export SESSION_SECRET="${SESSION_SECRET:-$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')}"
if [ "$USE_SQLITE" = "true" ]; then
  export SELF_HOST_SQLITE=true
  export DATABASE_PATH="${DATABASE_PATH:-./max7-vista.db}"
fi

node --enable-source-maps artifacts/api-server/dist/index.mjs
