# Max7 Vista — Self-Hosting Guide

Run the full Max7 Vista stack on your own clinic network with no internet connection required. One computer acts as the server; all other devices (browsers, phones, tablets) connect to it over your LAN.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20+** | Download from [nodejs.org](https://nodejs.org) — use the LTS version |
| **pnpm** | Installed automatically if missing (uses Corepack) |
| **PostgreSQL 14+** *(optional)* | Only needed for the web/API server mode. Not required for the Electron desktop app, which uses SQLite. |

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
2. Install dependencies
3. Build the web frontend and API server
4. Apply the database schema
5. Start the server and print your **LAN address**

---

## Finding Your LAN IP Address

The startup script prints the address automatically. If you need to find it manually:

### Windows
Open Command Prompt and run:
```cmd
ipconfig
```
Look for **IPv4 Address** under your active network adapter (e.g. `192.168.1.50`).

### macOS
Open Terminal and run:
```bash
ipconfig getifaddr en0
```
(Use `en1` if on Wi-Fi and `en0` didn't work.)

### Linux
```bash
ip route get 1 | awk '{print $7; exit}'
```

---

## Environment Variables

Create a `.env` file in the repository root (or set these in your environment before running the script):

```env
# Required for PostgreSQL mode (omit to use SQLite/Electron mode)
DATABASE_URL=postgresql://user:password@localhost:5432/max7vista

# Recommended: change this to a random secret in production
SESSION_SECRET=change-me-to-a-long-random-string

# Port to listen on (default: 8080)
PORT=8080

# CORS: comma-separated list of allowed origins for cross-origin requests
# Example for LAN: CORS_ALLOWED_ORIGINS=http://192.168.1.50:8080
CORS_ALLOWED_ORIGINS=
```

---

## PostgreSQL Setup (first time)

If you want to use PostgreSQL instead of SQLite:

1. Install PostgreSQL on the server machine.
2. Create a database:
   ```sql
   CREATE DATABASE max7vista;
   CREATE USER max7 WITH PASSWORD 'yourpassword';
   GRANT ALL PRIVILEGES ON DATABASE max7vista TO max7;
   ```
3. Set `DATABASE_URL` in your environment:
   ```
   DATABASE_URL=postgresql://max7:yourpassword@localhost:5432/max7vista
   ```
4. Run the start script — it applies the schema automatically on first launch.

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
4. Tap **Test & Connect** — the app will verify it can reach the server.
5. Once connected, log in with your credentials.

To change the server address later: go to **Settings → Server Address**.

---

## Firewall / Port Notes

- The server listens on **port 8080** by default (change with `PORT=`).
- On Windows, you may need to allow inbound connections on this port:
  - Open **Windows Defender Firewall → Advanced Settings**
  - Add an **Inbound Rule** for TCP port 8080
- On macOS, you may be prompted to allow incoming connections when first starting.
- On Linux with `ufw`: `sudo ufw allow 8080/tcp`

---

## Electron Desktop App

The Electron app bundles the entire server locally — no separate install needed. It uses SQLite and runs fully offline.

Other devices on the same LAN can connect to the Electron app's server:
1. The server address is shown in the app's title bar when it starts.
2. Use that address in the mobile app's Server Setup screen.

---

## Keeping the Server Running

For unattended operation, consider running the server as a background service:

**macOS (launchd)** or **Linux (systemd)**:
```bash
# Example systemd service (Linux)
[Unit]
Description=Max7 Vista Server
After=network.target

[Service]
WorkingDirectory=/path/to/max7-vista
ExecStart=/path/to/max7-vista/scripts/start-server.sh
Restart=on-failure
Environment=PORT=8080
Environment=DATABASE_URL=postgresql://...
Environment=SESSION_SECRET=...

[Install]
WantedBy=multi-user.target
```

**Windows**: Use Task Scheduler to run `start-server.bat` at startup.

---

## Default Login

On first launch, the default administrator account is:

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

**Change this password immediately** after first login via Settings → Users.
