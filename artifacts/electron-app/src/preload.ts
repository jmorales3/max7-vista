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
});
