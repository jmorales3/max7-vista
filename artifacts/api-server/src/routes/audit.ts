import { Router, type IRouter } from "express";
import { desc, eq, and, gte, lte, ilike, SQL } from "drizzle-orm";
import { db, auditLogTable } from "@workspace/db";
import { requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/audit-log", requireRole("admin", "superadmin"), async (req, res): Promise<void> => {
  try {
    const tenantId = (req.session as any)?.tenantId as number | undefined;

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
    const offset = (page - 1) * limit;

    const { action, username, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

    const conditions: SQL[] = [];
    if (tenantId) conditions.push(eq(auditLogTable.tenantId, tenantId));
    if (action) conditions.push(ilike(auditLogTable.action, `%${action}%`));
    if (username) conditions.push(ilike(auditLogTable.username as any, `%${username}%`));
    if (dateFrom) conditions.push(gte(auditLogTable.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(auditLogTable.createdAt, end));
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
      db.select().from(auditLogTable).where(where).orderBy(desc(auditLogTable.createdAt)).limit(limit).offset(offset),
      db.select({ id: auditLogTable.id }).from(auditLogTable).where(where),
    ]);

    const total = countRows.length;

    res.json({
      items: rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error("[audit] Failed to fetch audit log:", err);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

export default router;
