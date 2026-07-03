#!/usr/bin/env bash
# Max7 Vista — Remove the systemd autostart service installed by
# setup-service-linux.sh.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "[max7] This script needs root — re-run with sudo:"
  echo "       sudo ./scripts/uninstall-service-linux.sh"
  exit 1
fi

systemctl stop max7vista 2>/dev/null || true
systemctl disable max7vista 2>/dev/null || true
rm -f /etc/systemd/system/max7vista.service
systemctl daemon-reload

echo "[max7] Service removed. The server will no longer start automatically on boot."
