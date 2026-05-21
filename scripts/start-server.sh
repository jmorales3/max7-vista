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

# ── 3. Install dependencies ──────────────────────
log "Installing dependencies..."
pnpm install --frozen-lockfile 2>&1 | tail -5

# ── 4. Build the web frontend ────────────────────
log "Building web frontend..."
BASE_PATH=/ PORT=3000 pnpm --filter @workspace/patient-images run build

# Copy built frontend into api-server dist-frontend so it's served from
# the same port as the API.
FRONTEND_DIST="artifacts/patient-images/dist/public"
API_DIST="artifacts/api-server/dist-frontend"
if [ -d "$FRONTEND_DIST" ]; then
  rm -rf "$API_DIST"
  cp -r "$FRONTEND_DIST" "$API_DIST"
  log "Frontend copied to api-server ✓"
fi

# ── 5. Build the API server ──────────────────────
log "Building API server..."
pnpm --filter @workspace/api-server run build

# ── 6. Database setup ────────────────────────────
if [ -n "$DATABASE_URL" ]; then
  log "Applying database schema (PostgreSQL)..."
  pnpm --filter @workspace/db run push 2>/dev/null || \
    pnpm -C lib/db exec drizzle-kit push --config drizzle.config.ts 2>/dev/null || \
    warn "Schema push skipped — run manually if this is the first start"
else
  log "DATABASE_URL not set — using SQLite (Electron mode)"
  export ELECTRON_MODE=true
fi

# ── 7. Detect LAN IP ─────────────────────────────
PORT="${PORT:-8080}"
LAN_IP=$(node -e "
  const os = require('os');
  const nets = os.networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        process.stdout.write(iface.address);
        process.exit(0);
      }
    }
  }
" 2>/dev/null)

echo ""
echo -e "${BOLD}Server starting on port ${PORT}${RESET}"
if [ -n "$LAN_IP" ]; then
  echo -e "${GREEN}┌──────────────────────────────────────────────┐${RESET}"
  echo -e "${GREEN}│  Web browser:  http://${LAN_IP}:${PORT}           │${RESET}"
  echo -e "${GREEN}│  Mobile app:   http://${LAN_IP}:${PORT}           │${RESET}"
  echo -e "${GREEN}│  (enter the Mobile app address in Server Setup)│${RESET}"
  echo -e "${GREEN}└──────────────────────────────────────────────┘${RESET}"
fi
echo ""

# ── 8. Start ─────────────────────────────────────
export PORT="${PORT}"
export SESSION_SECRET="${SESSION_SECRET:-$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')}"
node --enable-source-maps artifacts/api-server/dist/index.mjs
