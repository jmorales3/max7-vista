import { db, patientAccessTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/**
 * Returns the set of patient IDs this request's user is allowed to access,
 * or null if there is no restriction (admin/superadmin, or user with no rows).
 *
 * - null  → unrestricted (see all patients)
 * - number[] → restricted to these patient IDs (at least 1 element)
 */
export async function getAccessiblePatientIds(req: any): Promise<number[] | null> {
  const userId = req.session?.userId as number | undefined;
  const tenantId = req.session?.tenantId as number | undefined;
  const role = req.session?.role as string | undefined;

  if (!userId || !tenantId) return null;

  if (role === "admin" || role === "superadmin") return null;

  const rows = await db
    .select({ patientId: patientAccessTable.patientId })
    .from(patientAccessTable)
    .where(
      and(
        eq(patientAccessTable.tenantId, tenantId),
        eq(patientAccessTable.userId, userId),
      ),
    );

  if (rows.length === 0) return null;

  return rows.map((r) => r.patientId);
}

/**
 * Returns true if the user can access this patientId.
 * Pass the result of getAccessiblePatientIds to avoid a second DB round-trip.
 */
export function canAccessPatient(
  accessibleIds: number[] | null,
  patientId: number | null | undefined,
): boolean {
  if (accessibleIds === null) return true;
  if (patientId == null) return false;
  return accessibleIds.includes(patientId);
}
