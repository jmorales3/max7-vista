import { Router, type IRouter } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { db, patientsTable, imagesTable, usersTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth";
import { getStorageDirectory, setSetting } from "../lib/storage";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

const MIGRATION_VERSION = "1";

// ─── Export ──────────────────────────────────────────────────────────────────

router.get(
  "/migration/export",
  requireRole("superadmin"),
  async (req, res): Promise<void> => {
    try {
      const patients = await db.select().from(patientsTable).orderBy(patientsTable.id);
      const images   = await db.select().from(imagesTable).orderBy(imagesTable.id);
      const users    = await db.select().from(usersTable).orderBy(usersTable.id);
      const settings = await db.select().from(settingsTable);

      const zip = new AdmZip();

      // Build a patientId → patientCode map for portable image references
      const idToCode = new Map(patients.map((p) => [p.id, p.patientCode]));

      const exportedImages = images.map((img) => ({
        patientCode: idToCode.get(img.patientId ?? -1) ?? null,
        fileName: img.fileName,
        notes: img.notes ?? null,
        capturedAt: img.capturedAt instanceof Date
          ? img.capturedAt.toISOString()
          : String(img.capturedAt),
        isUnassigned: img.isUnassigned,
        // relative path inside the ZIP's files/ folder
        zipPath: img.filePath
          ? `files/${idToCode.get(img.patientId ?? -1) ?? "unassigned"}/${path.basename(img.filePath)}`
          : null,
        _srcPath: img.filePath,
      }));

      const exportedUsers = users.map((u) => ({
        username: u.username,
        passwordHash: u.passwordHash,
        role: u.role,
        isActive: u.isActive,
      }));

      const manifest = {
        version: MIGRATION_VERSION,
        exportedAt: new Date().toISOString(),
        stats: {
          patients: patients.length,
          images: images.length,
          users: users.length,
          settings: settings.length,
        },
      };

      zip.addFile("manifest.json",     Buffer.from(JSON.stringify(manifest,         null, 2)));
      zip.addFile("data/patients.json", Buffer.from(JSON.stringify(patients,         null, 2)));
      zip.addFile("data/images.json",   Buffer.from(JSON.stringify(exportedImages,   null, 2)));
      zip.addFile("data/users.json",    Buffer.from(JSON.stringify(exportedUsers,    null, 2)));
      zip.addFile("data/settings.json", Buffer.from(JSON.stringify(settings,         null, 2)));

      // Embed the actual image files
      let filesAdded = 0;
      for (const img of exportedImages) {
        if (!img._srcPath || !img.zipPath) continue;
        try {
          const buf = fs.readFileSync(img._srcPath);
          zip.addFile(img.zipPath, buf);
          filesAdded++;
        } catch {
          // file missing on disk — skip, record is still exported
        }
      }

      const dateSuffix = new Date().toISOString().slice(0, 10);
      const filename = `max7-vista-migration-${dateSuffix}.zip`;

      await logAudit(req, "migration_export", "system", null,
        JSON.stringify({ patients: patients.length, images: images.length, filesAdded }));

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(zip.toBuffer());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[migration] export failed:", msg);
      res.status(500).json({ error: `Export failed: ${msg}` });
    }
  },
);

// ─── Import ──────────────────────────────────────────────────────────────────

interface ExportedImage {
  patientCode: string | null;
  fileName: string;
  notes: string | null;
  capturedAt: string;
  isUnassigned: boolean | number;
  zipPath: string | null;
}

interface ExportedUser {
  username: string;
  passwordHash: string;
  role: string;
  isActive: boolean | number;
}

interface ExportedSetting {
  key: string;
  value: string;
}

interface ExportedPatient {
  name: string;
  patientCode: string;
  dateOfBirth: string | null;
  notes: string | null;
}

router.post(
  "/migration/import",
  requireRole("superadmin"),
  upload.single("archive"),
  async (req, res): Promise<void> => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "archive file is required" });
      return;
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(file.buffer);
    } catch {
      res.status(400).json({ error: "Could not open ZIP archive" });
      return;
    }

    const summary = {
      patientsImported: 0,
      patientsSkipped: 0,
      imagesImported: 0,
      imagesSkipped: 0,
      usersImported: 0,
      usersSkipped: 0,
      settingsApplied: 0,
      errors: [] as Array<{ item: string; reason: string }>,
    };

    try {
      // ── Read manifest ──────────────────────────────────────────────────────
      const manifestEntry = zip.getEntry("manifest.json");
      if (!manifestEntry) {
        res.status(400).json({ error: "Not a valid Max7 Vista migration archive (missing manifest.json)" });
        return;
      }
      const manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
      if (manifest.version !== MIGRATION_VERSION) {
        res.status(400).json({ error: `Unsupported migration version: ${manifest.version}` });
        return;
      }

      const storageDir = await getStorageDirectory();

      // ── Patients ───────────────────────────────────────────────────────────
      const patientsEntry = zip.getEntry("data/patients.json");
      if (patientsEntry) {
        const exportedPatients: ExportedPatient[] = JSON.parse(patientsEntry.getData().toString("utf-8"));
        for (const p of exportedPatients) {
          try {
            const [existing] = await db.select({ id: patientsTable.id })
              .from(patientsTable)
              .where(eq(patientsTable.patientCode, p.patientCode));
            if (existing) {
              summary.patientsSkipped++;
            } else {
              await db.insert(patientsTable).values({
                name: p.name,
                patientCode: p.patientCode,
                dateOfBirth: p.dateOfBirth ?? null,
                notes: p.notes ?? null,
              });
              summary.patientsImported++;
            }
          } catch (err) {
            summary.errors.push({ item: `patient:${p.patientCode}`, reason: err instanceof Error ? err.message : String(err) });
          }
        }
      }

      // Refresh patientCode → id map after import
      const allPatients = await db.select({ id: patientsTable.id, patientCode: patientsTable.patientCode }).from(patientsTable);
      const codeToId = new Map(allPatients.map((p) => [p.patientCode, p.id]));

      // ── Images ─────────────────────────────────────────────────────────────
      const imagesEntry = zip.getEntry("data/images.json");
      if (imagesEntry) {
        const exportedImages: ExportedImage[] = JSON.parse(imagesEntry.getData().toString("utf-8"));
        for (const img of exportedImages) {
          try {
            const patientId = img.patientCode ? (codeToId.get(img.patientCode) ?? null) : null;
            const capturedAt = new Date(img.capturedAt);
            const dateStr = (!isNaN(capturedAt.getTime()) ? capturedAt : new Date()).toISOString().split("T")[0];

            // Determine target directory
            const subDir = patientId
              ? path.join(storageDir, String(patientId), dateStr)
              : path.join(storageDir, "unassigned", dateStr);
            fs.mkdirSync(subDir, { recursive: true });

            const ext = path.extname(img.fileName) || ".jpg";
            const storedName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
            const destPath = path.join(subDir, storedName);

            // Extract image file from ZIP if present
            let fileWritten = false;
            if (img.zipPath) {
              const fileEntry = zip.getEntry(img.zipPath);
              if (fileEntry) {
                fs.writeFileSync(destPath, fileEntry.getData());
                fileWritten = true;
              }
            }

            await db.insert(imagesTable).values({
              patientId: patientId ?? undefined,
              filePath: fileWritten ? destPath : (img.zipPath ?? ""),
              fileName: img.fileName,
              notes: img.notes ?? null,
              capturedAt: capturedAt,
              isUnassigned: (img.isUnassigned ? 1 : 0) as unknown as boolean,
            });
            summary.imagesImported++;
          } catch (err) {
            summary.errors.push({ item: `image:${img.fileName}`, reason: err instanceof Error ? err.message : String(err) });
            summary.imagesSkipped++;
          }
        }
      }

      // ── Users ──────────────────────────────────────────────────────────────
      const usersEntry = zip.getEntry("data/users.json");
      if (usersEntry) {
        const exportedUsers: ExportedUser[] = JSON.parse(usersEntry.getData().toString("utf-8"));
        for (const u of exportedUsers) {
          try {
            const [existing] = await db.select({ id: usersTable.id })
              .from(usersTable)
              .where(eq(usersTable.username, u.username));
            if (existing) {
              summary.usersSkipped++;
            } else {
              // Validate the stored hash looks like bcrypt before inserting
              const isValidHash = /^\$2[aby]\$\d+\$/.test(u.passwordHash);
              const hash = isValidHash ? u.passwordHash : await bcrypt.hash("ChangeMe123!", 10);
              await db.insert(usersTable).values({
                username: u.username,
                passwordHash: hash,
                role: (["user", "admin", "superadmin"].includes(u.role) ? u.role : "user") as "user" | "admin" | "superadmin",
                isActive: Boolean(u.isActive),
              });
              summary.usersImported++;
            }
          } catch (err) {
            summary.errors.push({ item: `user:${u.username}`, reason: err instanceof Error ? err.message : String(err) });
          }
        }
      }

      // ── Settings ───────────────────────────────────────────────────────────
      const settingsEntry = zip.getEntry("data/settings.json");
      if (settingsEntry) {
        const exportedSettings: ExportedSetting[] = JSON.parse(settingsEntry.getData().toString("utf-8"));
        const SKIP_KEYS = new Set(["storageDirectory"]); // keep target system's paths
        for (const s of exportedSettings) {
          if (SKIP_KEYS.has(s.key)) continue;
          try {
            await setSetting(s.key, s.value);
            summary.settingsApplied++;
          } catch (err) {
            summary.errors.push({ item: `setting:${s.key}`, reason: err instanceof Error ? err.message : String(err) });
          }
        }
      }

      await logAudit(req, "migration_import", "system", null, JSON.stringify({
        patientsImported: summary.patientsImported,
        imagesImported: summary.imagesImported,
        usersImported: summary.usersImported,
        errors: summary.errors.length,
      }));

      res.json(summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[migration] import failed:", msg);
      res.status(500).json({ error: `Import failed: ${msg}` });
    }
  },
);

export default router;
