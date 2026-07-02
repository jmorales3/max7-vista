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
      /** Return the LAN addresses the embedded server is reachable on. */
      getLanAddresses(): Promise<string[]>;
      /** e.g. "darwin" | "win32" | "linux" */
      platform: string;
      /** Return the packaged app version (from electron-app's package.json). */
      getAppVersion(): Promise<string>;
      /** Auto-updater events */
      onUpdateAvailable(cb: (version: string) => void): void;
      onUpdateDownloadProgress(cb: (percent: number) => void): void;
      onUpdateDownloaded(cb: (version: string) => void): void;
      /** Tell the main process to quit and install the downloaded update. */
      installUpdate(): Promise<void>;
      /** License & Activation IPC */
      license: {
        /** Notify main that activation succeeded in the license window. */
        activated(): void;
        /** Notify main that the user chose to continue the trial. */
        skip(): void;
      };
    };
  }
}
