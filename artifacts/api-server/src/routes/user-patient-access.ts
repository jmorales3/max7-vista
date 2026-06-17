import { Router } from "express";
import { db, patientAccessTable, patientsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth";

const router = Router();

function tid(req: any): number {
  const t = req.session?.tenantId as number | undefined;
  if (!t) throw Object.assign(new Error("No tenant associated with this session"), { status: 403 });
  return t;
}

// GET /api/users/:id/patient-access
// Returns { patientIds: number[] } — empty array means unrestricted
router.get(
  "/users/:id/patient-access",
  requireRole("admin", "superadmin"),
  async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
    const tenantId = tid(req);

    const rows = await db
      .select({ patientId: patientAccessTable.patientId })
      .from(patientAccessTable)
      .where(
        and(
          eq(patientAccessTable.tenantId, tenantId),
          eq(patientAccessTable.userId, userId),
        ),
      );

    res.json({ patientIds: rows.map((r) => r.patientId) });
  },
);

// PUT /api/users/:id/patient-access
// Atomically replaces the full set. Send { patientIds: [] } to remove all restrictions.
router.put(
  "/users/:id/patient-access",
  requireRole("admin", "superadmin"),
  async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
    const tenantId = tid(req);

    const { patientIds } = req.body as { patientIds?: unknown };
    if (!Array.isArray(patientIds)) {
      res.status(400).json({ error: "patientIds must be an array" });
      return;
    }

    const ids = patientIds.map(Number).filter((n) => !isNaN(n) && n > 0);

    // Validate target user belongs to this tenant and is a regular user (not admin/superadmin)
    const [targetUser] = await db
      .select({ id: usersTable.id, role: usersTable.role, tenantId: usersTable.tenantId })
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)))
      .limit(1);
    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (targetUser.role === "admin" || targetUser.role === "superadmin") {
      res.status(400).json({ error: "Cannot restrict admin or superadmin users" });
      return;
    }

    if (ids.length > 0) {
      const tenantPatients = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(eq(patientsTable.tenantId, tenantId));
      const validIds = new Set(tenantPatients.map((p) => p.id));
      if (!ids.every((id) => validIds.has(id))) {
        res.status(400).json({ error: "One or more patient IDs do not belong to this tenant" });
        return;
      }
    }

    // Atomic replace: delete existing rows then insert new ones in a transaction
    await db.transaction(async (tx) => {
      await tx
        .delete(patientAccessTable)
        .where(
          and(
            eq(patientAccessTable.tenantId, tenantId),
            eq(patientAccessTable.userId, userId),
          ),
        );

      if (ids.length > 0) {
        await tx
          .insert(patientAccessTable)
          .values(ids.map((patientId) => ({ tenantId, userId, patientId })));
      }
    });

    res.json({ patientIds: ids });
  },
);

export default router;
