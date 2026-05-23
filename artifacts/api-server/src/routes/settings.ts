import { Router, type IRouter } from "express";
import fs from "fs";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { getStorageDirectory, getSetting, setSetting } from "../lib/storage";
import { scanDirectory } from "../lib/scanDirectory";
import { listBackups, performBackup, restoreBackup } from "../lib/backup";

const router: IRouter = Router();

router.get("/settings", async (_req, res): Promise<void> => {
  const storageDirectory = await getStorageDirectory();
  const lastScanAt = await getSetting("lastScanAt");

  const backups = listBackups();
  const lastBackupAt = backups.length > 0 ? backups[0].createdAt : null;

  res.json({
    storageDirectory,
    lastScanAt: lastScanAt ?? null,
    lastBackupAt,
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

  const backups = listBackups();
  const lastBackupAt = backups.length > 0 ? backups[0].createdAt : null;

  res.json({
    storageDirectory,
    lastScanAt: lastScanAt ?? null,
    lastBackupAt,
  });
});

router.post("/settings/scan-directory", async (_req, res): Promise<void> => {
  const storageDir = await getStorageDirectory();
  const result = await scanDirectory(storageDir);
  res.json(result);
});

router.get("/settings/backups", (_req, res): void => {
  if (process.env["ELECTRON_MODE"] !== "true") {
    res.status(400).json({ error: "Backups are only available in Electron mode." });
    return;
  }
  const backups = listBackups();
  res.json({ backups });
});

router.post("/settings/backup", async (_req, res): Promise<void> => {
  if (process.env["ELECTRON_MODE"] !== "true") {
    res.status(400).json({ error: "Backups are only available in Electron mode." });
    return;
  }
  try {
    const backup = await performBackup();
    res.json({ backup });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backup failed";
    res.status(500).json({ error: message });
  }
});

router.post("/settings/restore", async (req, res): Promise<void> => {
  if (process.env["ELECTRON_MODE"] !== "true") {
    res.status(400).json({ error: "Restore is only available in Electron mode." });
    return;
  }
  const { filename } = req.body as { filename?: string };
  if (!filename || typeof filename !== "string") {
    res.status(400).json({ error: "filename is required" });
    return;
  }
  try {
    await restoreBackup(filename);
    res.json({ success: true, message: "Database restored. Please restart the application." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed";
    res.status(500).json({ error: message });
  }
});

export default router;
