import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 30_000;
const activeCache = new Map<number, { active: boolean; expiresAt: number }>();

async function isUserActive(userId: number): Promise<boolean> {
  const now = Date.now();
  const cached = activeCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.active;
  }

  const [user] = await db
    .select({ isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const active = user?.isActive ?? false;
  activeCache.set(userId, { active, expiresAt: now + CACHE_TTL_MS });
  return active;
}

export function invalidateActiveCache(userId: number) {
  activeCache.delete(userId);
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (process.env["ELECTRON_MODE"] === "true") {
    next();
    return;
  }
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // API-key authenticated requests bypass the per-user active check —
  // keys are tenant-level resources that remain valid even if the creating
  // user is later suspended.
  if ((req as any).apiKeyId) {
    next();
    return;
  }

  try {
    const active = await isUserActive(req.session.userId);
    if (!active) {
      req.session.destroy(() => {});
      res.status(403).json({ error: "Your account has been suspended. Please contact your administrator.", code: "ACCOUNT_SUSPENDED" });
      return;
    }
  } catch {
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  next();
};

export const requireRole = (...roles: Array<"user" | "admin" | "superadmin">) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env["ELECTRON_MODE"] === "true") {
      next();
      return;
    }
    if (!req.session?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const active = await isUserActive(req.session.userId);
      if (!active) {
        req.session.destroy(() => {});
        res.status(403).json({ error: "Your account has been suspended. Please contact your administrator.", code: "ACCOUNT_SUSPENDED" });
        return;
      }
    } catch {
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    // API-key authenticated requests bypass the per-user active check
    if ((req as any).apiKeyId) {
      const userRole = req.session.role;
      if (!userRole || !roles.includes(userRole)) {
        res.status(403).json({ error: "Forbidden: insufficient permissions" });
        return;
      }
      next();
      return;
    }

    const userRole = req.session.role;
    if (!userRole || !roles.includes(userRole)) {
      res.status(403).json({ error: "Forbidden: insufficient permissions" });
      return;
    }
    next();
  };
};
