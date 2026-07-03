import { Router, type IRouter } from "express";
import { desc, eq, and, or, gte, lte, ilike, inArray, SQL } from "drizzle-orm";
import { db, auditLogTable, patientsTable } from "@workspace/db";
import { requireRole } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
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

// ── CSV Export ───────────────────────────────────────────────────────────────

router.get("/audit-logs/export", requireRole("admin", "superadmin"), async (req, res): Promise<void> => {
  try {
    const tenantId = req.session?.tenantId as number | undefined;

    const action = req.query.action as string | undefined;
    const username = req.query.username as string | undefined;
    const userId = req.query.userId ? parseInt(String(req.query.userId), 10) : undefined;
    const patientIdParam = req.query.patientId ? parseInt(String(req.query.patientId), 10) : undefined;
    const entityIdParam = req.query.entityId ? parseInt(String(req.query.entityId), 10) : undefined;
    const patientSearch = req.query.patient as string | undefined;
    const dateFrom = (req.query.from ?? req.query.dateFrom) as string | undefined;
    const dateTo = (req.query.to ?? req.query.dateTo) as string | undefined;

    let resolvedPatientIds: number[] | undefined;
    if (patientSearch && tenantId) {
      const matches = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(and(eq(patientsTable.tenantId, tenantId), ilike(patientsTable.name, `%${patientSearch}%`)));
      const matchesCode = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(and(eq(patientsTable.tenantId, tenantId), ilike(patientsTable.patientCode, `%${patientSearch}%`)));
      const idSet = new Set([...matches.map(r => r.id), ...matchesCode.map(r => r.id)]);
      resolvedPatientIds = [...idSet];
    }

    const conditions: SQL[] = [];
    if (tenantId) conditions.push(eq(auditLogTable.tenantId, tenantId));
    if (action) conditions.push(eq(auditLogTable.action, action));
    if (username) conditions.push(ilike(auditLogTable.username as any, `%${username}%`));
    if (userId && !isNaN(userId)) conditions.push(eq(auditLogTable.userId as any, userId));
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
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.end("Timestamp,User,Action,Entity Type,Entity ID,Details\n");
        return;
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

    const rows = await db
      .select()
      .from(auditLogTable)
      .where(where)
      .orderBy(desc(auditLogTable.createdAt));

    function csvEscape(value: string | number | null | undefined): string {
      if (value == null) return "";
      let str = String(value);
      // Neutralize spreadsheet formula injection: prefix dangerous leading chars with a tab
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `\t${str}`;
      }
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r") || str.includes("\t")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${dateStr}.csv"`);

    const header = "Timestamp,User,Action,Entity Type,Entity ID,Details\n";
    const body = rows.map((r) => [
      csvEscape(r.createdAt ? new Date(r.createdAt).toISOString() : ""),
      csvEscape(r.username),
      csvEscape(r.action),
      csvEscape(r.entityType),
      csvEscape(r.entityId),
      csvEscape(r.details as string | null),
    ].join(",")).join("\n");

    res.end(header + body);
  } catch (err) {
    console.error("[audit] CSV export failed:", err);
    res.status(500).json({ error: "Failed to export audit log" });
  }
});

// ── Accounting of Disclosures (HIPAA 45 CFR §164.528) ───────────────────────
// A patient-scoped report of who accessed/exported/shared their PHI and when.
// Restricted to actions that represent an actual disclosure or access of a
// patient's images/chart — not incidental system events like login/logout.
const DISCLOSURE_ACTIONS = [
  "patient_view",
  "image_view",
  "image_export",
  "image_upload",
  "image_edit",
  "image_delete",
  "image_replace",
  "patient_edit",
  "presentation_export",
  "presentation_share",
  "document_export",
  "document_download",
];

router.get("/patients/:id/disclosure-report", requireRole("admin", "superadmin"), async (req, res): Promise<void> => {
  try {
    const tenantId = req.session?.tenantId as number | undefined;
    const patientId = parseInt(req.params.id, 10);
    if (!Number.isFinite(patientId)) {
      res.status(400).json({ error: "Invalid patient id" });
      return;
    }
    if (!tenantId) {
      res.status(400).json({ error: "No tenant associated with this session" });
      return;
    }

    const [patient] = await db
      .select({ id: patientsTable.id, name: patientsTable.name, patientCode: patientsTable.patientCode })
      .from(patientsTable)
      .where(and(eq(patientsTable.id, patientId), eq(patientsTable.tenantId, tenantId)))
      .limit(1);

    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    const dateFrom = req.query.from as string | undefined;
    const dateTo = req.query.to as string | undefined;

    const conditions: SQL[] = [
      eq(auditLogTable.tenantId, tenantId),
      eq(auditLogTable.patientId as any, patientId),
      inArray(auditLogTable.action, DISCLOSURE_ACTIONS),
    ];
    if (dateFrom) conditions.push(gte(auditLogTable.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(auditLogTable.createdAt, end));
    }

    const rows = await db
      .select()
      .from(auditLogTable)
      .where(and(...conditions))
      .orderBy(desc(auditLogTable.createdAt));

    if (req.query.format === "json") {
      res.json({ patient, items: rows });
      return;
    }

    function csvEscape(value: string | number | null | undefined): string {
      if (value == null) return "";
      let str = String(value);
      if (/^[=+\-@\t\r]/.test(str)) str = `\t${str}`;
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r") || str.includes("\t")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="disclosure-report-${patient.patientCode}-${dateStr}.csv"`,
    );

    const meta = [
      `Accounting of Disclosures Report`,
      `Patient,${csvEscape(patient.name)}`,
      `Patient Code,${csvEscape(patient.patientCode)}`,
      `Period,${dateFrom || "all time"} to ${dateTo || "present"}`,
      `Generated,${new Date().toISOString()}`,
      ``,
    ].join("\n");

    const header = "Date/Time,Accessed By,Action,Entity Type,Entity ID,Details\n";
    const body = rows
      .map((r) =>
        [
          csvEscape(r.createdAt ? new Date(r.createdAt).toISOString() : ""),
          csvEscape(r.username),
          csvEscape(r.action),
          csvEscape(r.entityType),
          csvEscape(r.entityId),
          csvEscape(r.details as string | null),
        ].join(","),
      )
      .join("\n");

    logAudit(req, "disclosure_report_generated", "patient", patientId, { dateFrom, dateTo, rowCount: rows.length });

    res.end(meta + header + body);
  } catch (err) {
    console.error("[audit] Disclosure report failed:", err);
    res.status(500).json({ error: "Failed to generate disclosure report" });
  }
});

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
