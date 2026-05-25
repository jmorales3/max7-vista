/**
 * Local-disk storage adapter — used in the Electron/LAN build instead of gcsStorage.ts.
 *
 * The esbuild alias in build.mjs swaps this file in when ELECTRON_BUILD=true.
 * It preserves the exact same exported API as gcsStorage.ts so no route code
 * needs to change.
 *
 * Storage layout: STORAGE_DIRECTORY/<objectName>
 *   e.g. STORAGE_DIRECTORY/documents/3/1700000000000.pdf
 *        STORAGE_DIRECTORY/images/3/2024-01-01/1700000000000.jpg
 *
 * DB key format is kept identical to the GCS version ("gcs:<objectName>") so
 * the same patient database works whether the app was originally installed
 * as the cloud build or the LAN build.
 */

import path from "path";
import fs from "fs";
import type { Response } from "express";

function getStorageDir(): string {
  const dir = process.env.STORAGE_DIRECTORY;
  if (!dir) throw new Error("STORAGE_DIRECTORY env var is not set");
  return dir;
}

function objectNameToLocalPath(objectName: string): string {
  // Normalise forward-slash separators to the OS separator
  const rel = objectName.split("/").join(path.sep);
  return path.join(getStorageDir(), rel);
}

/** Returns true if the filePath is a "gcs:" DB reference */
export function isGcsPath(filePath: string): boolean {
  return filePath.startsWith("gcs:");
}

/** Convert an object name to the canonical DB storage key */
export function toGcsPath(objectName: string): string {
  return `gcs:${objectName}`;
}

/** Extract the object name from a DB storage key */
export function fromGcsPath(filePath: string): string {
  return filePath.startsWith("gcs:") ? filePath.slice(4) : filePath;
}

/**
 * Write a Buffer to local disk.
 * Returns the DB storage key (e.g. "gcs:documents/3/1700000000000.pdf").
 */
export async function uploadToGcs(
  buffer: Buffer,
  objectName: string,
  _contentType: string,
): Promise<string> {
  const localPath = objectNameToLocalPath(objectName);
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await fs.promises.writeFile(localPath, buffer);
  return toGcsPath(objectName);
}

/**
 * Stream a locally-stored file to an Express response.
 * Handles both "gcs:<objectName>" keys and legacy absolute disk paths.
 */
export async function streamFile(
  filePath: string,
  fileName: string,
  res: Response,
  download = false,
): Promise<void> {
  const localPath = isGcsPath(filePath)
    ? objectNameToLocalPath(fromGcsPath(filePath))
    : filePath; // legacy absolute path

  if (!fs.existsSync(localPath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  if (download) {
    res.download(localPath, fileName);
  } else {
    res.sendFile(localPath);
  }
}

/**
 * Return a URL that the frontend can open to view the document.
 * In the LAN build the file is on local disk, so we expose it through the
 * embedded Express server at /api/local-file/<objectName>.
 * The Electron main process intercepts window.open() via setWindowOpenHandler
 * and calls shell.openExternal(), which opens the URL in the system browser.
 */
export async function getSignedDownloadUrl(
  filePath: string,
  _ttlSec = 3600,
): Promise<string> {
  const objectName = fromGcsPath(filePath);
  const port = process.env.PORT || "8080";
  // URL-encode each path segment but keep slashes
  const encodedPath = objectName
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  // Use localhost (not 127.0.0.1) so that the session cookie set on localhost
  // is sent along with the request when the URL is loaded in an iframe.
  return `http://localhost:${port}/api/local-file/${encodedPath}`;
}

/**
 * Read a locally-stored file as a Buffer.
 * Returns null if the file does not exist.
 * Used by migration export to bundle files into the ZIP.
 */
export async function readFileAsBuffer(filePath: string): Promise<Buffer | null> {
  const localPath = isGcsPath(filePath)
    ? objectNameToLocalPath(fromGcsPath(filePath))
    : filePath;
  if (!fs.existsSync(localPath)) return null;
  return fs.promises.readFile(localPath);
}

/**
 * Delete a locally-stored file. Silently ignores missing files.
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    const localPath = isGcsPath(filePath)
      ? objectNameToLocalPath(fromGcsPath(filePath))
      : filePath;
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch {
    // ignore — best-effort cleanup
  }
}
