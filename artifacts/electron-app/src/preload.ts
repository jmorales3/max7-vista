import { contextBridge, ipcRenderer } from "electron";

/**
 * Electron preload: exposes a safe subset of Electron APIs to the renderer
 * via window.electronAPI. The renderer detects Electron by checking whether
 * window.electronAPI is defined.
 */

contextBridge.exposeInMainWorld("electronAPI", {
  /** Open a native folder-picker dialog and return the selected path or null. */
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:openDirectory"),

  /** Return the LAN addresses the embedded server is reachable on. */
  getLanAddresses: (): Promise<string[]> =>
    ipcRenderer.invoke("get-lan-addresses"),

  /** Return the platform string so the renderer can adjust UI accordingly. */
  platform: process.platform,

  /** Return the packaged app version (from electron-app's package.json). */
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),

  /** Startup splash: listen for real progress steps from the main process. */
  onStartupProgress: (cb: (step: string) => void) => {
    ipcRenderer.on("startup:progress", (_event, step) => cb(step));
  },

  /** Auto-updater: listen for update events from the main process. */
  onUpdateAvailable: (cb: (version: string) => void) => {
    ipcRenderer.on("update:available", (_event, version) => cb(version));
  },
  onUpdateDownloadProgress: (cb: (percent: number) => void) => {
    ipcRenderer.on("update:download-progress", (_event, percent) => cb(percent));
  },
  onUpdateDownloaded: (cb: (version: string) => void) => {
    ipcRenderer.on("update:downloaded", (_event, version) => cb(version));
  },

  /** Tell the main process to quit and install the downloaded update immediately. */
  installUpdate: (): Promise<void> =>
    ipcRenderer.invoke("updater:install-now"),

  /** License & Activation */
  license: {
    /** Notify main that activation succeeded in the license window. */
    activated: (): void => ipcRenderer.send("license:activated"),
    /** Notify main that the user chose to continue the trial. */
    skip: (): void => ipcRenderer.send("license:skip"),
  },
});
