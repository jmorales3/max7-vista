import { Router, type IRouter } from "express";
import { desc, eq, and, gte, lte, ilike, SQL } from "drizzle-orm";
import { db, auditLogTable } from "@workspace/db";
import { requireRole } from "../middlewares/requireAuth";

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

    // Accept both new-style (from, to, userId, patientId) and old-style (dateFrom, dateTo, username, action)
    const action = req.query.action as string | undefined;
    const username = (req.query.username) as string | undefined;
    const userId = req.query.userId ? parseInt(String(req.query.userId), 10) : undefined;
    const patientId = req.query.patientId ? parseInt(String(req.query.patientId), 10) : undefined;
    const dateFrom = (req.query.from ?? req.query.dateFrom) as string | undefined;
    const dateTo = (req.query.to ?? req.query.dateTo) as string | undefined;

    const conditions: SQL[] = [];
    if (tenantId) conditions.push(eq(auditLogTable.tenantId, tenantId));
    if (action) conditions.push(eq(auditLogTable.action, action));
    if (username) conditions.push(ilike(auditLogTable.username as any, `%${username}%`));
    if (userId) conditions.push(eq(auditLogTable.userId as any, userId));
    if (patientId) conditions.push(eq(auditLogTable.patientId as any, patientId));
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

export default router;
