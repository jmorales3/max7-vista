import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.patch("/users/me", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { currentPassword, newUsername, newPassword } = req.body as {
    currentPassword?: string;
    newUsername?: string;
    newPassword?: string;
  };

  if (!currentPassword) {
    return res.status(400).json({ error: "Current password is required" });
  }

  if (!newUsername && !newPassword) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  if (newUsername && newUsername.trim().length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }

  if (newPassword && newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const updates: Partial<typeof usersTable.$inferInsert> = {};

    if (newUsername) {
      updates.username = newUsername.trim().toLowerCase();
    }

    if (newPassword) {
      updates.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));

    if (updates.username) {
      req.session.username = updates.username;
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );
    }

    return res.json({
      id: user.id,
      username: updates.username ?? user.username,
      role: user.role,
    });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505" || (err as Error).message?.includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "Username already taken" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
