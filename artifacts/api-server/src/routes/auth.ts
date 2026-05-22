import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function buildMobileSessionCookie(sessionId: string, secret: string): string {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(sessionId)
    .digest("base64")
    .replace(/=+$/, "");
  return `max7.sid=${encodeURIComponent("s:" + sessionId + "." + signature)}`;
}

const router: IRouter = Router();

router.get("/auth/needs-setup", async (_req, res) => {
  try {
    const users = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    return res.json({ needsSetup: users.length === 0 });
  } catch {
    return res.json({ needsSetup: false });
  }
});

router.post("/auth/setup", async (req, res) => {
  try {
    const users = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (users.length > 0) {
      return res.status(403).json({ error: "Setup already completed" });
    }

    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    if (username.trim().length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(usersTable).values({
      username: username.trim().toLowerCase(),
      passwordHash,
      role: "superadmin",
      isActive: true,
    });

    return res.status(201).json({ message: "Administrator account created" });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/register", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  if (username.trim().length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(usersTable).values({
      username: username.trim().toLowerCase(),
      passwordHash,
      role: "user",
      isActive: false,
    });

    return res.status(201).json({ message: "Account created. Please wait for admin approval before logging in." });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      return res.status(409).json({ error: "Username already taken" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username.trim().toLowerCase()))
      .limit(1);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "Your account is pending admin approval.", code: "PENDING_APPROVAL" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.tenantId = user.tenantId ?? undefined;

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    return res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      authToken: req.sessionID,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("max7.sid");
    res.json({ ok: true });
  });
});

router.get("/auth/session", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  return res.json({
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role,
    tenantId: req.session.tenantId,
  });
});

export default router;
