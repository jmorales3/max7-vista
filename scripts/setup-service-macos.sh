#!/usr/bin/env bash
# Max7 Vista — Install a launchd agent so the server restarts automatically
# when the clinic Mac reboots or the process crashes.
#
# Usage: ./scripts/setup-service-macos.sh   (run as the user who should own the server)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/com.max7vista.server.plist"
mkdir -p "$PLIST_DIR"

echo "[max7] Installing launchd agent 'com.max7vista.server'"
echo "       Repo: $REPO_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.max7vista.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>$REPO_DIR/scripts/start-server.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$REPO_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>${PORT:-8080}</string>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$REPO_DIR/max7vista-server.log</string>
  <key>StandardErrorPath</key>
  <string>$REPO_DIR/max7vista-server.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo ""
echo "[max7] Done. The server will now start automatically at login and restart if it crashes."
echo "       Logs:      tail -f $REPO_DIR/max7vista-server.log"
echo "       Stop:      launchctl unload $PLIST_PATH"
echo "       Uninstall: ./scripts/uninstall-service-macos.sh"
