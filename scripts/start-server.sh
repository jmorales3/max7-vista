#!/usr/bin/env bash
# Max7 Vista — Self-Hosted LAN Server Startup Script
# Run this from the root of the repository on macOS or Linux.
set -e

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

# ── 3. DATABASE_URL (required) ──────────────────
if [ -z "$DATABASE_URL" ]; then
  error "DATABASE_URL is not set."
  echo ""
  echo "  Set it before running this script, for example:"
  echo "    export DATABASE_URL=postgresql://max7:password@localhost:5432/max7vista"
  echo ""
  echo "  See SELF_HOSTING.md for PostgreSQL setup instructions."
  exit 1
fi
log "DATABASE_URL ✓"

# ── 4. Install dependencies ──────────────────────
log "Installing dependencies..."
pnpm install --frozen-lockfile 2>&1 | tail -5

# ── 5. Bootstrap the database ───────────────────
# Parse the DB name from DATABASE_URL and create it if it doesn't exist.
# psql is optional: if absent we skip creation and just try the push.
DB_NAME=$(node -e "try { const u = new URL(process.env.DATABASE_URL); process.stdout.write(u.pathname.replace(/^\\//, '')); } catch { process.stdout.write(''); }")
if [ -n "$DB_NAME" ] && command -v psql &>/dev/null; then
  # Build a connection string that targets the maintenance 'postgres' DB
  DB_BASE=$(node -e "try { const u = new URL(process.env.DATABASE_URL); u.pathname = '/postgres'; process.stdout.write(u.toString()); } catch { process.stdout.write(''); }")
  if [ -n "$DB_BASE" ]; then
    EXISTS=$(psql "$DB_BASE" -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null || echo "")
    if [ "$EXISTS" != "1" ]; then
      log "Creating database '${DB_NAME}'..."
      psql "$DB_BASE" -c "CREATE DATABASE \"${DB_NAME}\";" 2>/dev/null && log "Database created ✓" || warn "Could not auto-create database — it may already exist"
    else
      log "Database '${DB_NAME}' exists ✓"
    fi
  fi
else
  warn "psql not found — skipping auto-create database. Make sure '${DB_NAME}' exists before continuing."
fi

# Apply schema (Drizzle push)
log "Applying database schema..."
pnpm --filter @workspace/db exec drizzle-kit push 2>&1 | tail -10 || {
  warn "Schema push returned non-zero. If this is a first run, make sure the database exists."
}

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
pnpm --filter @workspace/api-server run build

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
echo -e "${BOLD}Starting server on port ${PORT}${RESET}"
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
node --enable-source-maps artifacts/api-server/dist/index.mjs
