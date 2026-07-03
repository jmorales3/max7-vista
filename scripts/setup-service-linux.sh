#!/usr/bin/env bash
# Max7 Vista — Install a systemd service so the server restarts automatically
# when the clinic computer reboots or the process crashes.
#
# Usage: sudo ./scripts/setup-service-linux.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "[max7] This script needs root to write /etc/systemd/system — re-run with sudo:"
  echo "       sudo ./scripts/setup-service-linux.sh"
  exit 1
fi

# Resolve the repo root (this script lives in <repo>/scripts).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# The service must run as the real (non-root) user who owns the repo, so file
# permissions, node_modules, and any local SQLite DB stay writable by them.
SERVICE_USER="${SUDO_USER:-$(logname 2>/dev/null || echo "$USER")}"

UNIT_PATH="/etc/systemd/system/max7vista.service"

echo "[max7] Installing systemd service 'max7vista'"
echo "       Repo:  $REPO_DIR"
echo "       User:  $SERVICE_USER"

cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Max7 Vista Server
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$REPO_DIR
ExecStart=$REPO_DIR/scripts/start-server.sh
Restart=on-failure
RestartSec=5
Environment=PORT=${PORT:-8080}
# Add DATABASE_URL=postgresql://... here for PostgreSQL mode; omit it to use
# the built-in SQLite mode. Edit this file (or /etc/systemd/system/max7vista.service.d/override.conf)
# then run: sudo systemctl daemon-reload && sudo systemctl restart max7vista

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now max7vista

echo ""
echo "[max7] Done. The server will now start automatically on boot and restart if it crashes."
echo "       Check status:  systemctl status max7vista"
echo "       View logs:     journalctl -u max7vista -f"
echo "       Stop:          sudo systemctl stop max7vista"
echo "       Uninstall:     ./scripts/uninstall-service-linux.sh"
