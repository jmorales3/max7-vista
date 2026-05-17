export {};

declare global {
  interface Window {
    /**
     * Exposed by the Electron preload script via contextBridge.
     * Only defined when the web app runs inside the Electron shell;
     * undefined in a normal browser — check before calling.
     */
    electronAPI?: {
      /** Opens a native folder-picker dialog. Returns the chosen path or null. */
      selectFolder(): Promise<string | null>;
      /** e.g. "darwin" | "win32" | "linux" */
      platform: string;
    };
  }
}
