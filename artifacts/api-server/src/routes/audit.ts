import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, auditLogTable } from "@workspace/db";
import { requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/audit-log", requireRole("admin", "superadmin"), async (_req, res): Promise<void> => {
  try {
    const logs = await db
      .select()
      .from(auditLogTable)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(500);
    res.json(logs);
  } catch (err) {
    console.error("[audit] Failed to fetch audit log:", err);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

export default router;
