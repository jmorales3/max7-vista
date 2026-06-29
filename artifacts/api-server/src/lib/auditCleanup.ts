import { db, auditLogTable } from "@workspace/db";
import { lt } from "drizzle-orm";
import { getSetting, setSetting } from "./storage";

export const AUDIT_RETENTION_SETTING_KEY = "auditRetentionYears";
export const DEFAULT_AUDIT_RETENTION_YEARS = 6;

export async function getAuditRetentionYears(): Promise<number> {
  const raw = await getSetting(AUDIT_RETENTION_SETTING_KEY);
  if (!raw) return DEFAULT_AUDIT_RETENTION_YEARS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AUDIT_RETENTION_YEARS;
}

export async function setAuditRetentionYears(years: number): Promise<void> {
  await setSetting(AUDIT_RETENTION_SETTING_KEY, String(years));
}

export async function performAuditCleanup(retentionYears?: number): Promise<{ deleted: number; retentionYears: number; cutoffDate: string }> {
  const years = retentionYears ?? (await getAuditRetentionYears());
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);

  const deleted = await db
    .delete(auditLogTable)
    .where(lt(auditLogTable.createdAt, cutoff));

  const deletedCount = (deleted as any)?.rowCount ?? (deleted as any)?.changes ?? 0;

  return {
    deleted: typeof deletedCount === "number" ? deletedCount : 0,
    retentionYears: years,
    cutoffDate: cutoff.toISOString(),
  };
}

export function scheduleAuditCleanup(logger: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void }) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  async function runCleanup() {
    try {
      const result = await performAuditCleanup();
      logger.info(
        { deleted: result.deleted, retentionYears: result.retentionYears, cutoffDate: result.cutoffDate },
        "Audit log cleanup complete"
      );
    } catch (err) {
      logger.warn({ err }, "Audit log cleanup failed");
    }
  }

  runCleanup();

  setInterval(runCleanup, MS_PER_DAY);
}
