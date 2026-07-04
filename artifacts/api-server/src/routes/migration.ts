import { Router, type IRouter } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { db, patientsTable, imagesTable, usersTable, settingsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth";
import { setSetting } from "../lib/storage";
import { readFileAsBuffer, uploadToGcs } from "../lib/gcsStorage";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

function tid(req: { session?: { tenantId?: number } }): number {
  const t = req.session?.tenantId;
  if (!t) throw Object.assign(new Error("No tenant associated with this session"), { status: 403 });
  return t;
}

const MIGRATION_VERSION = "1";

// ─── Export ──────────────────────────────────────────────────────────────────

router.get(
  "/migration/export",
  requireRole("superadmin"),
  async (req, res): Promise<void> => {
    try {
      // Superadministrator is single-tenant: export must never leak another
      // tenant's PHI (patients/images) or credentials (users/settings).
      const tenantId = tid(req);
      const patients = await db.select().from(patientsTable)
        .where(eq(patientsTable.tenantId, tenantId))
        .orderBy(patientsTable.id);
      const patientIds = new Set(patients.map((p) => p.id));
      const imagesRaw  = await db.select().from(imagesTable).orderBy(imagesTable.id);
      const images     = imagesRaw.filter((img) => img.patientId != null && patientIds.has(img.patientId));
      const users    = await db.select().from(usersTable)
        .where(eq(usersTable.tenantId, tenantId))
        .orderBy(usersTable.id);
      const settings = await db.select().from(settingsTable);

      const zip = new AdmZip();

      // Build a patientId → patientCode map for portable image references
      const idToCode = new Map(patients.map((p) => [p.id, p.patientCode]));

      const exportedImages = images.map((img) => {
        // img.filePath may be "gcs:<objectName>" or a legacy absolute disk path.
        // Extract just the filename portion for the ZIP entry name.
        const rawPath = img.filePath ?? "";
        const baseName = rawPath.startsWith("gcs:")
          ? path.basename(rawPath.slice(4))   // strip "gcs:" prefix before basename
          : path.basename(rawPath);
        return {
          patientCode: idToCode.get(img.patientId ?? -1) ?? null,
          fileName: img.fileName,
          mediaType: img.mediaType ?? "image",
          notes: img.notes ?? null,
          capturedAt: img.capturedAt instanceof Date
            ? img.capturedAt.toISOString()
            : String(img.capturedAt),
          isUnassigned: img.isUnassigned,
          // relative path inside the ZIP's files/ folder
          zipPath: rawPath
            ? `files/${idToCode.get(img.patientId ?? -1) ?? "unassigned"}/${baseName}`
            : null,
          _srcPath: rawPath,
        };
      });

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

      // Embed the actual image files (handles both "gcs:" keys and legacy disk paths)
      let filesAdded = 0;
      for (const img of exportedImages) {
        if (!img._srcPath || !img.zipPath) continue;
        try {
          const buf = await readFileAsBuffer(img._srcPath);
          if (buf) {
            zip.addFile(img.zipPath, buf);
            filesAdded++;
          }
          // file missing — skip silently, manifest record is still exported
        } catch {
          // ignore individual file errors
        }
      }

      const dateSuffix = new Date().toISOString().slice(0, 10);
      const filename = `max7-vista-migration-${dateSuffix}.zip`;

      logAudit(req, "migration_export", "system", null,
        { patients: patients.length, images: images.length, filesAdded });

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
  mediaType?: string;
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

      // ── Patients ───────────────────────────────────────────────────────────
      const tenantId = tid(req);
      const patientsEntry = zip.getEntry("data/patients.json");
      if (patientsEntry) {
        const exportedPatients: ExportedPatient[] = JSON.parse(patientsEntry.getData().toString("utf-8"));
        for (const p of exportedPatients) {
          try {
            const [existing] = await db.select({ id: patientsTable.id })
              .from(patientsTable)
              .where(and(eq(patientsTable.tenantId, tenantId), eq(patientsTable.patientCode, p.patientCode)));
            if (existing) {
              summary.patientsSkipped++;
            } else {
              await db.insert(patientsTable).values({
                tenantId,
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
      const allPatients = await db.select({ id: patientsTable.id, patientCode: patientsTable.patientCode })
        .from(patientsTable)
        .where(eq(patientsTable.tenantId, tenantId));
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

            const ext = path.extname(img.fileName) || ".jpg";
            const storedName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
            const objectName = patientId
              ? `images/${patientId}/${dateStr}/${storedName}`
              : `images/unassigned/${dateStr}/${storedName}`;
            const mimeType = img.mediaType === "video" ? "video/mp4" : "image/jpeg";

            // Extract file from ZIP and store via the storage adapter
            // (uploadToGcs → GCS on cloud, local disk on Electron/LAN build)
            let storedFilePath: string | null = null;
            if (img.zipPath) {
              const fileEntry = zip.getEntry(img.zipPath);
              if (fileEntry) {
                storedFilePath = await uploadToGcs(fileEntry.getData(), objectName, mimeType);
              } else {
                // File was expected in ZIP but not found — skip this record entirely
                // to avoid inserting a broken image row with no usable file path.
                summary.errors.push({ item: `image:${img.fileName}`, reason: "File entry not found in ZIP archive" });
                summary.imagesSkipped++;
                continue;
              }
            }
            // img.zipPath === null means the original record had no file (edge case); insert metadata only.

            await db.insert(imagesTable).values({
              patientId: patientId ?? undefined,
              filePath: storedFilePath ?? "",
              fileName: img.fileName,
              mediaType: img.mediaType ?? "image",
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
              // Validate the stored hash looks like bcrypt before inserting.
              // If invalid, skip — never create accounts with a fallback password.
              const isValidHash = /^\$2[aby]\$\d+\$/.test(u.passwordHash);
              if (!isValidHash) {
                summary.usersSkipped++;
                continue;
              }
              await db.insert(usersTable).values({
                tenantId,
                username: u.username,
                passwordHash: u.passwordHash,
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

      logAudit(req, "migration_import", "system", null, {
        patientsImported: summary.patientsImported,
        imagesImported: summary.imagesImported,
        usersImported: summary.usersImported,
        errors: summary.errors.length,
      });

      res.json(summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[migration] import failed:", msg);
      res.status(500).json({ error: `Import failed: ${msg}` });
    }
  },
);

export default router;
