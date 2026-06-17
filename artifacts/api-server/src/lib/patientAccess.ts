import { db, patientAccessTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const CACHE_KEY = Symbol("accessiblePatientIds");

/**
 * Returns the set of patient IDs this request's user is allowed to access,
 * or null if there is no restriction (admin/superadmin, or user with no rows).
 *
 * Result is memoized on the request object for the lifetime of the request
 * to avoid repeated DB round-trips within the same handler chain.
 *
 * - null     → unrestricted (see all patients)
 * - number[] → restricted to these patient IDs (≥1 element)
 */
export async function getAccessiblePatientIds(req: any): Promise<number[] | null> {
  if (CACHE_KEY in req) return req[CACHE_KEY] as number[] | null;

  const userId = req.session?.userId as number | undefined;
  const tenantId = req.session?.tenantId as number | undefined;
  const role = req.session?.role as string | undefined;

  let result: number[] | null = null;

  if (userId && tenantId && role !== "admin" && role !== "superadmin") {
    const rows = await db
      .select({ patientId: patientAccessTable.patientId })
      .from(patientAccessTable)
      .where(
        and(
          eq(patientAccessTable.tenantId, tenantId),
          eq(patientAccessTable.userId, userId),
        ),
      );

    if (rows.length > 0) {
      result = rows.map((r) => r.patientId);
    }
  }

  req[CACHE_KEY] = result;
  return result;
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
