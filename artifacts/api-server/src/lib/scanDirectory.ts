import path from "path";
import fs from "fs";
import { db, imagesTable, patientsTable } from "@workspace/db";
import { setSetting } from "./storage";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif"]);
const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

function walkDirectory(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDirectory(fullPath));
    } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

function inferMetadataFromPath(
  filePath: string,
  storageRoot: string,
): { patientId: number | null; capturedAt: Date | null } {
  const rel = path.relative(storageRoot, filePath);
  const parts = rel.split(path.sep);
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

export interface ScanResult {
  scanned: number;
  indexed: number;
  skipped: number;
  errors: number;
  message: string;
}

export async function scanDirectory(storageDir: string): Promise<ScanResult> {
  const allFiles = walkDirectory(storageDir);
  const existingImages = await db.select({ filePath: imagesTable.filePath }).from(imagesTable);
  const existingPaths = new Set(existingImages.map((img) => img.filePath));
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
      const { patientId: inferredPatientId, capturedAt: inferredDate } =
        inferMetadataFromPath(filePath, storageDir);
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
  return {
    scanned: allFiles.length,
    indexed,
    skipped,
    errors,
    message: `Scanned ${allFiles.length} files: ${indexed} new, ${skipped} already indexed, ${errors} errors`,
  };
}
