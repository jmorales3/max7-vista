import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole, invalidateActiveCache } from "../middlewares/requireAuth";

const router: IRouter = Router();

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
  const { username, password, role } = req.body as {
    username?: string;
    password?: string;
    role?: "user" | "admin" | "superadmin";
  };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const validRoles = ["user", "admin", "superadmin"] as const;
  const assignedRole = role && validRoles.includes(role) ? role : "user";

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const [created] = await db
      .insert(usersTable)
      .values({
        username: username.trim().toLowerCase(),
        passwordHash,
        role: assignedRole,
        isActive: true,
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

export default router;
