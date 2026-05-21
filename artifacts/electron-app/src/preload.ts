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
});
