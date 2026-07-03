#!/usr/bin/env bash
# Max7 Vista — Remove the launchd agent installed by setup-service-macos.sh.
set -euo pipefail

PLIST_PATH="$HOME/Library/LaunchAgents/com.max7vista.server.plist"

if [ -f "$PLIST_PATH" ]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "[max7] Service removed. The server will no longer start automatically at login."
else
  echo "[max7] No service found at $PLIST_PATH — nothing to do."
fi
