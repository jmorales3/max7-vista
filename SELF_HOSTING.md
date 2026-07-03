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

# HTTPS (recommended): see "Enabling HTTPS" below
ENABLE_HTTPS=false
TLS_CERT_PATH=
TLS_KEY_PATH=
```

---

## Enabling HTTPS

By default the self-hosted server speaks plain HTTP. That's fine for quick testing, but patient images and login credentials would otherwise cross your clinic Wi-Fi in cleartext — anyone on the same network could intercept them. **We recommend enabling HTTPS for any real clinic use.**

There are two ways to do it:

### Option A — Automatic self-signed certificate (easiest, no IT department needed)

Set one environment variable before starting the server:

```env
ENABLE_HTTPS=true
```

On first start, the server generates its own certificate covering `localhost` and all of the machine's current LAN IP addresses, and caches it (in `.tls-cert/` in the repo root, or inside the Electron app's user data folder) so it's reused on every future restart. `./scripts/start-server.sh` and `start-server.bat` both pick this up automatically.

Because this certificate isn't issued by a public certificate authority, browsers and the mobile app will show a one-time **"connection is not private" / "certificate not trusted"** warning the first time each device connects — this is expected. Click through it (e.g. "Advanced → Proceed") to continue; the connection is still fully encrypted, it's just not vouched for by a public CA.

### Option B — Your own certificate (if your clinic's IT already issues certs)

If you have a certificate from your organization's internal CA (or a real one for a LAN hostname), point the server at it instead:

```env
TLS_CERT_PATH=/path/to/fullchain.pem
TLS_KEY_PATH=/path/to/privkey.pem
```

When both are set, they take priority over `ENABLE_HTTPS` — no self-signed cert is generated, and connecting devices that already trust your CA won't see any warning.

### Notes

- Once HTTPS is enabled, use `https://` (not `http://`) in the browser and in the mobile app's Server Setup screen.
- Cloud deployments on Replit already run over HTTPS end-to-end via Replit's proxy — these settings only apply to the self-hosted / Electron / LAN server.

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

If the clinic computer restarts (power outage, Windows update, etc.), the
server needs to come back up on its own — otherwise staff show up to a
disconnected app. Use the one-command setup scripts below to register the
server as an OS service that starts automatically at boot and restarts
itself if it ever crashes.

### Linux (systemd)

```bash
sudo ./scripts/setup-service-linux.sh
```

This generates `/etc/systemd/system/max7vista.service`, enables it, and
starts it immediately. The service restarts automatically on crash
(`Restart=on-failure`) and on every reboot.

- Check status: `systemctl status max7vista`
- View logs: `journalctl -u max7vista -f`
- Uninstall: `sudo ./scripts/uninstall-service-linux.sh`

### macOS (launchd)

```bash
./scripts/setup-service-macos.sh
```

This installs `~/Library/LaunchAgents/com.max7vista.server.plist` with
`RunAtLoad` + `KeepAlive`, so the server starts at login and restarts itself
if it stops unexpectedly.

- View logs: `tail -f max7vista-server.log`
- Uninstall: `./scripts/uninstall-service-macos.sh`

### Windows (Scheduled Task)

Right-click **`scripts\setup-service-windows.bat`** and choose **"Run as
administrator"**. This registers a Scheduled Task that runs at system
startup (`/SC ONSTART`) under the SYSTEM account, so the server comes back
up even before anyone logs in — no need to leave a Command Prompt window
open.

- Node.js/pnpm must be installed system-wide (the default installer option)
  so the SYSTEM account can find them on `PATH`.
- Check status: `schtasks /Query /TN "Max7VistaServer"`
- Uninstall: right-click `scripts\uninstall-service-windows.bat` → **Run as
  administrator**

### Manual alternative

If you'd rather configure the service by hand (e.g. to customize the unit
file), the setup scripts above generate standard systemd unit / launchd
plist / Scheduled Task definitions — open them to see (and adapt) the exact
configuration they apply.

---

## Default Login

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

**Change this password immediately** after first login via Settings → Users.
