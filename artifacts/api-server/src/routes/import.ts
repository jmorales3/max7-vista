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
  const idIdx = header.findIndex((h) => h === "id" || h === "patientid" || h === "patient_id");
  const nameIdx = header.findIndex((h) => h === "name" || h === "patientname");
  const dobIdx = header.findIndex(
    (h) =>
      h === "dob" ||
      h === "dateofbirth" ||
      h === "date_of_birth" ||
      h === "birthdate" ||
      h === "birth_date",
  );

  if (idIdx === -1) return map;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    const id = cols[idIdx]?.replace(/['"]/g, "").trim();
    if (!id) continue;
    const name =
      nameIdx >= 0 ? (cols[nameIdx]?.replace(/['"]/g, "").trim() || id) : id;
    const rawDob =
      dobIdx >= 0 ? cols[dobIdx]?.replace(/['"]/g, "").trim() : undefined;
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
    if (!patientsFile) {
      res.status(400).json({ error: "patients CSV file is required" });
      return;
    }

    const summary: ImportSummary = {
      patientsCreated: 0,
      patientsMatched: 0,
      imagesImported: 0,
      errors: [],
    };

    const csvText = patientsFile.buffer.toString("utf-8");
    const patientMap = parseCSV(csvText);

    if (patientMap.size === 0) {
      res.status(400).json({
        error:
          "CSV could not be parsed. Ensure it has an 'id' column plus 'name' and optionally 'dateOfBirth'.",
      });
      return;
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(archiveFile.buffer);
    } catch {
      res.status(400).json({ error: "Could not open ZIP archive" });
      return;
    }

    const storageDir = await getStorageDirectory();

    // Group ZIP entries by top-level folder (= patient code)
    const byPatient = new Map<string, AdmZip.IZipEntry[]>();
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const parts = entry.entryName.replace(/\\/g, "/").split("/");
      if (parts.length < 2) continue; // root-level file — skip
      const patientCode = parts[0];
      const ext = path.extname(parts[parts.length - 1]).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;
      if (!byPatient.has(patientCode)) byPatient.set(patientCode, []);
      byPatient.get(patientCode)!.push(entry);
    }

    for (const [patientCode, entries] of byPatient) {
      // Upsert patient
      let dbPatient: { id: number } | undefined;
      const [existing] = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(eq(patientsTable.patientCode, patientCode));

      if (existing) {
        dbPatient = existing;
        summary.patientsMatched++;
      } else {
        const csvInfo = patientMap.get(patientCode);
        const [created] = await db
          .insert(patientsTable)
          .values({
            patientCode,
            name: csvInfo?.name ?? patientCode,
            dateOfBirth: csvInfo?.dateOfBirth ?? null,
          })
          .returning({ id: patientsTable.id });
        dbPatient = created;
        summary.patientsCreated++;
        await logAudit(
          req,
          "create",
          "patient",
          created.id,
          JSON.stringify({ patientCode, source: "bulk-import" }),
        );
      }

      // Import each image
      for (const entry of entries) {
        const fileName = path.basename(entry.entryName);
        try {
          const buffer = entry.getData();

          // EXIF date → ZIP mod date → now
          let capturedAt = await extractExifDate(buffer);
          if (!capturedAt) {
            const zipDate = entry.header.time;
            capturedAt =
              zipDate instanceof Date && !isNaN(zipDate.getTime()) ? zipDate : new Date();
          }

          const dateStr = capturedAt.toISOString().split("T")[0];
          const subFolder = path.join(storageDir, String(dbPatient.id), dateStr);
          fs.mkdirSync(subFolder, { recursive: true });

          const ext = path.extname(fileName) || ".jpg";
          const storedName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
          const filePath = path.join(subFolder, storedName);
          fs.writeFileSync(filePath, buffer);

          // Legend = filename without extension
          const legend = path.basename(fileName, ext).replace(/[_-]+/g, " ").trim();

          await db.insert(imagesTable).values({
            patientId: dbPatient.id,
            filePath,
            fileName,
            notes: legend || null,
            capturedAt,
            isUnassigned: false,
          });

          summary.imagesImported++;
        } catch (err) {
          summary.errors.push({
            file: entry.entryName,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    await logAudit(
      req,
      "bulk_import",
      "image",
      0,
      JSON.stringify({
        patientsCreated: summary.patientsCreated,
        patientsMatched: summary.patientsMatched,
        imagesImported: summary.imagesImported,
        errors: summary.errors.length,
      }),
    );

    res.json(summary);
  },
);

export default router;
