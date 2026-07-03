import { db, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
export const MIN_IDLE_TIMEOUT_MINUTES = 5;
export const MAX_IDLE_TIMEOUT_MINUTES = 240;

async function getTenantSettings(tenantId: number | null | undefined): Promise<Record<string, unknown>> {
  if (!tenantId) return {};
  const [tenant] = await db
    .select({ settings: tenantsTable.settings })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  if (!tenant?.settings) return {};
  try {
    const parsed = JSON.parse(tenant.settings);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function isValidIdleTimeoutMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_IDLE_TIMEOUT_MINUTES &&
    value <= MAX_IDLE_TIMEOUT_MINUTES
  );
}

export async function getTenantIdleTimeoutMinutes(tenantId: number | null | undefined): Promise<number> {
  const settings = await getTenantSettings(tenantId);
  const raw = settings["idleTimeoutMinutes"];
  return isValidIdleTimeoutMinutes(raw) ? raw : DEFAULT_IDLE_TIMEOUT_MINUTES;
}

export async function setTenantIdleTimeoutMinutes(tenantId: number, minutes: number): Promise<void> {
  const settings = await getTenantSettings(tenantId);
  settings["idleTimeoutMinutes"] = minutes;
  await db.update(tenantsTable).set({ settings: JSON.stringify(settings) }).where(eq(tenantsTable.id, tenantId));
}
