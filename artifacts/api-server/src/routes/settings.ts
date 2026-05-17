import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { db, imagesTable, settingsTable, patientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  UpdateSettingsBody,
} from "@workspace/api-zod";
import { getStorageDirectory, getSetting, setSetting } from "../lib/storage";

const router: IRouter = Router();

router.get("/settings", async (_req, res): Promise<void> => {
  const storageDirectory = await getStorageDirectory();
  const lastScanAt = await getSetting("lastScanAt");

  res.json({
    storageDirectory,
    lastScanAt: lastScanAt ?? null,
  });
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.storageDirectory) {
    await setSetting("storageDirectory", parsed.data.storageDirectory);
    if (!fs.existsSync(parsed.data.storageDirectory)) {
      fs.mkdirSync(parsed.data.storageDirectory, { recursive: true });
    }
  }

  const storageDirectory = await getStorageDirectory();
  const lastScanAt = await getSetting("lastScanAt");

  res.json({
    storageDirectory,
    lastScanAt: lastScanAt ?? null,
  });
});

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif"]);

function walkDirectory(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDirectory(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

router.post("/settings/scan-directory", async (_req, res): Promise<void> => {
  const storageDir = await getStorageDirectory();

  const allFiles = walkDirectory(storageDir);

  const existingImages = await db.select({ filePath: imagesTable.filePath }).from(imagesTable);
  const existingPaths = new Set(existingImages.map((img) => img.filePath));

  let indexed = 0;
  let skipped = 0;
  let errors = 0;

  for (const filePath of allFiles) {
    if (existingPaths.has(filePath)) {
      skipped++;
      continue;
    }

    try {
      const fileName = path.basename(filePath);
      const stat = fs.statSync(filePath);
      const capturedAt = stat.mtime;

      await db.insert(imagesTable).values({
        filePath,
        fileName,
        capturedAt,
        isUnassigned: true,
      });
      indexed++;
    } catch {
      errors++;
    }
  }

  await setSetting("lastScanAt", new Date().toISOString());

  res.json({
    scanned: allFiles.length,
    indexed,
    skipped,
    errors,
    message: `Scanned ${allFiles.length} files: ${indexed} new, ${skipped} already indexed, ${errors} errors`,
  });
});

export default router;
