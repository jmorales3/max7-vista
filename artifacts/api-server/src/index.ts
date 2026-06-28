import app from "./app";
import { logger } from "./lib/logger";
import { getStorageDirectory, getSetting } from "./lib/storage";
import { scanDirectory } from "./lib/scanDirectory";
import { scheduleAutoBackup } from "./lib/backup";
import { scheduleAuditCleanup } from "./lib/auditCleanup";
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
      sha256 TEXT,
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
      tenant_id INTEGER,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username TEXT,
      patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
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

    CREATE TABLE IF NOT EXISTS patient_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (tenant_id, user_id, patient_id)
    );
  `);

  // Migrate existing SQLite images table
  try { exec(`ALTER TABLE images ADD COLUMN sha256 TEXT`); } catch { /* already exists */ }

  // Migrate existing SQLite audit_log tables — ADD COLUMN doesn't support IF NOT EXISTS
  // in SQLite, so each statement is wrapped in a try/catch and ignored if it fails (column exists)
  const auditMigrations = [
    `ALTER TABLE audit_log ADD COLUMN tenant_id INTEGER`,
    `ALTER TABLE audit_log ADD COLUMN patient_id INTEGER REFERENCES patients(id)`,
    `ALTER TABLE audit_log ADD COLUMN resource_id TEXT`,
    `ALTER TABLE audit_log ADD COLUMN ip_address TEXT`,
    `ALTER TABLE audit_log ADD COLUMN user_agent TEXT`,
  ];
  for (const sql of auditMigrations) {
    try { exec(sql); } catch { /* column already exists — safe to ignore */ }
  }

  logger.info("SQLite tables initialized");
}

// ─── Schema migrations ──────────────────────────────────────────────────────
// Every statement here must be idempotent (IF NOT EXISTS / DO $$ BEGIN … END $$).
// HOW TO ADD A FUTURE MIGRATION:
//   • New table  → add a CREATE TABLE IF NOT EXISTS block to initPostgres() below.
//   • New column → add an ALTER TABLE … ADD COLUMN IF NOT EXISTS line in the
//                  "Column migrations" section of runMigrations() below.
//   • New index  → add CREATE UNIQUE/INDEX … IF NOT EXISTS in "Index migrations".
//   • New FK     → add a DO $$ BEGIN IF NOT EXISTS … END $$ block in seedPostgres().
// Never DROP or RENAME columns/tables here — doing so would destroy production data.
// ────────────────────────────────────────────────────────────────────────────
async function runMigrations(pool: import("pg").Pool) {
  // ── Column migrations (ADD COLUMN IF NOT EXISTS — safe to run every startup) ──
  await pool.query(`ALTER TABLE patients  ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);
  await pool.query(`ALTER TABLE tags      ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);
  await pool.query(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS tenant_id INTEGER`);
  await pool.query(`ALTER TABLE images    ADD COLUMN IF NOT EXISTS sha256 TEXT`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id  INTEGER`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS resource_id TEXT`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip_address  VARCHAR(45)`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent  TEXT`);

  // ── Column type migrations ───────────────────────────────────────────────────
  // Migrate audit_log.details from TEXT → JSONB (one-time, safe to re-run)
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_log' AND column_name = 'details' AND data_type = 'text'
      ) THEN
        ALTER TABLE audit_log ALTER COLUMN details TYPE JSONB USING details::jsonb;
      END IF;
    END $$
  `);

  // ── Index migrations (CREATE … IF NOT EXISTS) ────────────────────────────────
  await pool.query(`ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_patient_code_unique`);
  await pool.query(`ALTER TABLE tags     DROP CONSTRAINT IF EXISTS tags_name_unique`);
  await pool.query(`ALTER TABLE tags     DROP CONSTRAINT IF EXISTS tags_name_key`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS patients_code_tenant_unique ON patients(patient_code, tenant_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS tags_name_tenant_unique ON tags(name, tenant_id)`);
  await pool.query(`
    DELETE FROM images
    WHERE id NOT IN (SELECT MIN(id) FROM images GROUP BY patient_id, file_path)
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS images_patient_file_unique ON images(patient_id, file_path)`);

  // ── ADD FUTURE MIGRATIONS ABOVE THIS LINE ────────────────────────────────────
  logger.info("PostgreSQL schema migrations applied");
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

    CREATE TABLE IF NOT EXISTS patient_access (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, user_id, patient_id)
    );

    CREATE TABLE IF NOT EXISTS seed_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username TEXT,
      patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      resource_id TEXT,
      details JSONB,
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ceph_templates (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      locked BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ceph_landmarks (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES ceph_templates(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      display_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ceph_measurements (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES ceph_templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      p1_label TEXT NOT NULL,
      p2_label TEXT NOT NULL,
      p3_label TEXT,
      p4_label TEXT,
      angle_quadrant TEXT,
      unit TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ceph_tracings (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      image_id INTEGER,
      template_id INTEGER,
      template_name TEXT,
      px_per_mm NUMERIC,
      name TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ceph_tracing_points (
      id SERIAL PRIMARY KEY,
      tracing_id INTEGER NOT NULL REFERENCES ceph_tracings(id) ON DELETE CASCADE,
      landmark_label TEXT NOT NULL,
      x NUMERIC NOT NULL,
      y NUMERIC NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ceph_tracing_results (
      id SERIAL PRIMARY KEY,
      tracing_id INTEGER NOT NULL REFERENCES ceph_tracings(id) ON DELETE CASCADE,
      measurement_name TEXT NOT NULL,
      value NUMERIC,
      unit TEXT NOT NULL
    );
  `);
  logger.info("PostgreSQL tables ensured");

  await runMigrations(pool);
  await seedPostgres(pool);
}

async function seedPostgres(pool: import("pg").Pool) {
  const bcrypt = (await import("bcryptjs")).default;

  // Step 1: create the two canonical tenants
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

  // Step 6: create/refresh canonical users — DO UPDATE ensures credentials are always correct on startup
  const demoHash = await bcrypt.hash("admin123", 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, tenant_id, role, is_active)
     VALUES ('demo', $1, $2, 'superadmin', true)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           tenant_id     = EXCLUDED.tenant_id,
           is_active     = true`,
    [demoHash, demoId]
  );

  // Rename legacy 'admin' user → 'jmorales3' if it still exists (one-time rename, idempotent)
  await pool.query(
    `UPDATE users SET username = 'jmorales3'
     WHERE username = 'admin' AND tenant_id = $1`,
    [mainId]
  );

  const mainHash = await bcrypt.hash("jrm38212", 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, tenant_id, role, is_active)
     VALUES ('jmorales3', $1, $2, 'superadmin', true)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           tenant_id     = EXCLUDED.tenant_id,
           role          = 'superadmin',
           is_active     = true`,
    [mainHash, mainId]
  );

  // Step 7: seed real clinic patients into both tenants (idempotent — only runs when tenant has 0 patients)
  const realPatients: [string, string, string, string | null][] = [
    // [name, patient_code, date_of_birth (YYYY-MM-DD), notes]
    ["Maria Gonzalez",           "PT-001",  "1978-03-15", "Routine dermatology follow-up"],
    ["James Okafor",             "PT-002",  "1965-07-22", "Post-surgical wound monitoring"],
    ["Sarah Chen",               "PT-003",  "1990-11-08", "Pediatric skin condition tracking"],
    ["Juan Morales",             "1224",    "1954-06-29", null],
    ["Nouhad Omais",             "22204",   "2012-08-20", null],
    ["Carmen Croston",           "10709",   "1963-09-01", null],
    ["Natasha Pasco",            "174813",  "2014-01-30", null],
    ["Fabia Abrahams",           "20450",   "1962-02-05", null],
    ["Ann Marie Broce",          "21083",   "2014-08-26", null],
    ["Nathaniel Jean Francois",  "21768",   "1989-05-03", null],
    ["Luis Adolfo Franco",       "21869",   "2013-08-22", null],
    ["Jesus Armando Cerrud",     "22414",   "2013-11-27", null],
    ["Emilie Marin",             "22448",   "2010-03-15", null],
    ["Kenia Caballero",          "22500",   "1975-10-06", null],
    ["Rita de Vasquez",          "22536",   "1968-04-09", null],
    ["Alejandro Echevers",       "22591",   "1999-07-28", null],
    ["Muhammad Hasan",           "22669",   "2013-11-26", null],
    ["Asinat Omais",             "22795",   "2012-06-30", null],
    ["Virginia Rivera",          "22810",   "2010-01-03", null],
    ["Derek Cisneros",           "22812",   "2006-02-20", null],
    ["Lisbeth Pernia",           "22814",   "1978-08-28", null],
    ["Brandon Pineda",           "22821",   "2011-09-28", null],
    ["Jacobo Helueni",           "22838",   "2010-05-06", null],
    ["Micael Escobar",           "22839",   "2009-02-03", null],
    ["Juan Pablo Segovia",       "22851",   "1991-01-08", null],
    ["Christopher Arauz",        "22852",   "1999-04-04", null],
    ["Anat Antebi",              "22864",   "2013-11-21", null],
    ["Lia Camila Arauz",         "22891",   "2017-03-21", null],
    ["Analee Spencer",           "22900",   "2008-04-11", null],
    ["Christopher Caolo",        "22907",   "2003-03-05", null],
    ["David Pan",                "22935",   "2012-10-15", null],
    ["Sayida Omais",             "22936",   "2007-07-25", null],
    ["Fernando Pasco",           "92816",   "1972-10-30", null],
  ];

  // Always ensure seed patients exist — ON CONFLICT (patient_code, tenant_id) DO NOTHING
  // guarantees real patients with any other patient_code are never touched or deleted.
  // Removing the old "if count === 0" guard: that guard caused data loss when the DB was
  // reset because a fresh count of 0 would overwrite any surviving real patients.
  for (const tenantId of [mainId, demoId]) {
    let seededCount = 0;
    for (const [name, code, dob, notes] of realPatients) {
      const res = await pool.query(
        `INSERT INTO patients (tenant_id, name, patient_code, date_of_birth, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (patient_code, tenant_id) DO NOTHING`,
        [tenantId, name, code, dob, notes]
      );
      if (res.rowCount && res.rowCount > 0) seededCount++;
    }
    if (seededCount > 0) {
      logger.info({ tenantId, seededCount }, "Seed patients inserted for tenant");
    }
  }

  // Step 8: seed images for both tenants (idempotent — only runs when tenant has 0 images)
    // [patient_code, file_path, file_name, notes, captured_at, is_unassigned, is_library_asset]
    const imageSeeds: [string, string, string, string | null, string, boolean, boolean][] = [
    ["10709", "gcs:images/6/2026-01-16/1780947776898_xz7nc.jpg", "CROSTON, CARMEN  Standard8 Derecho.jpg", "CROSTON, CARMEN  Standard8 Derecho", "2026-01-16 16:21:30+00", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947777247_wdpjk.jpg", "CROSTON, CARMEN  Standard8 Facial.jpg", "CROSTON, CARMEN  Standard8 Facial", "2026-01-16 16:19:10+00", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947777632_nxxj2.jpg", "CROSTON, CARMEN  Standard8 Frontal.jpg", "CROSTON, CARMEN  Standard8 Frontal", "2026-01-16 16:22:08+00", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947777919_pd0lz.jpg", "CROSTON, CARMEN  Standard8 Inferior.jpg", "CROSTON, CARMEN  Standard8 Inferior", "2026-01-16 16:20:58+00", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947778250_jsd7e.jpg", "CROSTON, CARMEN  Standard8 Izquierdo.jpg", "CROSTON, CARMEN  Standard8 Izquierdo", "2026-01-16 16:23:06+00", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947778516_0s99r.jpg", "CROSTON, CARMEN  Standard8 Perfil.jpg", "CROSTON, CARMEN  Standard8 Perfil", "2026-01-16 16:18:36+00", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947778880_fjbaq.jpg", "CROSTON, CARMEN  Standard8 Sonrisa.jpg", "CROSTON, CARMEN  Standard8 Sonrisa", "2026-01-16 16:19:44+00", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947779235_0t2yz.jpg", "CROSTON, CARMEN  Standard8 Superior.jpg", "CROSTON, CARMEN  Standard8 Superior", "2026-01-16 16:20:14+00", false, false],
  ["1224", "gcs:images/4/2026-05-24/1779655535343.jpg", "capture-1779655523755.jpg", null, "2026-05-24 20:45:33.912+00", false, false],
  ["174813", "gcs:images/7/2026-02-13/1780947779585_6qhka.jpg", "PASCO, NATASHA  Standard8 Derecho.jpg", "PASCO, NATASHA  Standard8 Derecho", "2026-02-13 11:15:18+00", false, false],
  ["174813", "gcs:images/7/2026-02-13/1780947779852_6bi1j.jpg", "PASCO, NATASHA  Standard8 Facial.jpg", "PASCO, NATASHA  Standard8 Facial", "2026-02-13 11:17:22+00", false, false],
  ["174813", "gcs:images/7/2026-02-13/1780947780145_icmnd.jpg", "PASCO, NATASHA  Standard8 Frontal.jpg", "PASCO, NATASHA  Standard8 Frontal", "2026-02-13 11:14:54+00", false, false],
  ["174813", "gcs:images/7/2026-02-13/1780947780392_8u0er.jpg", "PASCO, NATASHA  Standard8 Inferior.jpg", "PASCO, NATASHA  Standard8 Inferior", "2026-02-13 11:15:42+00", false, false],
  ["174813", "gcs:images/7/2026-02-13/1780947780700_tkcb2.jpg", "PASCO, NATASHA  Standard8 Izquierdo.jpg", "PASCO, NATASHA  Standard8 Izquierdo", "2026-02-13 11:14:38+00", false, false],
  ["174813", "gcs:images/7/2026-02-13/1780947780936_nfvvz.jpg", "PASCO, NATASHA  Standard8 Perfil.jpg", "PASCO, NATASHA  Standard8 Perfil", "2026-02-13 11:17:00+00", false, false],
  ["174813", "gcs:images/7/2026-02-13/1780947781317_xdihe.jpg", "PASCO, NATASHA  Standard8 Sonrisa.jpg", "PASCO, NATASHA  Standard8 Sonrisa", "2026-02-13 11:17:48+00", false, false],
  ["174813", "gcs:images/7/2026-02-13/1780947781646_mqr8z.jpg", "PASCO, NATASHA  Standard8 Superior.jpg", "PASCO, NATASHA  Standard8 Superior", "2026-02-13 11:16:36+00", false, false],
  ["20450", "gcs:images/8/2026-03-06/1780947781937_h1ift.jpg", "ABRAHAMS, FABIA  Standard8 Derecho.jpg", "ABRAHAMS, FABIA  Standard8 Derecho", "2026-03-06 14:07:16+00", false, false],
  ["20450", "gcs:images/8/2026-03-06/1780947782276_h93nt.jpg", "ABRAHAMS, FABIA  Standard8 Facial.jpg", "ABRAHAMS, FABIA  Standard8 Facial", "2026-03-06 14:02:44+00", false, false],
  ["20450", "gcs:images/8/2026-03-06/1780947782554_eeg3i.jpg", "ABRAHAMS, FABIA  Standard8 Frontal.jpg", "ABRAHAMS, FABIA  Standard8 Frontal", "2026-03-06 14:07:40+00", false, false],
  ["20450", "gcs:images/8/2026-03-06/1780947782835_lag2u.jpg", "ABRAHAMS, FABIA  Standard8 Inferior.jpg", "ABRAHAMS, FABIA  Standard8 Inferior", "2026-03-06 14:06:36+00", false, false],
  ["20450", "gcs:images/8/2026-03-06/1780947783192_a73ur.jpg", "ABRAHAMS, FABIA  Standard8 Izquierdo.jpg", "ABRAHAMS, FABIA  Standard8 Izquierdo", "2026-03-06 14:08:10+00", false, false],
  ["20450", "gcs:images/8/2026-03-06/1780947783511_kau35.jpg", "ABRAHAMS, FABIA  Standard8 Perfil.jpg", "ABRAHAMS, FABIA  Standard8 Perfil", "2026-03-06 14:02:14+00", false, false],
  ["20450", "gcs:images/8/2026-03-06/1780947783814_6tk2p.jpg", "ABRAHAMS, FABIA  Standard8 Sonrisa.jpg", "ABRAHAMS, FABIA  Standard8 Sonrisa", "2026-03-06 14:03:28+00", false, false],
  ["20450", "gcs:images/8/2026-03-06/1780947784200_hot20.jpg", "ABRAHAMS, FABIA  Standard8 Superior.jpg", "ABRAHAMS, FABIA  Standard8 Superior", "2026-03-06 14:04:44+00", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947784493_lo02p.jpg", "BROCE, ANN MARIE Standard8 Derecho.jpg", "BROCE, ANN MARIE Standard8 Derecho", "2026-01-16 16:13:32+00", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947784799_1pnqi.jpg", "BROCE, ANN MARIE Standard8 Facial.jpg", "BROCE, ANN MARIE Standard8 Facial", "2026-01-16 16:16:10+00", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947785117_ibpsq.jpg", "BROCE, ANN MARIE Standard8 Frontal.jpg", "BROCE, ANN MARIE Standard8 Frontal", "2026-01-16 16:13:12+00", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947785402_plfbb.jpg", "BROCE, ANN MARIE Standard8 Inferior.jpg", "BROCE, ANN MARIE Standard8 Inferior", "2026-01-16 16:14:00+00", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947785719_nvour.jpg", "BROCE, ANN MARIE Standard8 Izquierdo.jpg", "BROCE, ANN MARIE Standard8 Izquierdo", "2026-01-16 16:12:44+00", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947786126_do3o7.jpg", "BROCE, ANN MARIE Standard8 Perfil.jpg", "BROCE, ANN MARIE Standard8 Perfil", "2026-01-16 16:15:30+00", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947786488_1poub.jpg", "BROCE, ANN MARIE Standard8 Sonrisa.jpg", "BROCE, ANN MARIE Standard8 Sonrisa", "2026-01-16 16:16:36+00", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947786811_gvqxs.jpg", "BROCE, ANN MARIE Standard8 Superior.jpg", "BROCE, ANN MARIE Standard8 Superior", "2026-01-16 16:15:08+00", false, false],
  ["21768", "gcs:images/10/2026-03-20/1780947787122_8u75s.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Derecho.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Derecho", "2026-03-20 11:59:32+00", false, false],
  ["21768", "gcs:images/10/2026-03-20/1780947787411_uu3iz.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Facial.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Facial", "2026-03-20 11:56:20+00", false, false],
  ["21768", "gcs:images/10/2026-03-20/1780947787684_aek68.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Frontal.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Frontal", "2026-03-20 11:59:56+00", false, false],
  ["21768", "gcs:images/10/2026-03-20/1780947787937_b87lf.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Inferior.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Inferior", "2026-03-20 11:59:10+00", false, false],
  ["21768", "gcs:images/10/2026-03-20/1780947788225_bv6up.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Izquierdo.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Izquierdo", "2026-03-20 12:00:18+00", false, false],
  ["21768", "gcs:images/10/2026-03-20/1780947788507_q0dan.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Perfil.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Perfil", "2026-03-20 11:55:46+00", false, false],
  ["21768", "gcs:images/10/2026-03-20/1780947788852_6rsgq.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Sonrisa.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Sonrisa", "2026-03-20 11:57:06+00", false, false],
  ["21768", "gcs:images/10/2026-03-20/1780947789119_t6yv3.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Superior.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Superior", "2026-03-20 11:58:36+00", false, false],
  ["21869", "gcs:images/11/2026-02-04/1780947789463_mpzeq.jpg", "FRANCO, LUIS ADOLFO Standard8 Derecho.jpg", "FRANCO, LUIS ADOLFO Standard8 Derecho", "2026-02-04 17:44:34+00", false, false],
  ["21869", "gcs:images/11/2026-02-04/1780947789712_aiq88.jpg", "FRANCO, LUIS ADOLFO Standard8 Facial.jpg", "FRANCO, LUIS ADOLFO Standard8 Facial", "2026-02-04 17:45:26+00", false, false],
  ["21869", "gcs:images/11/2026-02-04/1780947790050_uwb9c.jpg", "FRANCO, LUIS ADOLFO Standard8 Frontal.jpg", "FRANCO, LUIS ADOLFO Standard8 Frontal", "2026-02-04 17:44:06+00", false, false],
  ["21869", "gcs:images/11/2026-02-05/1780947790253_iymyg.jpg", "FRANCO, LUIS ADOLFO Standard8 Inferior.jpg", "FRANCO, LUIS ADOLFO Standard8 Inferior", "2026-02-05 10:26:36+00", false, false],
  ["21869", "gcs:images/11/2026-02-04/1780947790557_wxtph.jpg", "FRANCO, LUIS ADOLFO Standard8 Izquierdo.jpg", "FRANCO, LUIS ADOLFO Standard8 Izquierdo", "2026-02-04 17:43:46+00", false, false],
  ["21869", "gcs:images/11/2026-02-04/1780947790789_qut5d.jpg", "FRANCO, LUIS ADOLFO Standard8 Perfil.jpg", "FRANCO, LUIS ADOLFO Standard8 Perfil", "2026-02-04 17:45:00+00", false, false],
  ["21869", "gcs:images/11/2026-02-04/1780947791123_yjeug.jpg", "FRANCO, LUIS ADOLFO Standard8 Sonrisa.jpg", "FRANCO, LUIS ADOLFO Standard8 Sonrisa", "2026-02-04 17:45:50+00", false, false],
  ["21869", "gcs:images/11/2026-02-04/1780947791481_gfpck.jpg", "FRANCO, LUIS ADOLFO Standard8 Superior.jpg", "FRANCO, LUIS ADOLFO Standard8 Superior", "2026-02-04 17:46:46+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728947246.jpg", "2026-05-21 09.54.30.jpg", null, "2026-05-25 17:09:04.591+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728949151.jpg", "2026-05-21 09.54.48.jpg", null, "2026-05-25 17:09:07.612+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728951123.jpg", "2026-05-21 09.55.10.jpg", null, "2026-05-25 17:09:09.321+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728952798.jpg", "2026-05-21 09.55.49.jpg", null, "2026-05-25 17:09:11.285+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728956222.jpg", "2026-05-21 09.56.05.jpg", null, "2026-05-25 17:09:14.599+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728957924.jpg", "2026-05-21 09.56.39.jpg", null, "2026-05-25 17:09:16.374+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728960144.jpg", "2026-05-21 09.56.42.jpg", null, "2026-05-25 17:09:18.073+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728964368.jpg", "2026-05-21 09.56.48.jpg", null, "2026-05-25 17:09:22.377+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728966354.jpg", "2026-05-21 09.57.47.jpg", null, "2026-05-25 17:09:24.524+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728968274.jpg", "2026-05-21 09.57.50.jpg", null, "2026-05-25 17:09:26.503+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728970241.jpg", "2026-05-21 09.58.15.jpg", null, "2026-05-25 17:09:28.41+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728972222.jpg", "2026-05-21 09.58.17.jpg", null, "2026-05-25 17:09:30.37+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728974619.JPG", "IMG_2273.JPG", null, "2026-05-25 17:09:32.367+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728975361.jpg", "Oclusal Superior Nouhad Omais .jpg", null, "2026-05-25 17:09:34.832+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728975944.jpg", "OMAIS, NOUHAD  Standard8 Derecho.jpg", null, "2026-05-25 17:09:35.478+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728976518.jpg", "OMAIS, NOUHAD  Standard8 Facial.jpg", null, "2026-05-25 17:09:36.042+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728977129.jpg", "OMAIS, NOUHAD  Standard8 Frontal.jpg", null, "2026-05-25 17:09:36.622+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728977797.jpg", "OMAIS, NOUHAD  Standard8 Inferior.jpg", null, "2026-05-25 17:09:37.234+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728978332.jpg", "OMAIS, NOUHAD  Standard8 Izquierdo.jpg", null, "2026-05-25 17:09:37.91+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728978965.jpg", "OMAIS, NOUHAD  Standard8 Perfil.jpg", null, "2026-05-25 17:09:38.476+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728979545.jpg", "OMAIS, NOUHAD  Standard8 Sonrisa.jpg", null, "2026-05-25 17:09:39.07+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779728980226.jpg", "OMAIS, NOUHAD  Standard8 Superior.jpg", null, "2026-05-25 17:09:39.638+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779744707793.png", "copy.png", null, "2026-05-25 21:31:45.913+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779744812266.png", "copy.png", null, "2026-05-25 21:33:30.375+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779745482345.png", "copy.png", null, "2026-05-25 21:44:39.755+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779746025451.png", "copy.png", null, "2026-05-25 21:53:42.708+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779746224449.png", "copy.png", null, "2026-05-25 21:57:01.136+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779747461755.png", "copy.png", null, "2026-05-25 22:17:37.863+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779749595367.png", "copy.png", null, "2026-05-25 22:53:12.513+00", false, false],
  ["22204", "gcs:images/5/2026-05-25/1779749828530.png", "copy.png", null, "2026-05-25 22:57:06.153+00", false, false],
  ["22204", "gcs:images/5/2026-05-26/1779796271184.png", "copy.png", null, "2026-05-26 11:51:09.703+00", false, false],
  ["22204", "gcs:images/5/2026-05-26/1779805948537.png", "copy.png", null, "2026-05-26 14:32:27.638+00", false, false],
  ["22204", "gcs:images/5/2026-05-26/1779805979211.png", "copy.png", null, "2026-05-26 14:32:58.428+00", false, false],
  ["22204", "gcs:images/5/2026-05-26/1779810461475.png", "copy.png", null, "2026-05-26 15:47:40.56+00", false, false],
  ["22204", "gcs:images/5/2026-05-26/1779824845506.png", "copy.png", null, "2026-05-26 19:47:25.038+00", false, false],
  ["22204", "gcs:images/5/2026-05-26/1779825837597.png", "copy.png", null, "2026-05-26 20:03:56.91+00", false, false],
  ["22204", "gcs:images/5/2026-05-26/1779828897612.png", "copy.png", null, "2026-05-26 20:54:57.009+00", false, false],
  ["22204", "gcs:images/5/2026-05-26/1779828973190.png", "copy.png", null, "2026-05-26 20:56:12.583+00", false, false],
  ["22204", "gcs:images/5/2026-05-26/1779829087426.png", "copy.png", null, "2026-05-26 20:58:06.891+00", false, false],
  ["22204", "gcs:images/5/2026-05-26/1779829198966.png", "copy.png", null, "2026-05-26 20:59:58.39+00", false, false],
  ["22204", "gcs:images/5/2026-05-30/1780171719737.png", "copy.png", null, "2026-05-30 20:08:35.777+00", false, false],
  ["22204", "gcs:images/5/2026-06-03/1780450533033.png", "copy.png", null, "2026-06-03 01:35:26.081+00", false, false],
  ["22204", "gcs:images/5/2026-06-07/1780792362818.jpg", "copy.jpg", null, "2026-06-07 00:32:36.213+00", false, false],
  ["22204", "gcs:images/5/2026-06-07/1780793097390.jpg", "copy.jpg", null, "2026-06-07 00:44:50.469+00", false, false],
  ["22414", "gcs:images/12/2026-04-02/1780947791852_65bx2.jpg", "CERRUD, JESUS ARMANDO Standard8 Derecho.jpg", "CERRUD, JESUS ARMANDO Standard8 Derecho", "2026-04-02 13:49:34+00", false, false],
  ["22414", "gcs:images/12/2026-04-02/1780947792128_m6v9o.jpg", "CERRUD, JESUS ARMANDO Standard8 Facial.jpg", "CERRUD, JESUS ARMANDO Standard8 Facial", "2026-04-02 13:54:10+00", false, false],
  ["22414", "gcs:images/12/2026-04-02/1780947792405_n4ds4.jpg", "CERRUD, JESUS ARMANDO Standard8 Frontal.jpg", "CERRUD, JESUS ARMANDO Standard8 Frontal", "2026-04-02 13:49:00+00", false, false],
  ["22414", "gcs:images/12/2026-04-02/1780947792665_5xsf4.jpg", "CERRUD, JESUS ARMANDO Standard8 Inferior.jpg", "CERRUD, JESUS ARMANDO Standard8 Inferior", "2026-04-02 13:55:52+00", false, false],
  ["22414", "gcs:images/12/2026-04-02/1780947792984_bcrra.jpg", "CERRUD, JESUS ARMANDO Standard8 Izquierdo.jpg", "CERRUD, JESUS ARMANDO Standard8 Izquierdo", "2026-04-02 13:48:26+00", false, false],
  ["22414", "gcs:images/12/2026-04-02/1780947793346_epjz2.jpg", "CERRUD, JESUS ARMANDO Standard8 Perfil.jpg", "CERRUD, JESUS ARMANDO Standard8 Perfil", "2026-04-02 13:53:48+00", false, false],
  ["22414", "gcs:images/12/2026-04-02/1780947793657_d56yr.jpg", "CERRUD, JESUS ARMANDO Standard8 Sonrisa.jpg", "CERRUD, JESUS ARMANDO Standard8 Sonrisa", "2026-04-02 13:54:40+00", false, false],
  ["22414", "gcs:images/12/2026-04-02/1780947794022_mgu4f.jpg", "CERRUD, JESUS ARMANDO Standard8 Superior.jpg", "CERRUD, JESUS ARMANDO Standard8 Superior", "2026-04-02 13:53:18+00", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947794301_l16ln.jpg", "MARIN, EMILIE  Standard8 Derecho.jpg", "MARIN, EMILIE  Standard8 Derecho", "2026-01-16 16:30:20+00", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947794577_mb8u8.jpg", "MARIN, EMILIE  Standard8 Facial.jpg", "MARIN, EMILIE  Standard8 Facial", "2026-01-16 16:28:02+00", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947794881_h3mjd.jpg", "MARIN, EMILIE  Standard8 Frontal.jpg", "MARIN, EMILIE  Standard8 Frontal", "2026-01-16 16:30:56+00", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947795138_qdzdh.jpg", "MARIN, EMILIE  Standard8 Inferior.jpg", "MARIN, EMILIE  Standard8 Inferior", "2026-01-16 16:29:50+00", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947795433_ywbzg.jpg", "MARIN, EMILIE  Standard8 Izquierdo.jpg", "MARIN, EMILIE  Standard8 Izquierdo", "2026-01-16 16:31:16+00", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947795808_mbxxj.jpg", "MARIN, EMILIE  Standard8 Perfil.jpg", "MARIN, EMILIE  Standard8 Perfil", "2026-01-16 16:27:34+00", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947796092_nf81b.jpg", "MARIN, EMILIE  Standard8 Sonrisa.jpg", "MARIN, EMILIE  Standard8 Sonrisa", "2026-01-16 16:28:26+00", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947796373_q2dgy.jpg", "MARIN, EMILIE  Standard8 Superior.jpg", "MARIN, EMILIE  Standard8 Superior", "2026-01-16 16:29:28+00", false, false],
  ["22500", "gcs:images/14/2026-03-02/1780947796653_ado62.jpg", "CABALLERO, KENIA  Standard8 Derecho.jpg", "CABALLERO, KENIA  Standard8 Derecho", "2026-03-02 16:28:54+00", false, false],
  ["22500", "gcs:images/14/2026-03-02/1780947796899_vl2fa.jpg", "CABALLERO, KENIA  Standard8 Facial.jpg", "CABALLERO, KENIA  Standard8 Facial", "2026-03-02 16:33:22+00", false, false],
  ["22500", "gcs:images/14/2026-03-02/1780947797286_q7ct5.jpg", "CABALLERO, KENIA  Standard8 Frontal.jpg", "CABALLERO, KENIA  Standard8 Frontal", "2026-03-02 16:28:00+00", false, false],
  ["22500", "gcs:images/14/2026-03-02/1780947797613_p18vc.jpg", "CABALLERO, KENIA  Standard8 Inferior.jpg", "CABALLERO, KENIA  Standard8 Inferior", "2026-03-02 16:29:56+00", false, false],
  ["22500", "gcs:images/14/2026-03-02/1780947797887_wjufw.jpg", "CABALLERO, KENIA  Standard8 Izquierdo.jpg", "CABALLERO, KENIA  Standard8 Izquierdo", "2026-03-02 16:27:46+00", false, false],
  ["22500", "gcs:images/14/2026-03-02/1780947798153_608cr.jpg", "CABALLERO, KENIA  Standard8 Perfil.jpg", "CABALLERO, KENIA  Standard8 Perfil", "2026-03-02 16:32:58+00", false, false],
  ["22500", "gcs:images/14/2026-03-02/1780947798488_yvvhs.jpg", "CABALLERO, KENIA  Standard8 Sonrisa.jpg", "CABALLERO, KENIA  Standard8 Sonrisa", "2026-03-02 16:34:04+00", false, false],
  ["22500", "gcs:images/14/2026-03-02/1780947798841_jhkxl.jpg", "CABALLERO, KENIA  Standard8 Superior.jpg", "CABALLERO, KENIA  Standard8 Superior", "2026-03-02 16:30:34+00", false, false],
  ["22536", "gcs:images/15/2026-01-26/1780947799131_j4qfq.jpg", "VASQUEZ, RITA DE  Standard8 Derecho.jpg", "VASQUEZ, RITA DE  Standard8 Derecho", "2026-01-26 16:21:32+00", false, false],
  ["22536", "gcs:images/15/2026-01-26/1780947799429_03ose.jpg", "VASQUEZ, RITA DE  Standard8 Facial.jpg", "VASQUEZ, RITA DE  Standard8 Facial", "2026-01-26 16:19:04+00", false, false],
  ["22536", "gcs:images/15/2026-01-26/1780947799843_79c2c.jpg", "VASQUEZ, RITA DE  Standard8 Frontal.jpg", "VASQUEZ, RITA DE  Standard8 Frontal", "2026-01-26 16:22:12+00", false, false],
  ["22536", "gcs:images/15/2026-01-26/1780947800133_21fvs.jpg", "VASQUEZ, RITA DE  Standard8 Inferior.jpg", "VASQUEZ, RITA DE  Standard8 Inferior", "2026-01-26 16:21:10+00", false, false],
  ["22536", "gcs:images/15/2026-01-26/1780947800547_nkvk5.jpg", "VASQUEZ, RITA DE  Standard8 Izquierdo.jpg", "VASQUEZ, RITA DE  Standard8 Izquierdo", "2026-01-26 16:22:58+00", false, false],
  ["22536", "gcs:images/15/2026-01-26/1780947800858_x87dd.jpg", "VASQUEZ, RITA DE  Standard8 Perfil.jpg", "VASQUEZ, RITA DE  Standard8 Perfil", "2026-01-26 16:18:12+00", false, false],
  ["22536", "gcs:images/15/2026-01-26/1780947801190_aysha.jpg", "VASQUEZ, RITA DE  Standard8 Sonrisa.jpg", "VASQUEZ, RITA DE  Standard8 Sonrisa", "2026-01-26 16:19:32+00", false, false],
  ["22536", "gcs:images/15/2026-01-26/1780947801521_pohj6.jpg", "VASQUEZ, RITA DE  Standard8 Superior.jpg", "VASQUEZ, RITA DE  Standard8 Superior", "2026-01-26 16:20:34+00", false, false],
  ["22591", "gcs:images/16/2026-03-20/1780947801908_d3izk.jpg", "ECHEVERS, ALEJANDRO  Standard8 Derecho.jpg", "ECHEVERS, ALEJANDRO  Standard8 Derecho", "2026-03-20 11:50:20+00", false, false],
  ["22591", "gcs:images/16/2026-03-20/1780947802201_mi3w7.jpg", "ECHEVERS, ALEJANDRO  Standard8 Facial.jpg", "ECHEVERS, ALEJANDRO  Standard8 Facial", "2026-03-20 11:45:40+00", false, false],
  ["22591", "gcs:images/16/2026-03-20/1780947802498_t5srr.jpg", "ECHEVERS, ALEJANDRO  Standard8 Frontal.jpg", "ECHEVERS, ALEJANDRO  Standard8 Frontal", "2026-03-20 11:50:46+00", false, false],
  ["22591", "gcs:images/16/2026-03-20/1780947802907_qxihq.jpg", "ECHEVERS, ALEJANDRO  Standard8 Inferior.jpg", "ECHEVERS, ALEJANDRO  Standard8 Inferior", "2026-03-20 11:49:12+00", false, false],
  ["22591", "gcs:images/16/2026-03-20/1780947803198_m4trj.jpg", "ECHEVERS, ALEJANDRO  Standard8 Izquierdo.jpg", "ECHEVERS, ALEJANDRO  Standard8 Izquierdo", "2026-03-20 11:51:24+00", false, false],
  ["22591", "gcs:images/16/2026-03-20/1780947803659_jgezc.jpg", "ECHEVERS, ALEJANDRO  Standard8 Perfil.jpg", "ECHEVERS, ALEJANDRO  Standard8 Perfil", "2026-03-20 11:45:16+00", false, false],
  ["22591", "gcs:images/16/2026-03-20/1780947804003_azfz3.jpg", "ECHEVERS, ALEJANDRO  Standard8 Sonrisa.jpg", "ECHEVERS, ALEJANDRO  Standard8 Sonrisa", "2026-03-20 11:46:00+00", false, false],
  ["22591", "gcs:images/16/2026-03-20/1780947804290_k8eak.jpg", "ECHEVERS, ALEJANDRO  Standard8 Superior.jpg", "ECHEVERS, ALEJANDRO  Standard8 Superior", "2026-03-20 11:47:00+00", false, false],
  ["22669", "gcs:images/17/2026-01-21/1780947804633_yxypu.jpg", "HASAN, MUHAMMAD  Standard8 Derecho.jpg", "HASAN, MUHAMMAD  Standard8 Derecho", "2026-01-21 17:38:02+00", false, false],
  ["22669", "gcs:images/17/2026-01-21/1780947804894_e7vw1.jpg", "HASAN, MUHAMMAD  Standard8 Facial.jpg", "HASAN, MUHAMMAD  Standard8 Facial", "2026-01-21 17:41:00+00", false, false],
  ["22669", "gcs:images/17/2026-01-21/1780947805305_7uqpf.jpg", "HASAN, MUHAMMAD  Standard8 Frontal.jpg", "HASAN, MUHAMMAD  Standard8 Frontal", "2026-01-21 17:37:36+00", false, false],
  ["22669", "gcs:images/17/2026-01-21/1780947805566_dw1by.jpg", "HASAN, MUHAMMAD  Standard8 Inferior.jpg", "HASAN, MUHAMMAD  Standard8 Inferior", "2026-01-21 17:39:06+00", false, false],
  ["22669", "gcs:images/17/2026-01-21/1780947805875_7gu1u.jpg", "HASAN, MUHAMMAD  Standard8 Izquierdo.jpg", "HASAN, MUHAMMAD  Standard8 Izquierdo", "2026-01-21 17:37:20+00", false, false],
  ["22669", "gcs:images/17/2026-01-21/1780947806173_n55wg.jpg", "HASAN, MUHAMMAD  Standard8 Perfil.jpg", "HASAN, MUHAMMAD  Standard8 Perfil", "2026-01-21 17:40:30+00", false, false],
  ["22669", "gcs:images/17/2026-01-21/1780947806523_en6lz.jpg", "HASAN, MUHAMMAD  Standard8 Sonrisa.jpg", "HASAN, MUHAMMAD  Standard8 Sonrisa", "2026-01-21 17:41:20+00", false, false],
  ["22669", "gcs:images/17/2026-01-21/1780947806802_btobx.jpg", "HASAN, MUHAMMAD  Standard8 Superior.jpg", "HASAN, MUHAMMAD  Standard8 Superior", "2026-01-21 17:42:08+00", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947807195_yi60v.jpg", "OMAIS, ASINAT  Standard8 Derecho.jpg", "OMAIS, ASINAT  Standard8 Derecho", "2026-01-16 11:52:24+00", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947807488_97gfo.jpg", "OMAIS, ASINAT  Standard8 Facial.jpg", "OMAIS, ASINAT  Standard8 Facial", "2026-01-16 11:49:42+00", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947807940_5grvy.jpg", "OMAIS, ASINAT  Standard8 Frontal.jpg", "OMAIS, ASINAT  Standard8 Frontal", "2026-01-16 11:52:44+00", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947808184_zol1m.jpg", "OMAIS, ASINAT  Standard8 Inferior.jpg", "OMAIS, ASINAT  Standard8 Inferior", "2026-01-16 11:51:44+00", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947808508_j24el.jpg", "OMAIS, ASINAT  Standard8 Izquierdo.jpg", "OMAIS, ASINAT  Standard8 Izquierdo", "2026-01-16 11:54:56+00", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947808786_wnzy3.jpg", "OMAIS, ASINAT  Standard8 Perfil.jpg", "OMAIS, ASINAT  Standard8 Perfil", "2026-01-16 11:49:16+00", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947809090_93x9r.jpg", "OMAIS, ASINAT  Standard8 Sonrisa.jpg", "OMAIS, ASINAT  Standard8 Sonrisa", "2026-01-16 11:50:14+00", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947809397_h0awz.jpg", "OMAIS, ASINAT  Standard8 Superior.jpg", "OMAIS, ASINAT  Standard8 Superior", "2026-01-16 11:50:54+00", false, false],
  ["22810", "gcs:images/19/2026-01-27/1780947809679_w5uom.jpg", "RIVERA, VIRGINIA  Standard8 Derecho.jpg", "RIVERA, VIRGINIA  Standard8 Derecho", "2026-01-27 08:30:14+00", false, false],
  ["22810", "gcs:images/19/2026-01-27/1780947809951_79l4p.jpg", "RIVERA, VIRGINIA  Standard8 Facial.jpg", "RIVERA, VIRGINIA  Standard8 Facial", "2026-01-27 08:27:10+00", false, false],
  ["22810", "gcs:images/19/2026-01-27/1780947810231_0hup2.jpg", "RIVERA, VIRGINIA  Standard8 Frontal.jpg", "RIVERA, VIRGINIA  Standard8 Frontal", "2026-01-27 08:30:54+00", false, false],
  ["22810", "gcs:images/19/2026-01-27/1780947810517_r0p60.jpg", "RIVERA, VIRGINIA  Standard8 Inferior.jpg", "RIVERA, VIRGINIA  Standard8 Inferior", "2026-01-27 08:29:48+00", false, false],
  ["22810", "gcs:images/19/2026-01-27/1780947810849_30am9.jpg", "RIVERA, VIRGINIA  Standard8 Izquierdo.jpg", "RIVERA, VIRGINIA  Standard8 Izquierdo", "2026-01-27 08:31:32+00", false, false],
  ["22810", "gcs:images/19/2026-01-27/1780947811199_oxpx3.jpg", "RIVERA, VIRGINIA  Standard8 Perfil.jpg", "RIVERA, VIRGINIA  Standard8 Perfil", "2026-01-27 08:26:12+00", false, false],
  ["22810", "gcs:images/19/2026-01-27/1780947811511_c9fdu.jpg", "RIVERA, VIRGINIA  Standard8 Sonrisa.jpg", "RIVERA, VIRGINIA  Standard8 Sonrisa", "2026-01-27 08:28:20+00", false, false],
  ["22810", "gcs:images/19/2026-01-27/1780947811783_2eimn.jpg", "RIVERA, VIRGINIA  Standard8 Superior.jpg", "RIVERA, VIRGINIA  Standard8 Superior", "2026-01-27 08:28:52+00", false, false],
  ["22812", "gcs:images/20/2026-01-28/1780947812082_q3qef.jpg", "CISNEROS, DEREK  Standard8 Derecho.jpg", "CISNEROS, DEREK  Standard8 Derecho", "2026-01-28 16:11:42+00", false, false],
  ["22812", "gcs:images/20/2026-01-28/1780947812337_wgw6v.jpg", "CISNEROS, DEREK  Standard8 Facial.jpg", "CISNEROS, DEREK  Standard8 Facial", "2026-01-28 16:08:06+00", false, false],
  ["22812", "gcs:images/20/2026-01-28/1780947812581_ajrwc.jpg", "CISNEROS, DEREK  Standard8 Frontal.jpg", "CISNEROS, DEREK  Standard8 Frontal", "2026-01-28 16:12:06+00", false, false],
  ["22812", "gcs:images/20/2026-01-28/1780947812836_j0ic0.jpg", "CISNEROS, DEREK  Standard8 Inferior.jpg", "CISNEROS, DEREK  Standard8 Inferior", "2026-01-28 16:11:20+00", false, false],
  ["22812", "gcs:images/20/2026-01-28/1780947813347_475np.jpg", "CISNEROS, DEREK  Standard8 Izquierdo.jpg", "CISNEROS, DEREK  Standard8 Izquierdo", "2026-01-28 16:12:26+00", false, false],
  ["22812", "gcs:images/20/2026-01-28/1780947813600_x8xko.jpg", "CISNEROS, DEREK  Standard8 Perfil.jpg", "CISNEROS, DEREK  Standard8 Perfil", "2026-01-28 16:07:34+00", false, false],
  ["22812", "gcs:images/20/2026-01-28/1780947813868_xhpvn.jpg", "CISNEROS, DEREK  Standard8 Sonrisa.jpg", "CISNEROS, DEREK  Standard8 Sonrisa", "2026-01-28 16:08:34+00", false, false],
  ["22812", "gcs:images/20/2026-01-28/1780947814159_mkds7.jpg", "CISNEROS, DEREK  Standard8 Superior.jpg", "CISNEROS, DEREK  Standard8 Superior", "2026-01-28 16:12:48+00", false, false],
  ["22814", "gcs:images/21/2026-02-05/1780947814475_as3w3.jpg", "PERNIA, LISBETH  Standard8 Derecho.jpg", "PERNIA, LISBETH  Standard8 Derecho", "2026-02-05 10:30:08+00", false, false],
  ["22814", "gcs:images/21/2026-02-05/1780947814771_93g2d.jpg", "PERNIA, LISBETH  Standard8 Facial.jpg", "PERNIA, LISBETH  Standard8 Facial", "2026-02-05 10:28:14+00", false, false],
  ["22814", "gcs:images/21/2026-02-05/1780947815081_6cjjo.jpg", "PERNIA, LISBETH  Standard8 Frontal.jpg", "PERNIA, LISBETH  Standard8 Frontal", "2026-02-05 10:30:38+00", false, false],
  ["22814", "gcs:images/21/2026-02-05/1780947815343_mwj57.jpg", "PERNIA, LISBETH  Standard8 Inferior.jpg", "PERNIA, LISBETH  Standard8 Inferior", "2026-02-05 10:29:42+00", false, false],
  ["22814", "gcs:images/21/2026-02-05/1780947815653_hjntp.jpg", "PERNIA, LISBETH  Standard8 Izquierdo.jpg", "PERNIA, LISBETH  Standard8 Izquierdo", "2026-02-05 10:31:02+00", false, false],
  ["22814", "gcs:images/21/2026-02-05/1780947815937_1ajui.jpg", "PERNIA, LISBETH  Standard8 Perfil.jpg", "PERNIA, LISBETH  Standard8 Perfil", "2026-02-05 10:27:48+00", false, false],
  ["22814", "gcs:images/21/2026-02-05/1780947816312_1t7tc.jpg", "PERNIA, LISBETH  Standard8 Sonrisa.jpg", "PERNIA, LISBETH  Standard8 Sonrisa", "2026-02-05 10:28:40+00", false, false],
  ["22814", "gcs:images/21/2026-02-05/1780947816690_qkm7u.jpg", "PERNIA, LISBETH  Standard8 Superior.jpg", "PERNIA, LISBETH  Standard8 Superior", "2026-02-05 10:29:04+00", false, false],
  ["22821", "gcs:images/22/2026-02-05/1780947816998_plpca.jpg", "PINEDA, BRANDON  Standard8 Derecho.jpg", "PINEDA, BRANDON  Standard8 Derecho", "2026-02-05 10:33:34+00", false, false],
  ["22821", "gcs:images/22/2026-02-05/1780947817282_2ixzr.jpg", "PINEDA, BRANDON  Standard8 Facial.jpg", "PINEDA, BRANDON  Standard8 Facial", "2026-02-05 10:35:52+00", false, false],
  ["22821", "gcs:images/22/2026-02-05/1780947817533_n5o2l.jpg", "PINEDA, BRANDON  Standard8 Frontal.jpg", "PINEDA, BRANDON  Standard8 Frontal", "2026-02-05 10:33:12+00", false, false],
  ["22821", "gcs:images/22/2026-02-05/1780947817833_kvkgt.jpg", "PINEDA, BRANDON  Standard8 Inferior.jpg", "PINEDA, BRANDON  Standard8 Inferior", "2026-02-05 10:34:30+00", false, false],
  ["22821", "gcs:images/22/2026-02-05/1780947818214_wyfft.jpg", "PINEDA, BRANDON  Standard8 Izquierdo.jpg", "PINEDA, BRANDON  Standard8 Izquierdo", "2026-02-05 10:32:44+00", false, false],
  ["22821", "gcs:images/22/2026-02-05/1780947818468_l1oup.jpg", "PINEDA, BRANDON  Standard8 Perfil.jpg", "PINEDA, BRANDON  Standard8 Perfil", "2026-02-05 10:35:26+00", false, false],
  ["22821", "gcs:images/22/2026-02-05/1780947818778_yqzhi.jpg", "PINEDA, BRANDON  Standard8 Sonrisa.jpg", "PINEDA, BRANDON  Standard8 Sonrisa", "2026-02-05 10:36:22+00", false, false],
  ["22821", "gcs:images/22/2026-02-05/1780947819078_inr9w.jpg", "PINEDA, BRANDON  Standard8 Superior.jpg", "PINEDA, BRANDON  Standard8 Superior", "2026-02-05 10:35:00+00", false, false],
  ["22838", "gcs:images/23/2026-02-19/1780947819398_ad4n2.jpg", "HELUENI, JACOBO  Standard8 Derecho.jpg", "HELUENI, JACOBO  Standard8 Derecho", "2026-02-19 14:10:48+00", false, false],
  ["22838", "gcs:images/23/2026-02-19/1780947819640_cthkv.jpg", "HELUENI, JACOBO  Standard8 Facial.jpg", "HELUENI, JACOBO  Standard8 Facial", "2026-02-19 14:13:30+00", false, false],
  ["22838", "gcs:images/23/2026-02-19/1780947819927_cwo6h.jpg", "HELUENI, JACOBO  Standard8 Frontal.jpg", "HELUENI, JACOBO  Standard8 Frontal", "2026-02-19 14:10:18+00", false, false],
  ["22838", "gcs:images/23/2026-02-19/1780947820166_8utpv.jpg", "HELUENI, JACOBO  Standard8 Inferior.jpg", "HELUENI, JACOBO  Standard8 Inferior", "2026-02-19 14:11:40+00", false, false],
  ["22838", "gcs:images/23/2026-02-19/1780947820507_osx9z.jpg", "HELUENI, JACOBO  Standard8 Izquierdo.jpg", "HELUENI, JACOBO  Standard8 Izquierdo", "2026-02-19 14:09:48+00", false, false],
  ["22838", "gcs:images/23/2026-02-19/1780947820754_xsut7.jpg", "HELUENI, JACOBO  Standard8 Perfil.jpg", "HELUENI, JACOBO  Standard8 Perfil", "2026-02-19 14:12:52+00", false, false],
  ["22838", "gcs:images/23/2026-02-19/1780947821058_31oad.jpg", "HELUENI, JACOBO  Standard8 Sonrisa.jpg", "HELUENI, JACOBO  Standard8 Sonrisa", "2026-02-19 14:13:56+00", false, false],
  ["22838", "gcs:images/23/2026-02-19/1780947821341_73whf.jpg", "HELUENI, JACOBO  Standard8 Superior.jpg", "HELUENI, JACOBO  Standard8 Superior", "2026-02-19 14:12:28+00", false, false],
  ["22839", "gcs:images/24/2026-02-19/1780947821660_c2zjb.jpg", "ESCOBAR, MICAEL  Standard8 Derecho.jpg", "ESCOBAR, MICAEL  Standard8 Derecho", "2026-02-19 14:23:26+00", false, false],
  ["22839", "gcs:images/24/2026-02-19/1780947821944_9iwsv.jpg", "ESCOBAR, MICAEL  Standard8 Facial.jpg", "ESCOBAR, MICAEL  Standard8 Facial", "2026-02-19 14:27:04+00", false, false],
  ["22839", "gcs:images/24/2026-02-19/1780947822250_xkgmm.jpg", "ESCOBAR, MICAEL  Standard8 Frontal.jpg", "ESCOBAR, MICAEL  Standard8 Frontal", "2026-02-19 14:22:46+00", false, false],
  ["22839", "gcs:images/24/2026-02-19/1780947822524_qix2u.jpg", "ESCOBAR, MICAEL  Standard8 Inferior.jpg", "ESCOBAR, MICAEL  Standard8 Inferior", "2026-02-19 14:24:48+00", false, false],
  ["22839", "gcs:images/24/2026-02-19/1780947822860_jghzp.jpg", "ESCOBAR, MICAEL  Standard8 Izquierdo.jpg", "ESCOBAR, MICAEL  Standard8 Izquierdo", "2026-02-19 14:22:24+00", false, false],
  ["22839", "gcs:images/24/2026-02-19/1780947823121_hzu47.jpg", "ESCOBAR, MICAEL  Standard8 Perfil.jpg", "ESCOBAR, MICAEL  Standard8 Perfil", "2026-02-19 14:26:40+00", false, false],
  ["22839", "gcs:images/24/2026-02-19/1780947823424_h654g.jpg", "ESCOBAR, MICAEL  Standard8 Sonrisa.jpg", "ESCOBAR, MICAEL  Standard8 Sonrisa", "2026-02-19 14:27:32+00", false, false],
  ["22839", "gcs:images/24/2026-02-19/1780947823747_txvrc.jpg", "ESCOBAR, MICAEL  Standard8 Superior.jpg", "ESCOBAR, MICAEL  Standard8 Superior", "2026-02-19 14:26:16+00", false, false],
  ["22851", "gcs:images/25/2026-03-02/1780947824109_lpx1e.jpg", "SEGOVIA, JUAN PABLO Standard8 Derecho.jpg", "SEGOVIA, JUAN PABLO Standard8 Derecho", "2026-03-02 15:58:36+00", false, false],
  ["22851", "gcs:images/25/2026-03-02/1780947824356_lw2rp.jpg", "SEGOVIA, JUAN PABLO Standard8 Facial.jpg", "SEGOVIA, JUAN PABLO Standard8 Facial", "2026-03-02 15:56:08+00", false, false],
  ["22851", "gcs:images/25/2026-03-02/1780947824632_oldhb.jpg", "SEGOVIA, JUAN PABLO Standard8 Frontal.jpg", "SEGOVIA, JUAN PABLO Standard8 Frontal", "2026-03-02 15:59:10+00", false, false],
  ["22851", "gcs:images/25/2026-03-02/1780947824887_nw0a7.jpg", "SEGOVIA, JUAN PABLO Standard8 Inferior.jpg", "SEGOVIA, JUAN PABLO Standard8 Inferior", "2026-03-02 15:58:16+00", false, false],
  ["22851", "gcs:images/25/2026-03-02/1780947825197_a0qe5.jpg", "SEGOVIA, JUAN PABLO Standard8 Izquierdo.jpg", "SEGOVIA, JUAN PABLO Standard8 Izquierdo", "2026-03-02 15:59:48+00", false, false],
  ["22851", "gcs:images/25/2026-03-02/1780947825446_t25jf.jpg", "SEGOVIA, JUAN PABLO Standard8 Perfil.jpg", "SEGOVIA, JUAN PABLO Standard8 Perfil", "2026-03-02 15:55:46+00", false, false],
  ["22851", "gcs:images/25/2026-03-02/1780947825898_p7i4d.jpg", "SEGOVIA, JUAN PABLO Standard8 Sonrisa.jpg", "SEGOVIA, JUAN PABLO Standard8 Sonrisa", "2026-03-02 15:56:44+00", false, false],
  ["22851", "gcs:images/25/2026-03-02/1780947826382_jtsgk.jpg", "SEGOVIA, JUAN PABLO Standard8 Superior.jpg", "SEGOVIA, JUAN PABLO Standard8 Superior", "2026-03-02 15:57:34+00", false, false],
  ["22852", "gcs:images/26/2026-03-02/1780947826667_rte7k.jpg", "ARAUZ, CHRISTOPHER  Standard8 Derecho.jpg", "ARAUZ, CHRISTOPHER  Standard8 Derecho", "2026-03-02 16:05:50+00", false, false],
  ["22852", "gcs:images/26/2026-03-02/1780947826956_hkqlx.jpg", "ARAUZ, CHRISTOPHER  Standard8 Facial.jpg", "ARAUZ, CHRISTOPHER  Standard8 Facial", "2026-03-02 16:08:42+00", false, false],
  ["22852", "gcs:images/26/2026-03-02/1780947827214_3lrme.jpg", "ARAUZ, CHRISTOPHER  Standard8 Frontal.jpg", "ARAUZ, CHRISTOPHER  Standard8 Frontal", "2026-03-02 16:05:28+00", false, false],
  ["22852", "gcs:images/26/2026-03-02/1780947827462_f6ffq.jpg", "ARAUZ, CHRISTOPHER  Standard8 Inferior.jpg", "ARAUZ, CHRISTOPHER  Standard8 Inferior", "2026-03-02 16:07:10+00", false, false],
  ["22852", "gcs:images/26/2026-03-02/1780947827798_j7jin.jpg", "ARAUZ, CHRISTOPHER  Standard8 Izquierdo.jpg", "ARAUZ, CHRISTOPHER  Standard8 Izquierdo", "2026-03-02 16:04:36+00", false, false],
  ["22852", "gcs:images/26/2026-03-02/1780947828065_q9ecs.jpg", "ARAUZ, CHRISTOPHER  Standard8 Perfil.jpg", "ARAUZ, CHRISTOPHER  Standard8 Perfil", "2026-03-02 16:08:12+00", false, false],
  ["22852", "gcs:images/26/2026-03-02/1780947828379_jp5a4.jpg", "ARAUZ, CHRISTOPHER  Standard8 Sonrisa.jpg", "ARAUZ, CHRISTOPHER  Standard8 Sonrisa", "2026-03-02 16:09:10+00", false, false],
  ["22852", "gcs:images/26/2026-03-02/1780947828667_awbik.jpg", "ARAUZ, CHRISTOPHER  Standard8 Superior.jpg", "ARAUZ, CHRISTOPHER  Standard8 Superior", "2026-03-02 16:07:50+00", false, false],
  ["22864", "gcs:images/27/2026-02-05/1780947829081_w3801.jpg", "ANTEBI, ANAT  Standard8 Derecho.jpg", "ANTEBI, ANAT  Standard8 Derecho", "2026-02-05 10:39:36+00", false, false],
  ["22864", "gcs:images/27/2026-02-05/1780947829292_xyuvy.jpg", "ANTEBI, ANAT  Standard8 Facial.jpg", "ANTEBI, ANAT  Standard8 Facial", "2026-02-05 10:42:26+00", false, false],
  ["22864", "gcs:images/27/2026-02-05/1780947829601_0rse1.jpg", "ANTEBI, ANAT  Standard8 Frontal.jpg", "ANTEBI, ANAT  Standard8 Frontal", "2026-02-05 10:38:54+00", false, false],
  ["22864", "gcs:images/27/2026-02-05/1780947829877_m3fml.jpg", "ANTEBI, ANAT  Standard8 Inferior.jpg", "ANTEBI, ANAT  Standard8 Inferior", "2026-02-05 10:40:24+00", false, false],
  ["22864", "gcs:images/27/2026-02-05/1780947830146_im4lk.jpg", "ANTEBI, ANAT  Standard8 Izquierdo.jpg", "ANTEBI, ANAT  Standard8 Izquierdo", "2026-02-05 10:38:02+00", false, false],
  ["22864", "gcs:images/27/2026-02-05/1780947830362_bt7m0.jpg", "ANTEBI, ANAT  Standard8 Perfil.jpg", "ANTEBI, ANAT  Standard8 Perfil", "2026-02-05 10:42:02+00", false, false],
  ["22864", "gcs:images/27/2026-02-05/1780947830720_jwd87.jpg", "ANTEBI, ANAT  Standard8 Sonrisa.jpg", "ANTEBI, ANAT  Standard8 Sonrisa", "2026-02-05 10:42:52+00", false, false],
  ["22864", "gcs:images/27/2026-02-05/1780947831080_9l5r9.jpg", "ANTEBI, ANAT  Standard8 Superior.jpg", "ANTEBI, ANAT  Standard8 Superior", "2026-02-05 10:41:22+00", false, false],
  ["22891", "gcs:images/28/2026-04-02/1780947831354_hdivv.jpg", "ARAUZ, LIA CAMILA Standard8 Derecho.jpg", "ARAUZ, LIA CAMILA Standard8 Derecho", "2026-04-02 14:05:42+00", false, false],
  ["22891", "gcs:images/28/2026-04-02/1780947831607_9s1jo.jpg", "ARAUZ, LIA CAMILA Standard8 Facial.jpg", "ARAUZ, LIA CAMILA Standard8 Facial", "2026-04-02 14:10:04+00", false, false],
  ["22891", "gcs:images/28/2026-04-02/1780947831873_jysb0.jpg", "ARAUZ, LIA CAMILA Standard8 Frontal.jpg", "ARAUZ, LIA CAMILA Standard8 Frontal", "2026-04-02 14:04:50+00", false, false],
  ["22891", "gcs:images/28/2026-04-02/1780947832134_gyh2o.jpg", "ARAUZ, LIA CAMILA Standard8 Inferior.jpg", "ARAUZ, LIA CAMILA Standard8 Inferior", "2026-04-02 14:08:30+00", false, false],
  ["22891", "gcs:images/28/2026-04-02/1780947832655_jee0c.jpg", "ARAUZ, LIA CAMILA Standard8 Izquierdo.jpg", "ARAUZ, LIA CAMILA Standard8 Izquierdo", "2026-04-02 14:03:38+00", false, false],
  ["22891", "gcs:images/28/2026-04-02/1780947832932_gf29v.jpg", "ARAUZ, LIA CAMILA Standard8 Perfil.jpg", "ARAUZ, LIA CAMILA Standard8 Perfil", "2026-04-02 14:09:34+00", false, false],
  ["22891", "gcs:images/28/2026-04-02/1780947833273_zyorv.jpg", "ARAUZ, LIA CAMILA Standard8 Sonrisa.jpg", "ARAUZ, LIA CAMILA Standard8 Sonrisa", "2026-04-02 14:10:28+00", false, false],
  ["22891", "gcs:images/28/2026-04-02/1780947833553_6r8zp.jpg", "ARAUZ, LIA CAMILA Standard8 Superior.jpg", "ARAUZ, LIA CAMILA Standard8 Superior", "2026-04-02 14:09:08+00", false, false],
  ["22900", "gcs:images/29/2026-03-23/1780947833847_5hwdg.jpg", "SPENCER, ANALEE  Standard8 Derecho.jpg", "SPENCER, ANALEE  Standard8 Derecho", "2026-03-23 10:34:26+00", false, false],
  ["22900", "gcs:images/29/2026-03-23/1780947834139_6i6zz.jpg", "SPENCER, ANALEE  Standard8 Facial.jpg", "SPENCER, ANALEE  Standard8 Facial", "2026-03-23 10:31:54+00", false, false],
  ["22900", "gcs:images/29/2026-03-23/1780947834412_b55x8.jpg", "SPENCER, ANALEE  Standard8 Frontal.jpg", "SPENCER, ANALEE  Standard8 Frontal", "2026-03-23 10:34:58+00", false, false],
  ["22900", "gcs:images/29/2026-03-23/1780947834690_kntd8.jpg", "SPENCER, ANALEE  Standard8 Inferior.jpg", "SPENCER, ANALEE  Standard8 Inferior", "2026-03-23 10:34:04+00", false, false],
  ["22900", "gcs:images/29/2026-03-23/1780947835040_xyesg.jpg", "SPENCER, ANALEE  Standard8 Izquierdo.jpg", "SPENCER, ANALEE  Standard8 Izquierdo", "2026-03-23 10:35:38+00", false, false],
  ["22900", "gcs:images/29/2026-03-23/1780947835338_ichh9.jpg", "SPENCER, ANALEE  Standard8 Perfil.jpg", "SPENCER, ANALEE  Standard8 Perfil", "2026-03-23 10:31:26+00", false, false],
  ["22900", "gcs:images/29/2026-03-23/1780947835682_d8bue.jpg", "SPENCER, ANALEE  Standard8 Sonrisa.jpg", "SPENCER, ANALEE  Standard8 Sonrisa", "2026-03-23 10:32:26+00", false, false],
  ["22900", "gcs:images/29/2026-03-23/1780947835980_7qoec.jpg", "SPENCER, ANALEE  Standard8 Superior.jpg", "SPENCER, ANALEE  Standard8 Superior", "2026-03-23 10:32:52+00", false, false],
  ["22907", "gcs:images/30/2026-04-10/1780947836281_zih3p.jpg", "CAOLO, CHRISTOPHER  Standard8 Derecho.jpg", "CAOLO, CHRISTOPHER  Standard8 Derecho", "2026-04-10 11:59:34+00", false, false],
  ["22907", "gcs:images/30/2026-04-10/1780947836529_hnzol.jpg", "CAOLO, CHRISTOPHER  Standard8 Facial.jpg", "CAOLO, CHRISTOPHER  Standard8 Facial", "2026-04-10 13:19:34+00", false, false],
  ["22907", "gcs:images/30/2026-04-10/1780947836853_2r5e8.jpg", "CAOLO, CHRISTOPHER  Standard8 Frontal.jpg", "CAOLO, CHRISTOPHER  Standard8 Frontal", "2026-04-10 11:58:22+00", false, false],
  ["22907", "gcs:images/30/2026-04-10/1780947837163_8e2rt.jpg", "CAOLO, CHRISTOPHER  Standard8 Inferior.jpg", "CAOLO, CHRISTOPHER  Standard8 Inferior", "2026-04-10 12:00:06+00", false, false],
  ["22907", "gcs:images/30/2026-04-10/1780947837484_h46ac.jpg", "CAOLO, CHRISTOPHER  Standard8 Izquierdo.jpg", "CAOLO, CHRISTOPHER  Standard8 Izquierdo", "2026-04-10 11:57:56+00", false, false],
  ["22907", "gcs:images/30/2026-04-10/1780947837761_75ran.jpg", "CAOLO, CHRISTOPHER  Standard8 Perfil.jpg", "CAOLO, CHRISTOPHER  Standard8 Perfil", "2026-04-10 13:18:56+00", false, false],
  ["22907", "gcs:images/30/2026-04-10/1780947838110_g7pkv.jpg", "CAOLO, CHRISTOPHER  Standard8 Sonrisa.jpg", "CAOLO, CHRISTOPHER  Standard8 Sonrisa", "2026-04-10 13:20:30+00", false, false],
  ["22907", "gcs:images/30/2026-04-10/1780947838421_s5zkh.jpg", "CAOLO, CHRISTOPHER  Standard8 Superior.jpg", "CAOLO, CHRISTOPHER  Standard8 Superior", "2026-04-10 12:00:30+00", false, false],
  ["22935", "gcs:images/31/2026-05-12/1780947838729_373g6.jpg", "PAN, DAVID  Standard8 Derecho.jpg", "PAN, DAVID  Standard8 Derecho", "2026-05-12 11:31:04+00", false, false],
  ["22935", "gcs:images/31/2026-05-12/1780947838994_irba7.jpg", "PAN, DAVID  Standard8 Facial.jpg", "PAN, DAVID  Standard8 Facial", "2026-05-12 11:34:42+00", false, false],
  ["22935", "gcs:images/31/2026-05-12/1780947839335_ck2br.jpg", "PAN, DAVID  Standard8 Frontal.jpg", "PAN, DAVID  Standard8 Frontal", "2026-05-12 11:30:36+00", false, false],
  ["22935", "gcs:images/31/2026-05-12/1780947839671_fnc2l.jpg", "PAN, DAVID  Standard8 Inferior.jpg", "PAN, DAVID  Standard8 Inferior", "2026-05-12 11:32:44+00", false, false],
  ["22935", "gcs:images/31/2026-05-12/1780947840023_4d3za.jpg", "PAN, DAVID  Standard8 Izquierdo.jpg", "PAN, DAVID  Standard8 Izquierdo", "2026-05-12 11:30:14+00", false, false],
  ["22935", "gcs:images/31/2026-05-12/1780947840323_is3uv.jpg", "PAN, DAVID  Standard8 Perfil.jpg", "PAN, DAVID  Standard8 Perfil", "2026-05-12 11:34:16+00", false, false],
  ["22935", "gcs:images/31/2026-05-12/1780947840672_17sjx.jpg", "PAN, DAVID  Standard8 Sonrisa.jpg", "PAN, DAVID  Standard8 Sonrisa", "2026-05-12 11:35:52+00", false, false],
  ["22935", "gcs:images/31/2026-05-12/1780947840981_cbm1m.jpg", "PAN, DAVID  Standard8 Superior.jpg", "PAN, DAVID  Standard8 Superior", "2026-05-12 11:33:46+00", false, false],
  ["22936", "gcs:images/32/2026-05-06/1780947841316_ltayn.jpg", "OMAIS, SAYIDA  Standard8 Derecho.jpg", "OMAIS, SAYIDA  Standard8 Derecho", "2026-05-06 10:06:28+00", false, false],
  ["22936", "gcs:images/32/2026-05-06/1780947841571_wh6y2.jpg", "OMAIS, SAYIDA  Standard8 Facial.jpg", "OMAIS, SAYIDA  Standard8 Facial", "2026-05-06 10:09:00+00", false, false],
  ["22936", "gcs:images/32/2026-05-06/1780947841852_yoyoc.jpg", "OMAIS, SAYIDA  Standard8 Frontal.jpg", "OMAIS, SAYIDA  Standard8 Frontal", "2026-05-06 10:05:48+00", false, false],
  ["22936", "gcs:images/32/2026-05-06/1780947842114_3h933.jpg", "OMAIS, SAYIDA  Standard8 Inferior.jpg", "OMAIS, SAYIDA  Standard8 Inferior", "2026-05-06 10:07:34+00", false, false],
  ["22936", "gcs:images/32/2026-05-06/1780947842447_wrh7a.jpg", "OMAIS, SAYIDA  Standard8 Izquierdo.jpg", "OMAIS, SAYIDA  Standard8 Izquierdo", "2026-05-06 10:05:10+00", false, false],
  ["22936", "gcs:images/32/2026-05-06/1780947842744_ghbfk.jpg", "OMAIS, SAYIDA  Standard8 Perfil.jpg", "OMAIS, SAYIDA  Standard8 Perfil", "2026-05-06 10:08:36+00", false, false],
  ["22936", "gcs:images/32/2026-05-06/1780947843071_1ncrh.jpg", "OMAIS, SAYIDA  Standard8 Sonrisa.jpg", "OMAIS, SAYIDA  Standard8 Sonrisa", "2026-05-06 10:09:26+00", false, false],
  ["22936", "gcs:images/32/2026-05-06/1780947843382_yq9an.jpg", "OMAIS, SAYIDA  Standard8 Superior.jpg", "OMAIS, SAYIDA  Standard8 Superior", "2026-05-06 10:08:08+00", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947843843_rs4n5.jpg", "PASCO, FERNANDO  Standard8 Derecho.jpg", "PASCO, FERNANDO  Standard8 Derecho", "2026-02-13 11:25:00+00", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947844100_cw2d0.jpg", "PASCO, FERNANDO  Standard8 Facial.jpg", "PASCO, FERNANDO  Standard8 Facial", "2026-02-13 11:27:14+00", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947844386_ie4dg.jpg", "PASCO, FERNANDO  Standard8 Frontal.jpg", "PASCO, FERNANDO  Standard8 Frontal", "2026-02-13 11:24:38+00", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947844723_nbtgo.jpg", "PASCO, FERNANDO  Standard8 Inferior.jpg", "PASCO, FERNANDO  Standard8 Inferior", "2026-02-13 11:25:32+00", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947845063_2eack.jpg", "PASCO, FERNANDO  Standard8 Izquierdo.jpg", "PASCO, FERNANDO  Standard8 Izquierdo", "2026-02-13 11:23:58+00", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947845391_nhbmu.jpg", "PASCO, FERNANDO  Standard8 Perfil.jpg", "PASCO, FERNANDO  Standard8 Perfil", "2026-02-13 11:26:54+00", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947845747_89hvy.jpg", "PASCO, FERNANDO  Standard8 Sonrisa.jpg", "PASCO, FERNANDO  Standard8 Sonrisa", "2026-02-13 11:27:40+00", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947846035_4fajy.jpg", "PASCO, FERNANDO  Standard8 Superior.jpg", "PASCO, FERNANDO  Standard8 Superior", "2026-02-13 11:26:28+00", false, false],
    ];

  // Version stamp: bump this string whenever imageSeeds data changes.
  // On mismatch the seed deletes all images for seeded patients and re-inserts the correct ones.
  const IMAGE_SEED_VERSION = "4";
  const { rows: svRows } = await pool.query<{ value: string }>(
    `SELECT value FROM seed_state WHERE key = 'image_seed_version'`
  );
  const needsReseed = svRows[0]?.value !== IMAGE_SEED_VERSION;

  // Build lookup structures once
  const seedCodes = [...new Set(imageSeeds.map(([code]) => code))];
  const seedByCode = new Map<string, typeof imageSeeds>();
  for (const entry of imageSeeds) {
    const [code] = entry;
    if (!seedByCode.has(code)) seedByCode.set(code, []);
    seedByCode.get(code)!.push(entry);
  }

  for (const tenantId of [mainId, demoId]) {
    const { rows: patRows } = await pool.query<{ id: number; patient_code: string }>(
      `SELECT id, patient_code FROM patients WHERE tenant_id = $1`,
      [tenantId]
    );
    const codeToId = new Map(patRows.map(r => [r.patient_code, r.id]));

    if (needsReseed) {
      // Delete all images for seeded patients so fresh correct paths are inserted below
      const seededPatientIds = seedCodes
        .map(c => codeToId.get(c))
        .filter((id): id is number => id !== undefined);
      if (seededPatientIds.length > 0) {
        await pool.query(
          `DELETE FROM images WHERE patient_id = ANY($1::int[])`,
          [seededPatientIds]
        );
      }

      // Insert seed images (only runs on version change, not every startup)
      let seeded = 0;
      for (const [patCode, filePath, fileName, notes, capturedAt, isUnassigned, isLibrary] of imageSeeds) {
        const patientId = codeToId.get(patCode);
        if (!patientId) continue;
        await pool.query(
          `INSERT INTO images (patient_id, file_path, file_name, notes, captured_at, is_unassigned, is_library_asset, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT (patient_id, file_path) DO NOTHING`,
          [patientId, filePath, fileName, notes, capturedAt, isUnassigned, isLibrary]
        );
        seeded++;
      }
      logger.info({ tenantId, seeded }, "Images seeded for tenant");
    }
  }

  // Record current seed version
  await pool.query(
    `INSERT INTO seed_state (key, value) VALUES ('image_seed_version', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [IMAGE_SEED_VERSION]
  );

  // Seed cephalometric system templates (Steiner, Ricketts, Tweed)
  const { rows: cephSeedRows } = await pool.query<{ value: string }>(
    `SELECT value FROM seed_state WHERE key = 'ceph_templates_v2'`
  );
  if (!cephSeedRows[0]) {
    // Remove any previously-seeded system templates so we can insert the corrected set cleanly.
    // Landmarks and measurements cascade-delete via FK.
    await pool.query(`DELETE FROM ceph_templates WHERE tenant_id IS NULL`);

    // ── Steiner Analysis ─────────────────────────────────────────────────────
    const { rows: [steiner] } = await pool.query<{ id: number }>(
      `INSERT INTO ceph_templates (tenant_id, name, description, locked)
       VALUES (NULL, 'Steiner Analysis', 'Classic Steiner cephalometric analysis (1953)', true)
       RETURNING id`
    );
    if (steiner) {
      const steinerId = steiner.id;
      const steinerLandmarks = [
        ["S",    "Sella",                   "Center of sella turcica",                              0],
        ["N",    "Nasion",                  "Fronto-nasal suture, most anterior point",             1],
        ["Or",   "Orbitale",               "Lowest point of orbital floor",                        2],
        ["Po",   "Porion",                 "Most superior point of external auditory meatus",      3],
        ["ANS",  "Anterior Nasal Spine",   "Tip of anterior nasal spine",                         4],
        ["PNS",  "Posterior Nasal Spine",  "Tip of posterior nasal spine",                        5],
        ["A",    "Point A",                "Deepest point on anterior maxilla (Subspinale)",       6],
        ["B",    "Point B",                "Deepest point on anterior mandible (Supramentale)",    7],
        ["D",    "D Point",               "Center of the mandibular symphysis (Steiner's D point)",8],
        ["Pog",  "Pogonion",              "Most anterior point of chin",                           9],
        ["Gn",   "Gnathion",              "Most antero-inferior point of chin",                    10],
        ["Me",   "Menton",                "Most inferior point of mandibular symphysis",           11],
        ["Go",   "Gonion",                "Most postero-inferior angle of mandible",               12],
        ["Ar",   "Articulare",            "Junction of posterior cranial base and condylar neck",  13],
        ["U1t",  "U1 Tip",               "Tip of most prominent upper central incisor",           14],
        ["U1a",  "U1 Apex",              "Root apex of most prominent upper central incisor",      15],
        ["L1t",  "L1 Tip",               "Tip of most prominent lower central incisor",            16],
        ["L1a",  "L1 Apex",              "Root apex of most prominent lower central incisor",      17],
        ["OcP1", "Occlusal Plane Pt 1",  "Point on occlusal plane (premolar region)",             18],
        ["OcP2", "Occlusal Plane Pt 2",  "Point on occlusal plane (molar region)",                19],
      ];
      for (const [label, name, description, order] of steinerLandmarks) {
        await pool.query(
          `INSERT INTO ceph_landmarks (template_id, label, name, description, display_order) VALUES ($1,$2,$3,$4,$5)`,
          [steinerId, label, name, description, order]
        );
      }
      const steinerMeasurements = [
        // name, type, p1, p2, p3, p4, quadrant, unit, order
        ["SNA",        "angle",        "N",    "S",    "A",    null,   null,  "degrees", 0],
        ["SNB",        "angle",        "N",    "S",    "B",    null,   null,  "degrees", 1],
        ["ANB",        "angle",        "N",    "A",    "B",    null,   null,  "degrees", 2],
        ["SND",        "angle",        "N",    "S",    "D",    null,   null,  "degrees", 3],
        ["GoGn-SN",    "line_angle",   "Go",   "Gn",   "S",    "N",    null,  "degrees", 4],
        ["Occ-SN",     "line_angle",   "OcP1", "OcP2", "S",    "N",    null,  "degrees", 5],
        ["U1-NA (mm)", "perpendicular","U1t",  "N",    "A",    null,   null,  "mm",      6],
        ["U1-NA (°)",  "line_angle",   "U1a",  "U1t",  "N",    "A",    null,  "degrees", 7],
        ["L1-NB (mm)", "perpendicular","L1t",  "N",    "B",    null,   null,  "mm",      8],
        ["L1-NB (°)",  "line_angle",   "L1a",  "L1t",  "N",    "B",    null,  "degrees", 9],
        ["Pog-NB (mm)","perpendicular","Pog",  "N",    "B",    null,   null,  "mm",      10],
        ["SN-GoMe",    "line_angle",   "S",    "N",    "Go",   "Me",   null,  "degrees", 11],
        ["SN-PNS-ANS", "line_angle",   "S",    "N",    "PNS",  "ANS",  null,  "degrees", 12],
      ];
      for (const [name, type, p1, p2, p3, p4, quadrant, unit, order] of steinerMeasurements) {
        await pool.query(
          `INSERT INTO ceph_measurements (template_id, name, type, p1_label, p2_label, p3_label, p4_label, angle_quadrant, unit, display_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [steinerId, name, type, p1, p2, p3, p4, quadrant, unit, order]
        );
      }
    }

    // ── Ricketts Analysis ─────────────────────────────────────────────────────
    const { rows: [ricketts] } = await pool.query<{ id: number }>(
      `INSERT INTO ceph_templates (tenant_id, name, description, locked)
       VALUES (NULL, 'Ricketts Analysis', 'Ricketts cephalometric analysis', true)
       RETURNING id`
    );
    if (ricketts) {
      const rickettsId = ricketts.id;
      const rickettsLandmarks = [
        ["S",   "Sella",                  "Center of sella turcica",                             0],
        ["N",   "Nasion",                 "Fronto-nasal suture, most anterior point",            1],
        ["A",   "Point A",               "Deepest point on anterior maxilla",                    2],
        ["B",   "Point B",               "Deepest point on anterior mandible",                   3],
        ["Po",  "Pogonion",             "Most anterior point of chin",                            4],
        ["Me",  "Menton",               "Most inferior point of mandibular symphysis",            5],
        ["Go",  "Gonion",               "Most postero-inferior angle of mandible",                6],
        ["Cf",  "Condylion (Cf)",       "Center of condylar head",                               7],
        ["DC",  "Condyle Center (DC)",  "Center of condylar head on Ba-N line",                  8],
        ["Xi",  "Xi Point",            "Geometric center of mandibular ramus",                    9],
        ["ANS", "Anterior Nasal Spine", "Tip of anterior nasal spine",                          10],
        ["Pr",  "Pronasal",            "Tip of the nose",                                        11],
        ["Id",  "Infradentale",        "Most anterior-superior point of mandibular alveolus",   12],
        ["Pm",  "Protuberance Menti",  "Junction of mandibular symphysis with chin",            13],
        ["Or",  "Orbitale",           "Lowest point of orbital floor",                           14],
        ["Ptm","Pterygomaxillary",    "Most posterior-superior point of PTM fissure",            15],
        ["U1t","U1 Tip",             "Tip of upper central incisor",                             16],
        ["U1a","U1 Apex",            "Apex of upper central incisor",                            17],
        ["L1t","L1 Tip",             "Tip of lower central incisor",                             18],
        ["L1a","L1 Apex",            "Apex of lower central incisor",                            19],
        ["Ba", "Basion",             "Most inferior posterior point of occipital bone",          20],
      ];
      for (const [label, name, description, order] of rickettsLandmarks) {
        await pool.query(
          `INSERT INTO ceph_landmarks (template_id, label, name, description, display_order) VALUES ($1,$2,$3,$4,$5)`,
          [rickettsId, label, name, description, order]
        );
      }
      const rickettsMeasurements = [
        ["Facial Axis",        "line_angle",    "Cf",  "Gn",  "Ba",  "N",   null,  "degrees", 0],
        ["Facial Depth",       "angle",         "N",   "Po",  "Me",  null,  null,  "degrees", 1],
        ["Mandibular Plane",   "line_angle",    "Go",  "Me",  "Or",  "Cf",  null,  "degrees", 2],
        ["Lower Facial Height","line_angle",    "ANS", "Xi",  "Xi",  "Pm",  null,  "degrees", 3],
        ["Mandibular Arc",     "line_angle",    "DC",  "Xi",  "Xi",  "Pm",  null,  "degrees", 4],
        ["Convexity (A-NPo)",  "perpendicular", "A",   "N",   "Po",  null,  null,  "mm",      5],
        ["A-NPo",              "perpendicular", "A",   "N",   "Po",  null,  null,  "mm",      6],
        ["L1-APo (mm)",        "perpendicular", "L1t", "A",   "Po",  null,  null,  "mm",      7],
        ["L1-APo (°)",         "line_angle",    "L1a", "L1t", "A",   "Po",  null,  "degrees", 8],
        ["U1-APo (mm)",        "perpendicular", "U1t", "A",   "Po",  null,  null,  "mm",      9],
        ["U1-APo (°)",         "line_angle",    "U1a", "U1t", "A",   "Po",  null,  "degrees", 10],
      ];
      for (const [name, type, p1, p2, p3, p4, quadrant, unit, order] of rickettsMeasurements) {
        await pool.query(
          `INSERT INTO ceph_measurements (template_id, name, type, p1_label, p2_label, p3_label, p4_label, angle_quadrant, unit, display_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [rickettsId, name, type, p1, p2, p3, p4, quadrant, unit, order]
        );
      }
    }

    // ── Tweed Analysis ────────────────────────────────────────────────────────
    const { rows: [tweed] } = await pool.query<{ id: number }>(
      `INSERT INTO ceph_templates (tenant_id, name, description, locked)
       VALUES (NULL, 'Tweed Analysis', 'Tweed triangle cephalometric analysis (FMA, FMIA, IMPA)', true)
       RETURNING id`
    );
    if (tweed) {
      const tweedId = tweed.id;
      const tweedLandmarks = [
        ["N",    "Nasion",             "Fronto-nasal suture, most anterior point",            0],
        ["Or",   "Orbitale",          "Lowest point of orbital floor",                        1],
        ["Po",   "Porion",            "Most superior point of external auditory meatus",      2],
        ["ANS",  "Anterior Nasal Spine","Tip of anterior nasal spine",                       3],
        ["A",    "Point A",           "Deepest point on anterior maxilla",                    4],
        ["Me",   "Menton",            "Most inferior point of mandibular symphysis",          5],
        ["B",    "Point B",           "Deepest point on anterior mandible",                   6],
        ["Go",   "Gonion",            "Most postero-inferior angle of mandible",              7],
        ["Gn",   "Gnathion",         "Most antero-inferior point of chin",                    8],
        ["U1t",  "U1 Tip",           "Tip of upper central incisor",                         9],
        ["U1a",  "U1 Apex",          "Apex of upper central incisor",                        10],
        ["L1t",  "L1 Tip",           "Tip of lower central incisor",                         11],
        ["L1a",  "L1 Apex",          "Apex of lower central incisor",                        12],
      ];
      for (const [label, name, description, order] of tweedLandmarks) {
        await pool.query(
          `INSERT INTO ceph_landmarks (template_id, label, name, description, display_order) VALUES ($1,$2,$3,$4,$5)`,
          [tweedId, label, name, description, order]
        );
      }
      const tweedMeasurements = [
        // FMA: angle between Frankfort Horizontal (Or-Po) and Mandibular Plane (Go-Me)
        ["FMA (Frankfort-Mandibular)",  "line_angle", "Or",  "Po",  "Go",  "Me",  null, "degrees", 0],
        // FMIA: angle between Frankfort Horizontal (Or-Po) and lower incisor axis (L1a-L1t)
        ["FMIA (Frankfort-L1 Axis)",   "line_angle", "Or",  "Po",  "L1a", "L1t", null, "degrees", 1],
        // IMPA: angle between lower incisor axis (L1a-L1t) and Mandibular Plane (Go-Me)
        ["IMPA (L1-Mandibular Plane)", "line_angle", "L1a", "L1t", "Go",  "Me",  null, "degrees", 2],
      ];
      for (const [name, type, p1, p2, p3, p4, quadrant, unit, order] of tweedMeasurements) {
        await pool.query(
          `INSERT INTO ceph_measurements (template_id, name, type, p1_label, p2_label, p3_label, p4_label, angle_quadrant, unit, display_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [tweedId, name, type, p1, p2, p3, p4, quadrant, unit, order]
        );
      }
    }

    // ── Witts Analysis ───────────────────────────────────────────────────────
    const { rows: [witts] } = await pool.query<{ id: number }>(
      `INSERT INTO ceph_templates (tenant_id, name, description, locked)
       VALUES (NULL, 'Witts Analysis', 'Witts Appraisal — sagittal jaw relationship via occlusal plane projection (Jacobson 1975)', true)
       RETURNING id`
    );
    if (witts) {
      const wittsId = witts.id;
      const wittsLandmarks = [
        ["A",    "Point A",                  "Deepest point on anterior maxilla (Subspinale)",         0],
        ["B",    "Point B",                  "Deepest point on anterior mandible (Supramentale)",       1],
        ["OcP1", "Occlusal Plane (Anterior)", "Anterior occlusal reference — between upper/lower premolar cusp tips", 2],
        ["OcP2", "Occlusal Plane (Posterior)","Posterior occlusal reference — between upper/lower molar cusp tips",  3],
      ];
      for (const [label, name, description, order] of wittsLandmarks) {
        await pool.query(
          `INSERT INTO ceph_landmarks (template_id, label, name, description, display_order) VALUES ($1,$2,$3,$4,$5)`,
          [wittsId, label, name, description, order]
        );
      }
      // Witts Appraisal: distance between perpendicular feet of A and B on occlusal plane
      // p1=A, p2=B, p3=OcP1 (anterior), p4=OcP2 (posterior)
      // Sign: positive = AO anterior to BO = Class III; negative = Class II
      // Norms: females ≈ -1 mm, males ≈ 0 mm (range −4 to +2)
      await pool.query(
        `INSERT INTO ceph_measurements (template_id, name, type, p1_label, p2_label, p3_label, p4_label, angle_quadrant, unit, ideal_min, ideal_max, display_order)
         VALUES ($1, 'Witts Appraisal', 'witts', 'A', 'B', 'OcP1', 'OcP2', NULL, 'mm', -2, 2, 0)`,
        [wittsId]
      );
    }

    await pool.query(
      `INSERT INTO seed_state (key, value) VALUES ('ceph_templates_v2', 'seeded')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
    );
    logger.info("Cephalometric system templates seeded (Steiner+SND, Ricketts, Tweed, Witts)");
  }

  logger.info("PostgreSQL seed complete (tenants + users + patients + images ensured)");
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

    scheduleAuditCleanup(logger);

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
