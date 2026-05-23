import path from "path";
import fs from "fs";
import { logger } from "./logger";

const MAX_BACKUPS = 7;

export function getDbPath(): string {
  return process.env["DATABASE_PATH"] ?? "";
}

export function getBackupDir(): string {
  const envDir = process.env["BACKUP_DIR"];
  if (envDir) return envDir;
  const dbPath = getDbPath();
  if (dbPath && dbPath !== ":memory:") {
    return path.join(path.dirname(dbPath), "backups");
  }
  return path.join(process.cwd(), "backups");
}

export interface BackupEntry {
  filename: string;
  createdAt: string;
  sizeBytes: number;
}

export function listBackups(): BackupEntry[] {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) return [];

  const entries = fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".db"))
    .map((filename) => {
      const fullPath = path.join(backupDir, filename);
      const stat = fs.statSync(fullPath);
      return {
        filename,
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return entries;
}

export async function performBackup(): Promise<BackupEntry> {
  const dbPath = getDbPath();
  if (!dbPath || dbPath === ":memory:") {
    throw new Error("No database file configured — backup is only available in Electron mode.");
  }

  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `patient-images-backup-${timestamp}.db`;
  const destPath = path.join(backupDir, filename);

  const { db } = await import("@workspace/db");
  const raw = db as unknown as { $client: { backup: (dest: string) => Promise<void> } };
  await raw.$client.backup(destPath);

  const stat = fs.statSync(destPath);
  const entry: BackupEntry = {
    filename,
    createdAt: now.toISOString(),
    sizeBytes: stat.size,
  };

  pruneOldBackups(backupDir);

  logger.info({ filename, sizeBytes: entry.sizeBytes }, "Database backup completed");
  return entry;
}

function pruneOldBackups(backupDir: string): void {
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".db"))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
    .sort((a, b) => b.mtime - a.mtime);

  const toDelete = files.slice(MAX_BACKUPS);
  for (const file of toDelete) {
    fs.unlinkSync(path.join(backupDir, file.name));
    logger.info({ filename: file.name }, "Pruned old backup");
  }
}

export async function restoreBackup(filename: string): Promise<void> {
  const backupDir = getBackupDir();
  const sourcePath = path.join(backupDir, filename);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Backup file not found: ${filename}`);
  }

  const safe = path.basename(sourcePath);
  if (safe !== filename || !filename.endsWith(".db")) {
    throw new Error("Invalid backup filename.");
  }

  const dbPath = getDbPath();
  if (!dbPath || dbPath === ":memory:") {
    throw new Error("No database file configured — restore is only available in Electron mode.");
  }

  const walPath = dbPath + "-wal";
  const shmPath = dbPath + "-shm";
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

  fs.copyFileSync(sourcePath, dbPath);
  logger.info({ filename, dbPath }, "Database restored from backup");
}

const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function scheduleAutoBackup(): void {
  if (process.env["ELECTRON_MODE"] !== "true") return;

  const runBackup = async () => {
    try {
      await performBackup();
    } catch (err) {
      logger.warn({ err }, "Scheduled auto-backup failed");
    }
  };

  const checkAndBackup = async () => {
    const backups = listBackups();
    if (backups.length === 0) {
      await runBackup();
      return;
    }
    const lastBackupTime = new Date(backups[0].createdAt).getTime();
    const hoursSinceLast = (Date.now() - lastBackupTime) / 1000 / 3600;
    if (hoursSinceLast >= 24) {
      await runBackup();
    }
  };

  checkAndBackup().catch((err) => {
    logger.warn({ err }, "Initial backup check failed");
  });

  setInterval(runBackup, AUTO_BACKUP_INTERVAL_MS);

  logger.info("Auto-backup scheduler started (daily, up to 7 copies)");
}
