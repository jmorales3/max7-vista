import { Router, type IRouter } from "express";
import { desc, eq, and, or, gte, lte, ilike, inArray, SQL } from "drizzle-orm";
import { db, auditLogTable, patientsTable } from "@workspace/db";
import { requireRole } from "../middlewares/requireAuth";
import {
  getAuditRetentionYears,
  setAuditRetentionYears,
  performAuditCleanup,
} from "../lib/auditCleanup";

const router: IRouter = Router();

async function handleAuditLog(req: any, res: any): Promise<void> {
  try {
    const tenantId = req.session?.tenantId as number | undefined;

    const limitRaw = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));

    // Support both page-based (page) and offset-based (offset) pagination
    let offset = 0;
    let page = 1;
    if (req.query.offset !== undefined) {
      offset = Math.max(0, parseInt(String(req.query.offset), 10));
      page = Math.floor(offset / limitRaw) + 1;
    } else {
      page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      offset = (page - 1) * limitRaw;
    }

    // Params: new-style (from, to, userId, patientId, entityId, patient) + old-style (dateFrom, dateTo, username)
    const action = req.query.action as string | undefined;
    const username = req.query.username as string | undefined;
    const userId = req.query.userId ? parseInt(String(req.query.userId), 10) : undefined;
    const patientIdParam = req.query.patientId ? parseInt(String(req.query.patientId), 10) : undefined;
    // entityId: searches audit rows where entityId OR patientId matches (covers image IDs and patient IDs in one field)
    const entityIdParam = req.query.entityId ? parseInt(String(req.query.entityId), 10) : undefined;
    const patientSearch = req.query.patient as string | undefined; // text search by patient name/code
    const dateFrom = (req.query.from ?? req.query.dateFrom) as string | undefined;
    const dateTo = (req.query.to ?? req.query.dateTo) as string | undefined;

    // If patient text search is provided, resolve to patientIds via subquery
    let resolvedPatientIds: number[] | undefined;
    if (patientSearch && tenantId) {
      const matches = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(
          and(
            eq(patientsTable.tenantId, tenantId),
            ilike(patientsTable.name, `%${patientSearch}%`),
          )
        );
      // Also search by patient_code
      const matchesCode = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(
          and(
            eq(patientsTable.tenantId, tenantId),
            ilike(patientsTable.patientCode, `%${patientSearch}%`),
          )
        );
      const idSet = new Set([...matches.map(r => r.id), ...matchesCode.map(r => r.id)]);
      resolvedPatientIds = [...idSet];
    }

    const conditions: SQL[] = [];
    if (tenantId) conditions.push(eq(auditLogTable.tenantId, tenantId));
    if (action) conditions.push(eq(auditLogTable.action, action));
    if (username) conditions.push(ilike(auditLogTable.username as any, `%${username}%`));
    if (userId && !isNaN(userId)) conditions.push(eq(auditLogTable.userId as any, userId));
    // entityId param: match rows where entityId OR patientId equals the value
    if (entityIdParam && !isNaN(entityIdParam)) {
      conditions.push(
        or(
          eq(auditLogTable.entityId as any, entityIdParam),
          eq(auditLogTable.patientId as any, entityIdParam),
        ) as SQL
      );
    }
    if (patientIdParam && !isNaN(patientIdParam)) {
      conditions.push(eq(auditLogTable.patientId as any, patientIdParam));
    } else if (resolvedPatientIds !== undefined) {
      if (resolvedPatientIds.length === 0) {
        // No patients matched — return empty result
        return res.json({ items: [], total: 0, page, totalPages: 1 });
      }
      conditions.push(inArray(auditLogTable.patientId as any, resolvedPatientIds));
    }
    if (dateFrom) conditions.push(gte(auditLogTable.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(auditLogTable.createdAt, end));
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
      db.select().from(auditLogTable).where(where).orderBy(desc(auditLogTable.createdAt)).limit(limitRaw).offset(offset),
      db.select({ id: auditLogTable.id }).from(auditLogTable).where(where),
    ]);

    const total = countRows.length;

    res.json({
      items: rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limitRaw)),
    });
  } catch (err) {
    console.error("[audit] Failed to fetch audit log:", err);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
}

// Primary endpoint (plural) per HIPAA spec
router.get("/audit-logs", requireRole("admin", "superadmin"), handleAuditLog);

// Backward-compat alias
router.get("/audit-log", requireRole("admin", "superadmin"), handleAuditLog);

// ── Retention policy ─────────────────────────────────────────────────────────

router.get("/audit-logs/retention", requireRole("admin", "superadmin"), async (_req, res): Promise<void> => {
  try {
    const retentionYears = await getAuditRetentionYears();
    res.json({ retentionYears });
  } catch (err) {
    console.error("[audit] Failed to get retention policy:", err);
    res.status(500).json({ error: "Failed to get retention policy" });
  }
});

router.put("/audit-logs/retention", requireRole("admin", "superadmin"), async (req, res): Promise<void> => {
  try {
    const years = parseInt(String(req.body?.retentionYears), 10);
    if (!Number.isFinite(years) || years < 1 || years > 99) {
      res.status(400).json({ error: "retentionYears must be a number between 1 and 99" });
      return;
    }
    await setAuditRetentionYears(years);
    res.json({ retentionYears: years });
  } catch (err) {
    console.error("[audit] Failed to update retention policy:", err);
    res.status(500).json({ error: "Failed to update retention policy" });
  }
});

router.post("/audit-logs/cleanup", requireRole("admin", "superadmin"), async (_req, res): Promise<void> => {
  try {
    const result = await performAuditCleanup();
    res.json(result);
  } catch (err) {
    console.error("[audit] Manual cleanup failed:", err);
    res.status(500).json({ error: "Cleanup failed" });
  }
});

export default router;
