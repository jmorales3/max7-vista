import { db, patientsTable } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { getTenantSettings, setTenantSetting } from "./tenantSettings";

// A conservative default aligned with common state medical-record retention
// requirements (many states require 7-10 years for adults). Tenants can
// raise or lower this via admin settings; 0 disables automatic eligibility
// (i.e. nothing is ever flagged for purge).
export const DEFAULT_RETENTION_YEARS = 10;
export const MIN_RETENTION_YEARS = 1;
export const MAX_RETENTION_YEARS = 50;

export function isValidRetentionYears(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_RETENTION_YEARS &&
    value <= MAX_RETENTION_YEARS
  );
}

export async function getPatientRetentionYears(tenantId: number | null | undefined): Promise<number> {
  const settings = await getTenantSettings(tenantId);
  const raw = settings["patientRetentionYears"];
  return isValidRetentionYears(raw) ? raw : DEFAULT_RETENTION_YEARS;
}

export async function setPatientRetentionYears(tenantId: number, years: number): Promise<void> {
  await setTenantSetting(tenantId, "patientRetentionYears", years);
}

function retentionCutoffDate(retentionYears: number): Date {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - retentionYears);
  return cutoff;
}

// A patient becomes purge-eligible once their record has been inactive
// (no edits/uploads, tracked via updatedAt) for longer than the tenant's
// configured retention period, and is NOT on legal hold. Legal hold always
// wins regardless of age.
export async function listPurgeEligiblePatients(tenantId: number) {
  const retentionYears = await getPatientRetentionYears(tenantId);
  const cutoff = retentionCutoffDate(retentionYears);

  return db
    .select({
      id: patientsTable.id,
      name: patientsTable.name,
      patientCode: patientsTable.patientCode,
      updatedAt: patientsTable.updatedAt,
      legalHold: patientsTable.legalHold,
    })
    .from(patientsTable)
    .where(
      and(
        eq(patientsTable.tenantId, tenantId),
        eq(patientsTable.legalHold, false),
        lt(patientsTable.updatedAt, cutoff),
      ),
    );
}
