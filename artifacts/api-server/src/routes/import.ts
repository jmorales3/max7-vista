import { Router, type IRouter } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import { db, imagesTable, patientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getStorageDirectory } from "../lib/storage";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 600 * 1024 * 1024 },
});

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif",
]);

interface PatientInfo {
  name: string;
  dateOfBirth: string | null;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(csv: string): Map<string, PatientInfo> {
  const lines = csv.trim().split(/\r?\n/);
  const map = new Map<string, PatientInfo>();
  if (lines.length < 2) return map;

  const header = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/['"]/g, "").replace(/\s+/g, ""),
  );
  const idIdx = header.findIndex(
    (h) => h === "id" || h === "patientid" || h === "patient_id" || h === "codigo" || h === "code",
  );
  const nameIdx = header.findIndex(
    (h) =>
      h === "name" ||
      h === "patientname" ||
      h === "patient_name" ||
      h === "fullname" ||
      h === "full_name" ||
      h === "nombre" ||
      h === "nombrecompleto" ||
      h === "nombre_completo",
  );
  const firstNameIdx = header.findIndex(
    (h) => h === "firstname" || h === "first_name",
  );
  const lastNameIdx = header.findIndex(
    (h) => h === "lastname" || h === "last_name" || h === "apellido" || h === "apellidos",
  );
  const dobIdx = header.findIndex(
    (h) =>
      h === "dob" ||
      h === "dateofbirth" ||
      h === "date_of_birth" ||
      h === "birthdate" ||
      h === "birth_date" ||
      h === "fechanacimiento" ||
      h === "fecha_nacimiento",
  );

  if (idIdx === -1) return map;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    const id = cols[idIdx]?.replace(/['"]/g, "").trim();
    if (!id) continue;

    let name: string;
    const clean = (v: string | undefined) => v?.replace(/['"]/g, "").trim() ?? "";
    if (nameIdx >= 0 && clean(cols[nameIdx])) {
      name = clean(cols[nameIdx]);
    } else if ((firstNameIdx >= 0 || lastNameIdx >= 0)) {
      const first = firstNameIdx >= 0 ? clean(cols[firstNameIdx]) : "";
      const last = lastNameIdx >= 0 ? clean(cols[lastNameIdx]) : "";
      name = [first, last].filter(Boolean).join(" ") || id;
    } else {
      name = id;
    }

    const rawDob = dobIdx >= 0 ? clean(cols[dobIdx]) : undefined;
    map.set(id, { name, dateOfBirth: rawDob || null });
  }
  return map;
}

async function extractExifDate(buffer: Buffer): Promise<Date | null> {
  try {
    const { parse } = await import("exifr");
    const exif = await parse(buffer, ["DateTimeOriginal", "CreateDate", "DateTime"]);
    const raw = exif?.DateTimeOriginal ?? exif?.CreateDate ?? exif?.DateTime;
    if (raw instanceof Date) return raw;
    if (typeof raw === "string") {
      const parsed = new Date(raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3"));
      if (!isNaN(parsed.getTime())) return parsed;
    }
  } catch {
    // exifr unavailable or not a JPEG — fall through
  }
  return null;
}

interface ImportSummary {
  patientsCreated: number;
  patientsMatched: number;
  imagesImported: number;
  errors: Array<{ file: string; reason: string }>;
}

async function upsertPatient(
  req: Parameters<Parameters<IRouter["post"]>[1]>[0],
  patientCode: string,
  patientMap: Map<string, PatientInfo>,
  summary: ImportSummary,
): Promise<{ id: number }> {
  const [existing] = await db
    .select({ id: patientsTable.id })
    .from(patientsTable)
    .where(eq(patientsTable.patientCode, patientCode));

  if (existing) {
    summary.patientsMatched++;
    // If the CSV provides an explicit name (not just the folder-name fallback),
    // update the existing record — this allows a re-import with a corrected CSV
    // to fix patient names without creating duplicates.
    const csvInfo = patientMap.get(patientCode);
    if (csvInfo && csvInfo.name && csvInfo.name !== patientCode) {
      const updateVals: Record<string, unknown> = { name: csvInfo.name };
      if (csvInfo.dateOfBirth) updateVals.dateOfBirth = csvInfo.dateOfBirth;
      await db
        .update(patientsTable)
        .set(updateVals)
        .where(eq(patientsTable.id, existing.id));
    }
    return existing;
  }

  const csvInfo = patientMap.get(patientCode);
  const [created] = await db
    .insert(patientsTable)
    .values({
      patientCode,
      name: csvInfo?.name ?? patientCode,
      dateOfBirth: csvInfo?.dateOfBirth ?? null,
    })
    .returning({ id: patientsTable.id });
  summary.patientsCreated++;
  await logAudit(req, "create", "patient", created.id, JSON.stringify({ patientCode, source: "bulk-import" }));
  return created;
}

async function saveImage(
  patientId: number,
  fileName: string,
  buffer: Buffer,
  capturedAt: Date,
  storageDir: string,
): Promise<void> {
  const dateStr = capturedAt.toISOString().split("T")[0];
  const subFolder = path.join(storageDir, String(patientId), dateStr);
  fs.mkdirSync(subFolder, { recursive: true });

  const ext = path.extname(fileName) || ".jpg";
  const storedName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
  const filePath = path.join(subFolder, storedName);
  fs.writeFileSync(filePath, buffer);

  const legend = path.basename(fileName, ext).replace(/[_-]+/g, " ").trim();

  // better-sqlite3 rejects Date objects and booleans — pass primitives that
  // both the SQLite (text) and PostgreSQL (timestamp) adapters accept.
  await db.insert(imagesTable).values({
    patientId,
    filePath,
    fileName,
    notes: legend || null,
    capturedAt: capturedAt,
    isUnassigned: 0 as unknown as boolean,
  });
}

// ─── ZIP bulk import ─────────────────────────────────────────────────────────

router.post(
  "/import/bulk",
  importUpload.fields([
    { name: "archive", maxCount: 1 },
    { name: "patients", maxCount: 1 },
  ]),
  async (req, res): Promise<void> => {
    const files = req.files as Record<string, Express.Multer.File[]>;
    const archiveFile = files?.["archive"]?.[0];
    const patientsFile = files?.["patients"]?.[0];

    if (!archiveFile) {
      res.status(400).json({ error: "archive file is required" });
      return;
    }

    const summary: ImportSummary = {
      patientsCreated: 0,
      patientsMatched: 0,
      imagesImported: 0,
      errors: [],
    };

    const patientMap = patientsFile
      ? parseCSV(patientsFile.buffer.toString("utf-8"))
      : new Map<string, PatientInfo>();

    let zip: AdmZip;
    try {
      zip = new AdmZip(archiveFile.buffer);
    } catch {
      res.status(400).json({ error: "Could not open ZIP archive" });
      return;
    }

    const storageDir = await getStorageDirectory();

    // Detect whether the ZIP has a single root wrapper folder (e.g. foto/2116/img.jpg)
    // vs. patient folders directly at the root (e.g. 2116/img.jpg).
    const topLevelNames = new Set<string>();
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const parts = entry.entryName.replace(/\\/g, "/").split("/");
      if (parts.length < 2) continue;
      const ext = path.extname(parts[parts.length - 1]).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;
      topLevelNames.add(parts[0]);
    }
    // patientDepth: 0 = top-level folders are patient codes (2116/img.jpg)
    //               1 = one wrapper folder exists (foto/2116/img.jpg)
    const patientDepth = topLevelNames.size === 1 ? 1 : 0;

    // Group ZIP entries by patient code
    const byPatient = new Map<string, AdmZip.IZipEntry[]>();
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const parts = entry.entryName.replace(/\\/g, "/").split("/");
      if (parts.length < patientDepth + 2) continue;
      const patientCode = parts[patientDepth];
      const ext = path.extname(parts[parts.length - 1]).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;
      if (!byPatient.has(patientCode)) byPatient.set(patientCode, []);
      byPatient.get(patientCode)!.push(entry);
    }

    for (const [patientCode, entries] of byPatient) {
      const dbPatient = await upsertPatient(req, patientCode, patientMap, summary);

      for (const entry of entries) {
        const fileName = path.basename(entry.entryName);
        try {
          const buffer = entry.getData();
          let capturedAt = await extractExifDate(buffer);
          if (!capturedAt) {
            const zipDate = entry.header.time;
            capturedAt =
              zipDate instanceof Date && !isNaN(zipDate.getTime()) ? zipDate : new Date();
          }
          await saveImage(dbPatient.id, fileName, buffer, capturedAt, storageDir);
          summary.imagesImported++;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`[bulk-import/zip] failed to save ${entry.entryName}:`, reason);
          summary.errors.push({ file: entry.entryName, reason });
        }
      }
    }

    await logAudit(req, "bulk_import", "image", 0, JSON.stringify({
      patientsCreated: summary.patientsCreated,
      patientsMatched: summary.patientsMatched,
      imagesImported: summary.imagesImported,
      errors: summary.errors.length,
      source: "zip",
    }));

    res.json(summary);
  },
);

// ─── Server-folder import ─────────────────────────────────────────────────────

function walkImageFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkImageFiles(fullPath));
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

router.post(
  "/import/folder",
  importUpload.fields([{ name: "patients", maxCount: 1 }]),
  async (req, res): Promise<void> => {
    const files = req.files as Record<string, Express.Multer.File[]>;
    const patientsFile = files?.["patients"]?.[0];
    const folderPath = (req.body as { folderPath?: string }).folderPath?.trim();

    if (!folderPath) {
      res.status(400).json({ error: "folderPath is required" });
      return;
    }

    // Accept both Unix (/data/photos) and Windows (C:\fotos) absolute paths
    const isAbsolute = path.isAbsolute(folderPath) || /^[a-zA-Z]:[\\\/]/.test(folderPath);
    if (!isAbsolute) {
      res.status(400).json({ error: "folderPath must be an absolute path (e.g. /data/photos or C:\\fotos)" });
      return;
    }

    try {
      const stat = fs.statSync(folderPath);
      if (!stat.isDirectory()) {
        res.status(400).json({ error: "The path exists but is not a folder" });
        return;
      }
    } catch {
      res.status(400).json({ error: `Folder not found or not accessible by the server: ${folderPath}` });
      return;
    }

    const summary: ImportSummary = {
      patientsCreated: 0,
      patientsMatched: 0,
      imagesImported: 0,
      errors: [],
    };

    try {
      const patientMap = patientsFile
        ? parseCSV(patientsFile.buffer.toString("utf-8"))
        : new Map<string, PatientInfo>();

      // Walk all image files and get paths relative to folderPath
      const allImagePaths = walkImageFiles(folderPath);

      if (allImagePaths.length === 0) {
        res.json({ ...summary, errors: [{ file: folderPath, reason: "No image files found in this folder" }] });
        return;
      }

      const relPaths = allImagePaths.map((p) =>
        path.relative(folderPath, p).replace(/\\/g, "/"),
      );

      // Same wrapper detection as ZIP importer:
      // if every image shares the same top-level folder, peel it off
      const topLevelNames = new Set<string>();
      for (const rel of relPaths) {
        const parts = rel.split("/");
        if (parts.length >= 2) topLevelNames.add(parts[0]);
      }
      const patientDepth = topLevelNames.size === 1 ? 1 : 0;

      // Group by patient code
      const byPatient = new Map<string, string[]>(); // patientCode → absolute paths
      for (let i = 0; i < relPaths.length; i++) {
        const parts = relPaths[i].split("/");
        if (parts.length < patientDepth + 2) continue;
        const patientCode = parts[patientDepth];
        if (!byPatient.has(patientCode)) byPatient.set(patientCode, []);
        byPatient.get(patientCode)!.push(allImagePaths[i]);
      }

      if (byPatient.size === 0) {
        res.json({ ...summary, errors: [{ file: folderPath, reason: "No patient subfolders found. Images must be inside subfolders named with the patient ID (e.g. C:\\fotos\\2116\\photo.jpg)" }] });
        return;
      }

      const storageDir = await getStorageDirectory();

      for (const [patientCode, filePaths] of byPatient) {
        const dbPatient = await upsertPatient(req, patientCode, patientMap, summary);

        for (const srcPath of filePaths) {
          const fileName = path.basename(srcPath);
          try {
            const buffer = fs.readFileSync(srcPath);
            let capturedAt = await extractExifDate(buffer);
            if (!capturedAt) {
              const stat = fs.statSync(srcPath);
              capturedAt = stat.mtime ?? new Date();
            }
            await saveImage(dbPatient.id, fileName, buffer, capturedAt, storageDir);
            summary.imagesImported++;
          } catch (err) {
            summary.errors.push({
              file: srcPath,
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      await logAudit(req, "bulk_import", "image", 0, JSON.stringify({
        folderPath,
        patientsCreated: summary.patientsCreated,
        patientsMatched: summary.patientsMatched,
        imagesImported: summary.imagesImported,
        errors: summary.errors.length,
        source: "folder",
      }));

      res.json(summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Import failed: ${msg}` });
    }
  },
);

export default router;
