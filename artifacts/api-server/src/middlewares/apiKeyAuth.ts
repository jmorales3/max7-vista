import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { db, apiKeysTable, usersTable } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Middleware that authenticates requests carrying an X-Api-Key header.
 * When a valid, non-revoked key is found the middleware populates the
 * session-equivalent fields on req.session so that downstream route handlers
 * (which read req.session.tenantId / userId / role) work unchanged.
 *
 * It also sets req.apiKeyId so that requireAuth can skip the isUserActive
 * check (API keys are tenant-level resources that remain valid even if the
 * creating user is later suspended).
 */
export const apiKeyAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  // Already authenticated via session / Bearer token — nothing to do.
  if (req.session?.userId) return next();

  const rawKey = req.headers["x-api-key"] as string | undefined;
  if (!rawKey) return next();

  try {
    const hash = hashApiKey(rawKey);

    const [keyRow] = await db
      .select()
      .from(apiKeysTable)
      .where(and(eq(apiKeysTable.keyHash, hash), isNull(apiKeysTable.revokedAt)))
      .limit(1);

    if (!keyRow) return next();

    // Resolve the creating user's role (defaults to "admin" if user removed)
    let role: "user" | "admin" | "superadmin" = "admin";
    let username = `[API] ${keyRow.name}`;

    if (keyRow.createdByUserId) {
      const [creator] = await db
        .select({ role: usersTable.role, username: usersTable.username, isActive: usersTable.isActive })
        .from(usersTable)
        .where(eq(usersTable.id, keyRow.createdByUserId))
        .limit(1);
      if (creator) {
        role = creator.role as typeof role;
        username = `${creator.username} [API: ${keyRow.name}]`;
      }
    }

    // Populate session-like fields consumed by requireAuth and route handlers
    req.session.userId = keyRow.createdByUserId ?? -1;
    req.session.tenantId = keyRow.tenantId;
    req.session.username = username;
    req.session.role = role;

    // Mark the request so requireAuth bypasses the isUserActive check
    (req as any).apiKeyId = keyRow.id;
    (req as any).apiKeyName = keyRow.name;
    (req as any).apiKeyPrefix = keyRow.keyPrefix;

    // Update lastUsedAt and atomically increment use_count — never block the request for this
    db.update(apiKeysTable)
      .set({ lastUsedAt: new Date(), useCount: sql`${apiKeysTable.useCount} + 1` })
      .where(eq(apiKeysTable.id, keyRow.id))
      .catch((err) => console.error("[api-key] failed to update lastUsedAt:", err));
  } catch (err) {
    console.error("[api-key] auth error:", err);
  }

  next();
};
