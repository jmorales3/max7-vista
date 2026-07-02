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
      /** Returns the LAN addresses the embedded server is reachable on. */
      getLanAddresses(): Promise<string[]>;
      /** e.g. "darwin" | "win32" | "linux" */
      platform: string;
      /** Return the packaged app version (from electron-app's package.json). */
      getAppVersion(): Promise<string>;

      /** Called when an update is available; receives the new version string. */
      onUpdateAvailable(cb: (version: string) => void): void;
      /** Called periodically during download with percent 0-100. */
      onUpdateDownloadProgress(cb: (percent: number) => void): void;
      /** Called when the update has finished downloading; receives the new version string. */
      onUpdateDownloaded(cb: (version: string) => void): void;
      /** Quit the app and immediately install the downloaded update. */
      installUpdate(): Promise<void>;
    };
  }
}
