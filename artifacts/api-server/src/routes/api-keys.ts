import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db, apiKeysTable } from "@workspace/db";
import { requireRole } from "../middlewares/requireAuth";
import { hashApiKey } from "../middlewares/apiKeyAuth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

function tid(req: any): number {
  const t = req.session?.tenantId as number | undefined;
  if (!t) throw Object.assign(new Error("No tenant associated with this session"), { status: 403 });
  return t;
}

/** Generate a cryptographically secure API key: m7_<64 hex chars> */
function generateRawKey(): string {
  return "m7_" + crypto.randomBytes(32).toString("hex");
}

// ── List active keys for this tenant ─────────────────────────────────────────
router.get("/api-keys", requireRole("admin", "superadmin"), async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const rows = await db
      .select({
        id: apiKeysTable.id,
        name: apiKeysTable.name,
        keyPrefix: apiKeysTable.keyPrefix,
        createdByUserId: apiKeysTable.createdByUserId,
        createdAt: apiKeysTable.createdAt,
        lastUsedAt: apiKeysTable.lastUsedAt,
        useCount: apiKeysTable.useCount,
      })
      .from(apiKeysTable)
      .where(and(eq(apiKeysTable.tenantId, tenantId), isNull(apiKeysTable.revokedAt)))
      .orderBy(apiKeysTable.createdAt);
    res.json(rows);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Generate a new key ────────────────────────────────────────────────────────
router.post("/api-keys", requireRole("admin", "superadmin"), async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "Key name is required" });
      return;
    }

    const rawKey = generateRawKey();
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 12); // "m7_" + 9 hex chars

    const [row] = await db
      .insert(apiKeysTable)
      .values({
        tenantId,
        name: name.trim(),
        keyHash,
        keyPrefix,
        createdByUserId: req.session?.userId && req.session.userId > 0
          ? req.session.userId
          : null,
      })
      .returning({
        id: apiKeysTable.id,
        name: apiKeysTable.name,
        keyPrefix: apiKeysTable.keyPrefix,
        createdAt: apiKeysTable.createdAt,
      });

    logAudit(req, "api_key_create", "api_key", row.id, { name: row.name, keyPrefix: row.keyPrefix });

    // Return the raw key exactly once — it is never stored
    res.status(201).json({ ...row, rawKey });
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Revoke a key ──────────────────────────────────────────────────────────────
router.delete("/api-keys/:id", requireRole("admin", "superadmin"), async (req, res): Promise<void> => {
  try {
    const tenantId = tid(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [row] = await db
      .update(apiKeysTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.tenantId, tenantId), isNull(apiKeysTable.revokedAt)))
      .returning({ id: apiKeysTable.id, name: apiKeysTable.name });

    if (!row) { res.status(404).json({ error: "Key not found or already revoked" }); return; }

    logAudit(req, "api_key_revoke", "api_key", row.id, { name: row.name });
    res.sendStatus(204);
  } catch (err: any) {
    if (err.status === 403) { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
