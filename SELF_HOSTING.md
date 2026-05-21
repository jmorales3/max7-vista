# Max7 Vista — Self-Hosting Guide

Run the full Max7 Vista stack on your own clinic network with no internet connection required. One computer acts as the server; all other devices (browsers, phones, tablets) connect to it over your LAN.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20+** | Download from [nodejs.org](https://nodejs.org) — use the LTS version |
| **pnpm** | Installed automatically if missing (via Corepack) |
| **PostgreSQL 14+** *(optional)* | Recommended for multi-user clinics. If absent, the server automatically uses SQLite instead |

---

## Quick Start

### macOS / Linux

```bash
# From the repository root:
./scripts/start-server.sh
```

### Windows

Double-click `scripts\start-server.bat`, or run from Command Prompt:

```cmd
scripts\start-server.bat
```

The script will:
1. Check Node.js and pnpm
2. Detect whether PostgreSQL is available and choose the right database mode
3. Install dependencies
4. Apply the database schema (PostgreSQL) or create the SQLite file automatically
5. Build the web frontend and API server
6. Print your **LAN address** and start the server

---

## Database Modes

The startup scripts auto-detect the best mode for your environment:

| Mode | When | Storage |
|---|---|---|
| **PostgreSQL** | `DATABASE_URL` is set, or `psql` is found and `max7vista` can be created | Recommended for multi-user clinics — data survives restarts and can be backed up |
| **SQLite** | Neither of the above — no PostgreSQL install needed | Single-file database (`max7-vista.db`) in the repo root. Suitable for small clinics or single-workstation setups |

You can force a specific mode by setting environment variables before running the script:

```bash
# Force PostgreSQL (must be reachable)
export DATABASE_URL=postgresql://user:password@localhost:5432/max7vista
./scripts/start-server.sh

# Force SQLite (skip PostgreSQL even if available)
unset DATABASE_URL
# ensure psql is not on PATH, or the script will still try PostgreSQL first
./scripts/start-server.sh
```

---

## Finding Your LAN IP Address

The startup script prints the address automatically. If you need to find it manually:

### Windows
```cmd
ipconfig
```
Look for **IPv4 Address** under your active network adapter (e.g. `192.168.1.50`).

### macOS
```bash
ipconfig getifaddr en0
# or, for Wi-Fi:
ipconfig getifaddr en1
```

### Linux
```bash
ip route get 1 | awk '{print $7; exit}'
```

---

## Connecting Other Devices

### Web Browser (any device on the LAN)
Open a browser and navigate to:
```
http://192.168.x.x:8080
```
Replace `192.168.x.x` with your server's LAN IP.

### Mobile App (iOS / Android)
1. Open the Max7 Vista mobile app.
2. On first launch, you will see the **Server Setup** screen.
3. Enter your server's LAN address, e.g.:
   ```
   http://192.168.1.50:8080
   ```
4. Tap **Test & Connect** — the app verifies it can reach the server.
5. Once connected, log in with your credentials.

To change the server address later: go to **Settings → Server Address**.

---

## Environment Variables

Create a `.env` file in the repository root (or set these before running the script):

```env
# PostgreSQL connection string (omit to use auto-detected mode)
DATABASE_URL=postgresql://user:password@localhost:5432/max7vista

# SQLite database path — only used in SQLite self-host mode (default: ./max7-vista.db)
DATABASE_PATH=./max7-vista.db

# Recommended: set this to a long random string in production
SESSION_SECRET=change-me-to-a-long-random-string

# Port to listen on (default: 8080)
PORT=8080

# CORS: comma-separated allowed origins for cross-origin requests
# Leave empty in SQLite/self-host mode (all origins are allowed automatically)
CORS_ALLOWED_ORIGINS=
```

---

## PostgreSQL Setup (first time)

If you have PostgreSQL installed and want to use it explicitly:

1. Create a database user and database:
   ```sql
   CREATE USER max7 WITH PASSWORD 'yourpassword';
   CREATE DATABASE max7vista OWNER max7;
   ```
2. Set `DATABASE_URL`:
   ```env
   DATABASE_URL=postgresql://max7:yourpassword@localhost:5432/max7vista
   ```
3. Run the start script — it applies the schema automatically.

Alternatively, if `psql` is in your `PATH` and a local PostgreSQL is running, the script will create `max7vista` using your current OS user and no password (peer authentication). Set `DATABASE_URL` explicitly if you need a different user or remote host.

---

## Firewall / Port Notes

- The server listens on **port 8080** by default (change with `PORT=`).
- **Windows**: Allow inbound TCP connections on port 8080 in Windows Defender Firewall → Advanced Settings → Inbound Rules.
- **macOS**: You may be prompted to allow incoming connections when first starting.
- **Linux (ufw)**: `sudo ufw allow 8080/tcp`

---

## Electron Desktop App

The Electron app bundles the entire server and a local SQLite database — no separate install or PostgreSQL required. It runs fully offline.

Other devices on the same LAN can connect to the Electron server:
1. The window title shows the LAN address: `Patient Image Manager — LAN: http://192.168.x.x:8080`
2. Enter that address in the mobile app's Server Setup screen.

---

## Keeping the Server Running

For unattended operation, register the server as an OS service:

### Linux (systemd)

```ini
# /etc/systemd/system/max7vista.service
[Unit]
Description=Max7 Vista Server
After=network.target

[Service]
WorkingDirectory=/path/to/max7-vista
ExecStart=/path/to/max7-vista/scripts/start-server.sh
Restart=on-failure
Environment=PORT=8080
# Add DATABASE_URL here for PostgreSQL mode; omit for SQLite mode

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now max7vista
```

### macOS (launchd)

Create `~/Library/LaunchAgents/com.max7vista.server.plist` and add:
```xml
<plist version="1.0">
<dict>
  <key>Label</key><string>com.max7vista.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/path/to/max7-vista/scripts/start-server.sh</string>
  </array>
  <key>WorkingDirectory</key><string>/path/to/max7-vista</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.max7vista.server.plist
```

### Windows (Task Scheduler)

Use Task Scheduler to run `start-server.bat` at system startup with "Run whether user is logged on or not" checked.

---

## Default Login

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

**Change this password immediately** after first login via Settings → Users.
