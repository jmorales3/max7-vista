import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db, usersTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { getTenantIdleTimeoutMinutes } from "../lib/tenantSettings";

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
  res.setHeader("Cache-Control", "no-store");
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

    // Auto-create the default tenant for this installation
    const slug = username.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const [tenant] = await db
      .insert(tenantsTable)
      .values({ name: username.trim(), slug })
      .returning();

    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(usersTable).values({
      username: username.trim().toLowerCase(),
      passwordHash,
      role: "superadmin",
      isActive: true,
      tenantId: tenant.id,
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
      logAudit(req, "login_failed", "session", null, { username: username.trim().toLowerCase(), reason: "user_not_found" });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "Your account is pending admin approval.", code: "PENDING_APPROVAL" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      logAudit(req, "login_failed", "session", null, { username: user.username, reason: "wrong_password" }, { tenantId: user.tenantId ?? null });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.tenantId = user.tenantId ?? undefined;

    // Idle-timeout duration is configurable per tenant (see admin tenant
    // settings); apply it to this session's rolling cookie expiry.
    const idleTimeoutMinutes = await getTenantIdleTimeoutMinutes(user.tenantId);
    req.session.cookie.maxAge = idleTimeoutMinutes * 60 * 1000;

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    logAudit(req, "login", "session", user.id);

    return res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      forcePasswordChange: user.forcePasswordChange,
      authToken: req.sessionID,
      idleTimeoutMinutes,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", async (req, res) => {
  logAudit(req, "logout", "session", req.session.userId ?? null);
  req.session.destroy(() => {
    res.clearCookie("max7.sid");
    res.json({ ok: true });
  });
});

router.get("/auth/session", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const [user] = await db
    .select({ forcePasswordChange: usersTable.forcePasswordChange })
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId))
    .limit(1);
  const idleTimeoutMinutes = await getTenantIdleTimeoutMinutes(req.session.tenantId);
  return res.json({
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role,
    tenantId: req.session.tenantId,
    forcePasswordChange: user?.forcePasswordChange ?? false,
    idleTimeoutMinutes,
  });
});

router.post("/auth/change-password", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId))
      .limit(1);

    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(usersTable)
      .set({ passwordHash, forcePasswordChange: false })
      .where(eq(usersTable.id, user.id));

    logAudit(req, "password_change", "user", user.id);

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Touches the session so its rolling expiry is extended without requiring a
// full data request. Mobile clients call this periodically while the app is
// in the foreground so an idle-but-open session doesn't silently expire.
router.post("/auth/refresh", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Re-read the tenant's idle-timeout setting on every refresh so an admin
  // change takes effect for already-open sessions without requiring re-login.
  const idleTimeoutMinutes = await getTenantIdleTimeoutMinutes(req.session.tenantId);
  req.session.cookie.maxAge = idleTimeoutMinutes * 60 * 1000;
  req.session.touch();
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Internal server error" });
      return;
    }
    res.json({
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role,
      tenantId: req.session.tenantId,
      idleTimeoutMinutes,
    });
  });
});

export default router;
