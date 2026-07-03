/**
 * Local-file serving route — only meaningful in the Electron/LAN build.
 *
 * GET /api/local-file/<objectName>
 *   Serves a file from STORAGE_DIRECTORY/<objectName>.
 *   Used when localDiskStorage.ts returns "http://localhost:PORT/api/local-file/..."
 *   as the "signed URL" for document viewing.
 *
 * Requires auth (this router is registered after requireAuth in index.ts).
 * Security: resolves the path and ensures it stays inside STORAGE_DIRECTORY.
 */

import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

router.get("/local-file/*objectPath", (req, res) => {
  const storageDir = process.env.STORAGE_DIRECTORY;

  if (!storageDir) {
    // Not in Electron/LAN mode — this route shouldn't be used
    res.status(404).json({ error: "Local file serving is not available" });
    return;
  }

  const requestedPathParam = req.params.objectPath as unknown as string | string[] | undefined;
  if (!requestedPathParam || requestedPathParam.length === 0) {
    res.status(400).json({ error: "No path specified" });
    return;
  }

  // req.params.objectPath is an array of path segments for wildcard routes.
  // Decode each segment and reconstruct with OS separator
  const rawSegments = Array.isArray(requestedPathParam)
    ? requestedPathParam
    : requestedPathParam.split("/");
  const segments = rawSegments.map((s: string) => decodeURIComponent(s));

  const resolvedStorageDir = path.resolve(storageDir);
  const localPath = path.resolve(resolvedStorageDir, ...segments);

  // Path traversal guard: ensure the resolved path stays inside storageDir
  if (!localPath.startsWith(resolvedStorageDir + path.sep) &&
      localPath !== resolvedStorageDir) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (!fs.existsSync(localPath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  // Serve inline (not as attachment) so browsers/iframes can display the file
  res.sendFile(localPath);
});

export default router;
