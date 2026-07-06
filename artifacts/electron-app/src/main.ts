import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "path";
import { pathToFileURL } from "url";
import fs from "fs";
import os from "os";
import { autoUpdater } from "electron-updater";
import { LICENSE_HMAC_SECRET as _BAKED_HMAC_SECRET } from "./secrets.generated";

// Set the app name early so app.getPath("userData") returns the correct
// folder name ("Max7 Vista") rather than the npm package name.
app.setName("Max7 Vista");

const API_PORT = parseInt(process.env["API_PORT"] ?? "8080", 10);
const rawDevUrl = process.env["VITE_DEV_URL"];
if (!rawDevUrl && process.env["NODE_ENV"] !== "production") {
  console.warn(
    "[electron-app] VITE_DEV_URL is not set. Defaulting to http://localhost:5173 " +
    "— set VITE_DEV_URL to the actual Vite dev-server port if the app fails to load.",
  );
}
const VITE_DEV_URL = rawDevUrl ?? "http://localhost:5173";
const IS_DEV = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

// ─── Database Path ───────────────────────────────────────────────────────────

function getDbPath(): string {
  const userDataDir = app.getPath("userData");
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  return path.join(userDataDir, "patient-images.db");
}

function getUploadsDir(): string {
  const userDataDir = app.getPath("userData");
  const uploadsDir = path.join(userDataDir, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}

function getBackupDir(): string {
  const userDataDir = app.getPath("userData");
  const backupDir = path.join(userDataDir, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

// ─── Node path for native modules (better-sqlite3) ──────────────────────────

function getNodeModulesPath(): string {
  if (IS_DEV) {
    // In dev, use the electron-app's own node_modules (has better-sqlite3)
    return path.resolve(__dirname, "../node_modules");
  }
  // In packaged app, electron-builder puts node_modules inside the app.
  // Native modules (.node files) are in app.asar.unpacked due to asarUnpack config.
  const appPath = app.getAppPath();
  const regularModules = path.join(appPath, "node_modules");
  const unpackedModules = path.join(
    appPath.replace("app.asar", "app.asar.unpacked"),
    "node_modules",
  );
  return [regularModules, unpackedModules].join(path.delimiter);
}

// ─── LAN Addresses ───────────────────────────────────────────────────────────

function getLanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const addresses: string[] = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(`http://${iface.address}:${API_PORT}`);
      }
    }
  }
  return addresses;
}

// ─── API Server Lifecycle ────────────────────────────────────────────────────
// The API server runs inside Electron's own Node.js process via dynamic import.
// No external "node" binary is required — Electron IS Node.js.

async function startApiServer(): Promise<void> {
  const serverEntry = IS_DEV
    ? path.resolve(__dirname, "../../api-server/dist/index.mjs")
    : path.join(process.resourcesPath, "api-server", "index.mjs");

  const dbPath = getDbPath();
  const uploadsDir = getUploadsDir();
  const backupDir = getBackupDir();
  const nodeModulesPath = getNodeModulesPath();

  // Set env vars on the shared process before importing the server bundle.
  Object.assign(process.env, {
    PORT: String(API_PORT),
    NODE_ENV: "production",
    ELECTRON_MODE: "true",
    DATABASE_TYPE: "sqlite",
    DATABASE_PATH: dbPath,
    STORAGE_DIRECTORY: uploadsDir,
    BACKUP_DIR: backupDir,
    LICENSE_HMAC_SECRET: _BAKED_HMAC_SECRET,
    NODE_PATH: nodeModulesPath,
    USER_DATA_DIR: app.getPath("userData"),
  });

  // Inject the electron-app node_modules into Module.globalPaths so that
  // require('better-sqlite3') — called via createRequire inside the ESM bundle —
  // finds the Electron-ABI-compiled native module rather than failing with ENOENT.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NodeModule = require("module") as { globalPaths: string[] };
  const extraPaths = nodeModulesPath.split(path.delimiter).filter(Boolean);
  for (const p of [...extraPaths].reverse()) {
    if (!NodeModule.globalPaths.includes(p)) NodeModule.globalPaths.unshift(p);
  }

  // Use a file:// URL so dynamic import works correctly on Windows paths
  // (handles spaces and special characters in "Program Files", etc.).
  const serverUrl = pathToFileURL(serverEntry).href;

  // Wrap in new Function() to prevent TypeScript's CommonJS compiler from
  // transforming `import(url)` into `require(url)`. require() cannot handle
  // file:// URLs or load .mjs ES-module files — only the native import() can.
  const nativeImport = new Function("url", "return import(url)") as (
    url: string,
  ) => Promise<unknown>;

  try {
    sendStartupProgress("Initializing server");
    await nativeImport(serverUrl);
    // nativeImport resolves as soon as the module is evaluated — the server's
    // async start() runs in the background.  Poll the health endpoint until the
    // server is actually accepting connections (and the DB is seeded) before
    // returning so Electron doesn't open the login window too early.
    sendStartupProgress("Loading database");
    await waitForApiServer();
    sendStartupProgress("Preparing interface");
    console.log("[api-server] Server ready on port", API_PORT);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api-server] Failed to start:", msg);
    dialog.showErrorBox(
      "Server Error",
      `The embedded API server failed to start:\n\n${msg}\n\nThe application will exit.`,
    );
    app.quit();
  }
}

async function waitForApiServer(maxWaitMs = 20000, intervalMs = 250): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  const url = `http://127.0.0.1:${API_PORT}/api/auth/needs-setup`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 200 || res.status === 403) return; // server is up
    } catch {
      // connection refused — server not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`API server did not become ready within ${maxWaitMs / 1000}s`);
}

function stopApiServer(): void {
  // Server runs in-process; it stops automatically when Electron exits.
}

/**
 * Fails CLOSED: any network error, non-2xx response, or malformed payload
 * is reported as state "check_failed", which the caller must treat as
 * blocking (show the license window) rather than opening the main app.
 * A license gate that fails open on error would let expired/tampered
 * installs bypass enforcement whenever the status check errors.
 */
async function checkLicenseStatus(): Promise<{
  state: string;
  daysLeft: number | null;
  machineId: string | null;
}> {
  try {
    const res = await fetch(`http://127.0.0.1:${API_PORT}/api/license/status`);
    // Even a non-2xx response (e.g. a 500 from a transient DB hiccup) may still
    // carry a valid machineId in its JSON body — computeMachineId() never
    // throws, so try to recover it regardless of status code before failing
    // closed, so the activation screen can still show the ID to the user.
    const data = (await res.json().catch(() => null)) as
      | { state?: unknown; daysLeft?: number | null; machineId?: unknown }
      | null;
    const machineId = typeof data?.machineId === "string" ? data.machineId : null;
    if (res.ok && data && typeof data.state === "string") {
      return { state: data.state, daysLeft: data.daysLeft ?? null, machineId };
    }
    return { state: "check_failed", daysLeft: null, machineId };
  } catch {
    // fall through to fail-closed result below
  }
  return { state: "check_failed", daysLeft: null, machineId: null };
}

// ─── Splash Window ───────────────────────────────────────────────────────────

function sendStartupProgress(step: string): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("startup:progress", step);
  }
}

function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 380,
    height: 280,
    resizable: false,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    center: true,
    show: false,
    title: "Patient Image Manager",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const splashPath = path.join(__dirname, "splash.html");
  splashWindow.loadFile(splashPath).catch((err) => {
    console.error("Failed to load splash screen:", err);
  });

  splashWindow.once("ready-to-show", () => {
    splashWindow?.show();
  });

  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

function closeSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Patient Image Manager",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const appUrl = IS_DEV ? VITE_DEV_URL : `http://localhost:${API_PORT}`;

  // Give the embedded API server a moment to start, then load the UI
  setTimeout(() => {
    mainWindow?.loadURL(appUrl).catch((err) => {
      console.error("Failed to load app URL:", err);
      closeSplashWindow();
      mainWindow?.show();
    });
  }, IS_DEV ? 0 : 2000);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Once the UI finishes loading, close the splash and reveal the main window.
  mainWindow.webContents.once("did-finish-load", () => {
    sendStartupProgress("Ready");
    closeSplashWindow();
    mainWindow?.show();

    // Update window title with LAN address(es) so clinic staff can see
    // exactly what URL to type into the mobile app's Server Setup screen.
    const addresses = getLanAddresses();
    if (addresses.length > 0) {
      mainWindow?.setTitle(`Patient Image Manager — LAN: ${addresses[0]}`);
    }
  });
}

// ─── License Window ──────────────────────────────────────────────────────────

let licenseWindow: BrowserWindow | null = null;

function createLicenseWindow(machineId: string | null): void {
  licenseWindow = new BrowserWindow({
    width: 520,
    height: 640,
    resizable: false,
    center: true,
    show: false,
    title: "Max7 Vista — License Activation",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const licensePath = IS_DEV
    ? path.join(__dirname, "../src/license.html")
    : path.join(__dirname, "license.html");

  // Pass the machineId (already resolved from computeMachineId(), which never
  // depends on the HMAC secret) directly as a query param. This guarantees the
  // activation screen can always show it, even if the page's own later fetch
  // to /api/license/status is slow, transiently fails, or the record itself
  // is in a "tampered"/"check_failed" state.
  const query: Record<string, string> = { port: String(API_PORT) };
  if (machineId) query["machineId"] = machineId;

  licenseWindow.loadFile(licensePath, { query }).catch((err) => {
    console.error("[license] Failed to load license screen:", err);
  });

  licenseWindow.once("ready-to-show", () => {
    closeSplashWindow();
    licenseWindow?.show();
  });

  licenseWindow.on("closed", () => {
    licenseWindow = null;
    // If user closed the window without activating and no main window, quit.
    if (!mainWindow) app.quit();
  });
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle("get-lan-addresses", (): string[] => getLanAddresses());

ipcMain.handle("get-app-version", (): string => app.getVersion());

ipcMain.handle("dialog:openDirectory", async (): Promise<string | null> => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select Storage Directory",
    properties: ["openDirectory", "createDirectory"],
    buttonLabel: "Select Folder",
  });
  return result.canceled || result.filePaths.length === 0
    ? null
    : result.filePaths[0];
});

// ─── Auto-Updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] Checking for updates…");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[updater] Update available: ${info.version}`);
    mainWindow?.webContents.send("update:available", info.version);
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[updater] App is up-to-date.");
  });

  autoUpdater.on("download-progress", (progress) => {
    console.log(`[updater] Download progress: ${Math.round(progress.percent)}%`);
    mainWindow?.webContents.send("update:download-progress", Math.round(progress.percent));
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[updater] Update downloaded: ${info.version}`);
    mainWindow?.webContents.send("update:downloaded", info.version);
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater] Auto-update error:", err.message);
  });

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("[updater] Failed to check for updates:", err.message);
  });
}

ipcMain.handle("updater:install-now", () => {
  autoUpdater.quitAndInstall(false, true);
});

// License IPC: called from license.html after successful activation
ipcMain.on("license:activated", () => {
  if (licenseWindow && !licenseWindow.isDestroyed()) {
    licenseWindow.removeAllListeners("closed");
    licenseWindow.close();
    licenseWindow = null;
  }
  createWindow();
});

// License IPC: called from license.html when user chooses "Continue with trial"
ipcMain.on("license:skip", () => {
  if (licenseWindow && !licenseWindow.isDestroyed()) {
    licenseWindow.removeAllListeners("closed");
    licenseWindow.close();
    licenseWindow = null;
  }
  createWindow();
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────

function showFirstRunDialog(): void {
  const credFile = path.join(app.getPath("userData"), "first-run-credentials.json");
  if (!fs.existsSync(credFile)) return;
  try {
    const creds = JSON.parse(fs.readFileSync(credFile, "utf-8")) as { username: string; password: string };
    fs.unlinkSync(credFile);
    dialog.showMessageBoxSync({
      type: "info",
      title: "First-Time Setup — Default Account Created",
      message: "A default administrator account was created for you.",
      detail: `Username: ${creds.username}\nPassword: ${creds.password}\n\nPlease log in and change this password immediately from the Admin panel.`,
      buttons: ["OK, I'll note these down"],
    });
  } catch {
    // ignore — non-critical
  }
}

app.whenReady().then(async () => {
  createSplashWindow();
  await startApiServer();

  // ── License gate (desktop-only) ──────────────────────────────────────────
  // Fail CLOSED: only "trial" and "active" are known-good states that open
  // the main app directly. Anything else — expired, tampered, an unknown
  // state, or a failed status check — must show the blocking license window.
  const licenseStatus = await checkLicenseStatus();
  const OPEN_STATES = new Set(["trial", "active"]);
  const needsLicenseScreen = !OPEN_STATES.has(licenseStatus.state);

  if (needsLicenseScreen) {
    // Show blocking activation window; app opens only after user activates or
    // the license IPC handlers (above) create the main window.
    createLicenseWindow(licenseStatus.machineId);
  } else {
    showFirstRunDialog();
    createWindow();
  }

  if (app.isPackaged) {
    setupAutoUpdater();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopApiServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopApiServer();
});
