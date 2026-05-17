import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { db, imagesTable, settingsTable, patientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";
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

// Date pattern: YYYY-MM-DD
const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

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

/**
 * Try to infer patient ID and capture date from the file's directory path
 * relative to the storage root.
 *
 * Expected layout: {storageRoot}/{patientId}/{YYYY-MM-DD}/{filename}
 * Also accepts:    {storageRoot}/{patientId}/{filename}  (no date folder)
 *
 * Returns null for both when the path does not match the expected convention.
 */
function inferMetadataFromPath(
  filePath: string,
  storageRoot: string,
): { patientId: number | null; capturedAt: Date | null } {
  const rel = path.relative(storageRoot, filePath);
  const parts = rel.split(path.sep);

  // parts[0] = candidate patientId (numeric string)
  // parts[1] = candidate date OR filename
  // parts[2] = filename (if date folder present)

  if (parts.length < 2) return { patientId: null, capturedAt: null };

  const candidatePatientId = Number(parts[0]);
  if (!Number.isInteger(candidatePatientId) || candidatePatientId <= 0) {
    return { patientId: null, capturedAt: null };
  }

  let capturedAt: Date | null = null;
  if (parts.length >= 3 && DATE_DIR_RE.test(parts[1])) {
    const d = new Date(parts[1]);
    if (!Number.isNaN(d.getTime())) capturedAt = d;
  }

  return { patientId: candidatePatientId, capturedAt };
}

router.post("/settings/scan-directory", async (_req, res): Promise<void> => {
  const storageDir = await getStorageDirectory();
  const allFiles = walkDirectory(storageDir);

  // Build a set of already-indexed paths for quick lookup
  const existingImages = await db.select({ filePath: imagesTable.filePath }).from(imagesTable);
  const existingPaths = new Set(existingImages.map((img) => img.filePath));

  // Build a set of valid patient IDs for metadata inference
  const allPatients = await db.select({ id: patientsTable.id }).from(patientsTable);
  const validPatientIds = new Set(allPatients.map((p) => p.id));

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

      // Try to infer patient and date from directory conventions
      const { patientId: inferredPatientId, capturedAt: inferredDate } =
        inferMetadataFromPath(filePath, storageDir);

      // Only use inferred patientId if the patient actually exists in the DB
      const resolvedPatientId =
        inferredPatientId !== null && validPatientIds.has(inferredPatientId)
          ? inferredPatientId
          : null;

      const capturedAt = inferredDate ?? stat.mtime;

      await db.insert(imagesTable).values({
        filePath,
        fileName,
        patientId: resolvedPatientId,
        capturedAt,
        isUnassigned: resolvedPatientId === null,
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
