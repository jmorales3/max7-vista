import app from "./app";
import { logger } from "./lib/logger";
import { getStorageDirectory, getSetting } from "./lib/storage";
import { scanDirectory } from "./lib/scanDirectory";
import { scheduleAutoBackup } from "./lib/backup";
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
      is_library_asset INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      notes TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'Untitled Template',
      description TEXT,
      office_name TEXT,
      office_info TEXT,
      logo_data TEXT,
      page_width REAL NOT NULL DEFAULT 215.9,
      page_height REAL NOT NULL DEFAULT 279.4,
      frames TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS template_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT 'Untitled Document',
      frames TEXT NOT NULL DEFAULT '[]',
      printed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  logger.info("SQLite tables initialized");
}

async function initPostgres() {
  const { pool } = await import("@workspace/db");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size BIGINT NOT NULL,
      notes TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled Template',
      description TEXT,
      office_name TEXT,
      office_info TEXT,
      logo_data TEXT,
      page_width REAL NOT NULL DEFAULT 215.9,
      page_height REAL NOT NULL DEFAULT 279.4,
      frames JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS template_documents (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT 'Untitled Document',
      frames JSONB NOT NULL DEFAULT '[]',
      printed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  logger.info("PostgreSQL tables ensured");

  await seedPostgres(pool);
}

async function seedPostgres(pool: import("pg").Pool) {
  const bcrypt = (await import("bcryptjs")).default;

  // Step 1: ensure tenant_id columns exist (one call each — pool.query rejects multi-statement)
  await pool.query(`ALTER TABLE patients  ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);
  await pool.query(`ALTER TABLE tags      ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);
  await pool.query(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);

  // Step 2: fix unique constraints
  await pool.query(`ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_patient_code_unique`);
  await pool.query(`ALTER TABLE tags     DROP CONSTRAINT IF EXISTS tags_name_unique`);
  await pool.query(`ALTER TABLE tags     DROP CONSTRAINT IF EXISTS tags_name_key`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS patients_code_tenant_unique ON patients(patient_code, tenant_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS tags_name_tenant_unique ON tags(name, tenant_id)`);

  // Step 3: create the two canonical tenants
  await pool.query(
    `INSERT INTO tenants (name, slug, is_active)
     VALUES ('Main Clinic', 'main-clinic', true), ('Demo Clinic', 'demo', true)
     ON CONFLICT (slug) DO NOTHING`
  );

  const { rows: tenantRows } = await pool.query<{ id: number; slug: string }>(
    `SELECT id, slug FROM tenants WHERE slug IN ('main-clinic', 'demo')`
  );
  const mainId = tenantRows.find((r) => r.slug === "main-clinic")!.id;
  const demoId = tenantRows.find((r) => r.slug === "demo")!.id;

  // Step 4: assign any orphan rows to the main tenant (one call each)
  await pool.query(`UPDATE users     SET tenant_id = $1 WHERE tenant_id IS NULL`, [mainId]);
  await pool.query(`UPDATE patients  SET tenant_id = $1 WHERE tenant_id IS NULL`, [mainId]);
  await pool.query(`UPDATE tags      SET tenant_id = $1 WHERE tenant_id IS NULL`, [mainId]);
  await pool.query(`UPDATE templates SET tenant_id = $1 WHERE tenant_id IS NULL`, [mainId]);

  // Step 5: add FK constraints if not already present (DO block — IF NOT EXISTS not valid for constraints)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_tenant_id_fkey') THEN
        ALTER TABLE patients ADD CONSTRAINT patients_tenant_id_fkey
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
      END IF;
    END $$
  `);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tags_tenant_id_fkey') THEN
        ALTER TABLE tags ADD CONSTRAINT tags_tenant_id_fkey
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
      END IF;
    END $$
  `);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'templates_tenant_id_fkey') THEN
        ALTER TABLE templates ADD CONSTRAINT templates_tenant_id_fkey
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
      END IF;
    END $$
  `);

  // Step 6: create the demo user (password: admin123)
  const demoHash = await bcrypt.hash("admin123", 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, tenant_id, role, is_active)
     VALUES ('demo', $1, $2, 'superadmin', true)
     ON CONFLICT (username) DO NOTHING`,
    [demoHash, demoId]
  );

  logger.info("PostgreSQL seed complete (tenants + demo user ensured)");
}

async function start() {
  // Open the port first so the deployment health-check passes immediately,
  // then run DB initialisation in the background.
  await new Promise<void>((resolve) => {
    app.listen(port, "0.0.0.0", () => {
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

      resolve();
    });
  });

  // DB init and first-run scan happen after the port is open.
  (async () => {
    try {
      if (IS_SQLITE) {
        await initSqlite();
        scheduleAutoBackup();
      } else {
        await initPostgres();
      }
    } catch (err) {
      logger.warn({ err }, "DB schema init failed — server continues without it");
    }

    if (IS_SQLITE) {
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
            const result = await scanDirectory(storageDir);
            logger.info({ scanned: result.scanned, indexed: result.indexed }, "First-run auto-scan complete");
          }
        }
      } catch (e) {
        logger.warn({ err: e }, "First-run scan check failed");
      }
    }
  })();
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
