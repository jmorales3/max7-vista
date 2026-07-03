import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole, invalidateActiveCache } from "../middlewares/requireAuth";
import { listGcsFiles } from "../lib/gcsStorage";
import {
  getTenantIdleTimeoutMinutes,
  setTenantIdleTimeoutMinutes,
  isValidIdleTimeoutMinutes,
  MIN_IDLE_TIMEOUT_MINUTES,
  MAX_IDLE_TIMEOUT_MINUTES,
} from "../lib/tenantSettings";
import { logAudit } from "../lib/audit";
import { backfillImageHashes, verifyImageIntegrity, getIntegrityStatus } from "../lib/integrityCheck";
import {
  getSessionAlertState,
  getSessionAlertThreshold,
  setSessionAlertThreshold,
  checkSessionGrowth,
} from "../lib/sessionGrowthCheck";

const router: IRouter = Router();

router.get("/admin/tenant-settings", requireRole("admin", "superadmin"), async (req, res) => {
  const tenantId = req.session.tenantId;
  if (!tenantId) {
    return res.status(400).json({ error: "No tenant associated with this session" });
  }
  const idleTimeoutMinutes = await getTenantIdleTimeoutMinutes(tenantId);
  return res.json({
    idleTimeoutMinutes,
    minIdleTimeoutMinutes: MIN_IDLE_TIMEOUT_MINUTES,
    maxIdleTimeoutMinutes: MAX_IDLE_TIMEOUT_MINUTES,
  });
});

router.patch("/admin/tenant-settings", requireRole("admin", "superadmin"), async (req, res) => {
  const tenantId = req.session.tenantId;
  if (!tenantId) {
    return res.status(400).json({ error: "No tenant associated with this session" });
  }
  const { idleTimeoutMinutes } = req.body as { idleTimeoutMinutes?: number };
  if (!isValidIdleTimeoutMinutes(idleTimeoutMinutes)) {
    return res.status(400).json({
      error: `idleTimeoutMinutes must be a number between ${MIN_IDLE_TIMEOUT_MINUTES} and ${MAX_IDLE_TIMEOUT_MINUTES}`,
    });
  }
  await setTenantIdleTimeoutMinutes(tenantId, idleTimeoutMinutes);
  logAudit(req, "tenant_settings_update", "tenant", tenantId, { idleTimeoutMinutes });
  return res.json({ idleTimeoutMinutes });
});

router.get("/admin/session-alert", requireRole("admin", "superadmin"), async (_req, res) => {
  const state = await getSessionAlertState();
  res.json(state);
});

router.post("/admin/session-alert/check", requireRole("admin", "superadmin"), async (req, res) => {
  const state = await checkSessionGrowth();
  logAudit(req, "session_alert_check", "system", null, { count: state.count, threshold: state.threshold });
  res.json(state);
});

router.patch("/admin/session-alert", requireRole("admin", "superadmin"), async (req, res) => {
  const { threshold } = req.body as { threshold?: number };
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0) {
    return res.status(400).json({ error: "threshold must be a positive number" });
  }
  await setSessionAlertThreshold(threshold);
  logAudit(req, "session_alert_threshold_update", "system", null, { threshold });
  return res.json({ threshold: await getSessionAlertThreshold() });
});

router.get("/admin/users", requireRole("admin", "superadmin"), async (_req, res) => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        role: usersTable.role,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
        tenantId: usersTable.tenantId,
      })
      .from(usersTable)
      .orderBy(usersTable.createdAt);

    res.json(users);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/users/:id", requireRole("admin", "superadmin"), async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const { isActive, role } = req.body as { isActive?: boolean; role?: "user" | "admin" | "superadmin" };

  const validRoles = ["user", "admin", "superadmin"] as const;
  if (role !== undefined && !validRoles.includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  try {
    const updates: Partial<{ isActive: boolean; role: "user" | "admin" | "superadmin" }> = {};
    if (isActive !== undefined) updates.isActive = isActive;
    if (role !== undefined) updates.role = role;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, userId))
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        role: usersTable.role,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
        tenantId: usersTable.tenantId,
      });

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    invalidateActiveCache(userId);

    if (updates.isActive === false) {
      try {
        await pool.query(
          `DELETE FROM sessions WHERE sess->>'userId' = $1::text`,
          [userId.toString()]
        );
      } catch {
        // Non-fatal: session cleanup is best-effort; the cache invalidation
        // and DB isActive=false will block them on next request anyway.
      }
    }

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/users", requireRole("admin", "superadmin"), async (req, res) => {
  const { username, password, role, tenantId } = req.body as {
    username?: string;
    password?: string;
    role?: "user" | "admin" | "superadmin";
    tenantId?: number;
  };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const validRoles = ["user", "admin", "superadmin"] as const;
  const assignedRole = role && validRoles.includes(role) ? role : "user";

  // Default the new user to the same tenant as the creator, unless superadmin specifies otherwise
  const creatorTenantId = req.session.tenantId;
  const resolvedTenantId = tenantId ?? creatorTenantId ?? null;

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const [created] = await db
      .insert(usersTable)
      .values({
        username: username.trim().toLowerCase(),
        passwordHash,
        role: assignedRole,
        isActive: true,
        forcePasswordChange: true,
        tenantId: resolvedTenantId,
      })
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        role: usersTable.role,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
        tenantId: usersTable.tenantId,
      });

    res.status(201).json(created);
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      res.status(409).json({ error: "Username already exists" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/users/:id", requireRole("admin", "superadmin"), async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const requestingUserId = req.session.userId;

  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  if (userId === requestingUserId) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }

  try {
    const [deleted] = await db
      .delete(usersTable)
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id });

    if (!deleted) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /admin/orphaned-images
 * Lists GCS image files that have no matching record in the images table.
 * Used to recover images after a database reset.
 * Groups orphans by the patient-ID directory segment in their path.
 */
router.get("/admin/orphaned-images", requireRole("admin", "superadmin"), async (_req, res) => {
  try {
    // All GCS object names under images/
    const allObjects = await listGcsFiles("images/");

    // All file_paths currently in the DB
    const { rows } = await pool.query<{ file_path: string }>(
      `SELECT DISTINCT file_path FROM images WHERE file_path LIKE 'gcs:%'`
    );
    const knownPaths = new Set(rows.map((r) => r.file_path.slice(4))); // strip "gcs:"

    // Find GCS objects not referenced by any DB record
    const orphans = allObjects.filter((name) => !knownPaths.has(name));

    // Group by the patient-id directory (e.g. "images/34/2026-06-10/file.jpg" → patientDir "34")
    const grouped: Record<string, string[]> = {};
    for (const name of orphans) {
      const parts = name.split("/"); // ["images", "<patientId>", "<date>", "<file>"]
      const patientDir = parts[1] ?? "unknown";
      if (!grouped[patientDir]) grouped[patientDir] = [];
      grouped[patientDir].push(name);
    }

    res.json({
      totalOrphans: orphans.length,
      byPatientDir: grouped,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /admin/recover-images
 * Body: { assignments: [{ gcsDir: "36", patientId: 106 }, ...] }
 * For each assignment, inserts image records for every GCS file in that directory
 * that is not already in the DB. Returns counts of what was inserted.
 */
router.post("/admin/recover-images", requireRole("admin", "superadmin"), async (req, res) => {
  const { assignments } = req.body as {
    assignments: Array<{ gcsDir: string; patientId: number }>;
  };

  if (!Array.isArray(assignments) || assignments.length === 0) {
    res.status(400).json({ error: "assignments array required" });
    return;
  }

  try {
    // Get all currently-known GCS paths so we skip duplicates
    const { rows: known } = await pool.query<{ file_path: string }>(
      `SELECT DISTINCT file_path FROM images WHERE file_path LIKE 'gcs:%'`
    );
    const knownPaths = new Set(known.map((r) => r.file_path.slice(4)));

    // Fetch all orphaned GCS objects once
    const allObjects = await listGcsFiles("images/");

    const results: Record<string, { inserted: number; skipped: number }> = {};

    for (const { gcsDir, patientId } of assignments) {
      const prefix = `images/${gcsDir}/`;
      const files = allObjects.filter((name) => name.startsWith(prefix) && !knownPaths.has(name));

      let inserted = 0;
      let skipped = 0;

      for (const objectName of files) {
        // Extract filename from path: images/<dir>/<date>/<filename>
        const fileName = objectName.split("/").pop() ?? objectName;

        // Derive captured_at from the timestamp embedded in the filename (ms epoch)
        const tsMatch = fileName.match(/^(\d{13})/);
        const capturedAt = tsMatch
          ? new Date(parseInt(tsMatch[1], 10)).toISOString()
          : new Date().toISOString();

        const filePath = `gcs:${objectName}`;

        try {
          const r = await pool.query(
            `INSERT INTO images
               (patient_id, file_path, file_name, notes, captured_at, is_unassigned, is_library_asset, created_at, updated_at)
             VALUES ($1, $2, $3, NULL, $4, false, false, NOW(), NOW())
             ON CONFLICT DO NOTHING`,
            [patientId, filePath, fileName, capturedAt]
          );
          if (r.rowCount && r.rowCount > 0) inserted++;
          else skipped++;
        } catch {
          skipped++;
        }
      }

      results[`dir${gcsDir}→patient${patientId}`] = { inserted, skipped };
    }

    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /admin/bulk-reassign-images
 * Body: { mapping: { "109": 106, "106": 108, "108": 109 } }
 * Reassigns images from one patient_id to another in a single atomic UPDATE.
 */
router.post("/admin/bulk-reassign-images", requireRole("admin", "superadmin"), async (req, res) => {
  const { mapping } = req.body as { mapping: Record<string, number> };
  if (!mapping || Object.keys(mapping).length === 0) {
    res.status(400).json({ error: "mapping object required" });
    return;
  }

  const fromIds = Object.keys(mapping).map(Number);
  const caseStatements = fromIds
    .map((from) => `WHEN patient_id = ${from} THEN ${mapping[String(from)]}`)
    .join(" ");

  const sql = `
    UPDATE images
    SET patient_id = CASE ${caseStatements} END
    WHERE patient_id = ANY($1::int[])
  `;

  try {
    const result = await pool.query(sql, [fromIds]);
    res.json({ ok: true, rowsUpdated: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /admin/integrity/status
 * Cheap summary of hash coverage — no file I/O. Safe to poll from the UI.
 */
router.get("/admin/integrity/status", requireRole("admin", "superadmin"), async (_req, res) => {
  try {
    const status = await getIntegrityStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /admin/integrity/backfill
 * Computes and stores sha256 for every image row missing one. Read + hash
 * + write per row, so this can take a while on large libraries — it runs
 * synchronously and returns the full summary when done.
 */
router.post("/admin/integrity/backfill", requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const result = await backfillImageHashes();
    logAudit(req, "integrity_backfill", "image", null, {
      scanned: result.scanned,
      updated: result.updated,
      missingFile: result.missingFile,
      errorCount: result.errors.length,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /admin/integrity/verify
 * Body (optional): { limit: number } — cap how many hashed images are
 * re-checked, useful for a quick spot-check on very large libraries.
 * Read-only: re-hashes each stored file and compares to the DB value,
 * reporting mismatches (possible corruption) and missing files.
 */
router.post("/admin/integrity/verify", requireRole("admin", "superadmin"), async (req, res) => {
  const { limit } = req.body as { limit?: number };
  try {
    const result = await verifyImageIntegrity(typeof limit === "number" && limit > 0 ? limit : undefined);
    logAudit(req, "integrity_verify", "image", null, {
      scanned: result.scanned,
      ok: result.ok,
      mismatches: result.mismatches.length,
      missingFiles: result.missingFiles.length,
      errors: result.errors.length,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
