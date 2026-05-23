import app from "./app";
import { logger } from "./lib/logger";
import { getStorageDirectory, getSetting } from "./lib/storage";
import { scanDirectory } from "./lib/scanDirectory";
import path from "path";
import fs from "fs";
import os from "os";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const IS_SQLITE =
  process.env["ELECTRON_MODE"] === "true" ||
  process.env["SELF_HOST_SQLITE"] === "true";

async function initSqlite() {
  const { db } = await import("@workspace/db");
  const raw = db as unknown as {
    $client: {
      exec: (sql: string) => void;
      prepare: (sql: string) => { all: () => unknown[]; run: (...args: unknown[]) => void };
    };
  };
  const exec = (sql: string) => raw.$client.exec(sql);

  exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      patient_code TEXT NOT NULL UNIQUE,
      date_of_birth TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      notes TEXT,
      annotation TEXT,
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_unassigned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      settings TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'user',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'user',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patient_tags (
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (patient_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS presentations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Untitled',
      slides TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  logger.info("SQLite tables initialized");

  // Seed a default superadmin on first run (empty users table)
  const [countRow] = raw.$client.prepare("SELECT COUNT(*) as count FROM users").all() as [{ count: number }];
  if (countRow.count === 0) {
    const bcrypt = await import("bcryptjs");
    const defaultPassword = "Admin1234";
    const hash = await bcrypt.hash(defaultPassword, 10);
    raw.$client
      .prepare("INSERT INTO users (username, password_hash, role, is_active) VALUES (?, ?, ?, ?)")
      .run("admin", hash, "superadmin", 1);

    // Write a hint file so Electron can show a first-run dialog with the credentials
    const dbPath = process.env["DATABASE_PATH"] ?? "";
    if (dbPath) {
      const credFile = path.join(path.dirname(dbPath), "first-run-credentials.json");
      fs.writeFileSync(credFile, JSON.stringify({ username: "admin", password: defaultPassword }));
    }

    logger.info("First-run: seeded default superadmin — username: admin, password: Admin1234");
  }
}

async function start() {
  if (IS_SQLITE) {
    await initSqlite();
  }

  app.listen(port, "0.0.0.0", async () => {
    logger.info({ port }, "Server listening");

    // Print LAN addresses so clinic staff know what URL to use on phones/tablets
    const nets = os.networkInterfaces();
    const lanAddresses: string[] = [];
    for (const ifaces of Object.values(nets)) {
      for (const iface of ifaces ?? []) {
        if (iface.family === "IPv4" && !iface.internal) {
          lanAddresses.push(`http://${iface.address}:${port}`);
        }
      }
    }
    if (lanAddresses.length > 0) {
      logger.info(
        { addresses: lanAddresses },
        "LAN access — enter one of these addresses in the mobile app Server Setup",
      );
    }

    try {
      const lastScanAt = await getSetting("lastScanAt");
      if (!lastScanAt) {
        const storageDir = await getStorageDirectory();
        const IMAGE_EXTENSIONS = new Set([
          ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif",
        ]);

        function hasImages(dir: string): boolean {
          if (!fs.existsSync(dir)) return false;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
              if (hasImages(path.join(dir, entry.name))) return true;
            } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
              return true;
            }
          }
          return false;
        }

        if (hasImages(storageDir)) {
          logger.info({ storageDir }, "First run: unscanned image files found — triggering auto-scan");
          // scanDirectory() is called directly (not via HTTP), so it bypasses
          // auth middleware entirely — no token or service credential required.
          const result = await scanDirectory(storageDir);
          logger.info({ scanned: result.scanned, indexed: result.indexed }, "First-run auto-scan complete");
        }
      }
    } catch (e) {
      logger.warn({ err: e }, "First-run scan check failed");
    }
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
