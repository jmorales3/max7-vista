import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import { autoUpdater } from "electron-updater";

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
let apiServerProcess: ChildProcess | null = null;

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

function startApiServer(): void {
  const serverEntry = IS_DEV
    ? path.resolve(__dirname, "../../api-server/dist/index.mjs")
    : path.join(process.resourcesPath, "api-server", "index.mjs");

  const dbPath = getDbPath();
  const uploadsDir = getUploadsDir();
  const nodeModulesPath = getNodeModulesPath();

  apiServerProcess = spawn("node", ["--enable-source-maps", serverEntry], {
    env: {
      ...process.env,
      PORT: String(API_PORT),
      NODE_ENV: "production",
      ELECTRON_MODE: "true",
      DATABASE_TYPE: "sqlite",
      DATABASE_PATH: dbPath,
      STORAGE_DIRECTORY: uploadsDir,
      NODE_PATH: nodeModulesPath,
    },
    stdio: "pipe",
  });

  apiServerProcess.stdout?.on("data", (d) =>
    console.log("[api-server]", d.toString().trim()),
  );
  apiServerProcess.stderr?.on("data", (d) =>
    console.error("[api-server]", d.toString().trim()),
  );
  apiServerProcess.on("exit", (code) =>
    console.log(`[api-server] exited with code ${code}`),
  );
}

function stopApiServer(): void {
  if (apiServerProcess) {
    apiServerProcess.kill();
    apiServerProcess = null;
  }
}

// ─── Splash Window ───────────────────────────────────────────────────────────

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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle("get-lan-addresses", (): string[] => getLanAddresses());

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

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createSplashWindow();
  startApiServer();
  createWindow();

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
