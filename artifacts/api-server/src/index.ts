import app from "./app";
import { logger } from "./lib/logger";
import { getStorageDirectory, getSetting } from "./lib/storage";
import { scanDirectory } from "./lib/scanDirectory";
import path from "path";
import fs from "fs";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ── First-run legacy scan ──────────────────────────────────────────────
  // If the storage directory has never been scanned (lastScanAt is unset)
  // and it already contains image files, auto-index them so that any
  // legacy image library is immediately usable without a manual trigger.
  try {
    const lastScanAt = await getSetting("lastScanAt");
    if (!lastScanAt) {
      const storageDir = await getStorageDirectory();
      const IMAGE_EXTENSIONS = new Set([
        ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif",
      ]);

      function hasImages(dir: string): boolean {
        if (!fs.existsSync(dir)) return false;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            if (hasImages(path.join(dir, entry.name))) return true;
          } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            return true;
          }
        }
        return false;
      }

      if (hasImages(storageDir)) {
        logger.info({ storageDir }, "First run: unscanned image files found — triggering auto-scan");
        const result = await scanDirectory(storageDir);
        logger.info({ scanned: result.scanned, indexed: result.indexed }, "First-run auto-scan complete");
      }
    }
  } catch (e) {
    // Never crash the server over a scan failure
    logger.warn({ err: e }, "First-run scan check failed");
  }
});
