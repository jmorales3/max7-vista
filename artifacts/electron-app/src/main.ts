import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";

const API_PORT = parseInt(process.env["API_PORT"] ?? "8080", 10);
// In development, Electron loads the running Vite dev server. Set VITE_DEV_URL
// in the environment to override (e.g. when the workspace uses a non-default port).
const VITE_DEV_URL = process.env["VITE_DEV_URL"] ?? `http://localhost:5173`;
// app.isPackaged is the canonical Electron check: true only in packaged builds.
// NODE_ENV is unreliable in packaged apps (often unset → would incorrectly be "dev").
const IS_DEV = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let apiServerProcess: ChildProcess | null = null;

// ─── API Server Lifecycle ───────────────────────────────────────────────────

function startApiServer(): void {
  const serverEntry = IS_DEV
    ? path.resolve(__dirname, "../../api-server/dist/index.mjs")
    : path.join(process.resourcesPath, "api-server", "index.mjs");

  apiServerProcess = spawn("node", ["--enable-source-maps", serverEntry], {
    env: { ...process.env, PORT: String(API_PORT), NODE_ENV: "production" },
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

// ─── Window ─────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Patient Image Manager",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // In dev, load the Vite dev server; in production, load from the API server
  // which serves the bundled frontend as static files at its root.
  // VITE_DEV_URL must be set to the Vite dev server URL when running locally
  // (e.g. http://localhost:19156 if the workspace uses a non-default Vite port).
  const appUrl = IS_DEV ? VITE_DEV_URL : `http://localhost:${API_PORT}`;

  // Wait briefly for the server to be ready then load
  setTimeout(() => {
    mainWindow?.loadURL(appUrl).catch((err) => {
      console.error("Failed to load app URL:", err);
    });
  }, IS_DEV ? 0 : 1500);

  // Open external links in the default browser instead of a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

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

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  if (!IS_DEV) startApiServer();
  createWindow();

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
