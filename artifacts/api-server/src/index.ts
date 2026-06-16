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

  // Step 6: create/refresh the demo user (password: admin123) — DO UPDATE ensures hash is always correct
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

  for (const tenantId of [mainId, demoId]) {
    const { rows: pc } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM patients WHERE tenant_id = $1`,
      [tenantId]
    );
    if (parseInt(pc[0]?.count ?? "0") === 0) {
      for (const [name, code, dob, notes] of realPatients) {
        await pool.query(
          `INSERT INTO patients (tenant_id, name, patient_code, date_of_birth, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          [tenantId, name, code, dob, notes]
        );
      }
      logger.info({ tenantId, count: realPatients.length }, "Patients seeded for tenant");
    }
  }

  // Step 8: seed images for both tenants (idempotent — only runs when tenant has 0 images)
  // [patient_code, file_path, file_name, notes, captured_at, is_unassigned, is_library_asset]
  const imageSeeds: [string, string, string, string | null, string, boolean, boolean][] = [
  ["10709", "gcs:images/6/2026-01-16/1780947776898_xz7nc.jpg", "CROSTON, CARMEN  Standard8 Derecho.jpg", "CROSTON, CARMEN  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947777247_wdpjk.jpg", "CROSTON, CARMEN  Standard8 Facial.jpg", "CROSTON, CARMEN  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947777632_nxxj2.jpg", "CROSTON, CARMEN  Standard8 Frontal.jpg", "CROSTON, CARMEN  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947777919_pd0lz.jpg", "CROSTON, CARMEN  Standard8 Inferior.jpg", "CROSTON, CARMEN  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947778250_jsd7e.jpg", "CROSTON, CARMEN  Standard8 Izquierdo.jpg", "CROSTON, CARMEN  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947778516_0s99r.jpg", "CROSTON, CARMEN  Standard8 Perfil.jpg", "CROSTON, CARMEN  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947778836_b3pib.jpg", "CROSTON, CARMEN  Standard8 Superior.jpg", "CROSTON, CARMEN  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["10709", "gcs:images/6/2026-01-16/1780947779148_qopg6.jpg", "CROSTON, CARMEN  Standard8 Sonrisa.jpg", "CROSTON, CARMEN  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["174813", "gcs:images/7/2026-01-16/1780947779586_5hhql.jpg", "PASCO, NATASHA  Standard8 Derecho.jpg", "PASCO, NATASHA  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["174813", "gcs:images/7/2026-01-16/1780947780009_nxqcl.jpg", "PASCO, NATASHA  Standard8 Facial.jpg", "PASCO, NATASHA  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["174813", "gcs:images/7/2026-01-16/1780947780352_vf6kz.jpg", "PASCO, NATASHA  Standard8 Frontal.jpg", "PASCO, NATASHA  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["174813", "gcs:images/7/2026-01-16/1780947780640_34x0q.jpg", "PASCO, NATASHA  Standard8 Inferior.jpg", "PASCO, NATASHA  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["174813", "gcs:images/7/2026-01-16/1780947780975_nh1ku.jpg", "PASCO, NATASHA  Standard8 Izquierdo.jpg", "PASCO, NATASHA  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["174813", "gcs:images/7/2026-01-16/1780947781273_p8pj3.jpg", "PASCO, NATASHA  Standard8 Perfil.jpg", "PASCO, NATASHA  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["174813", "gcs:images/7/2026-01-16/1780947781631_nh8a4.jpg", "PASCO, NATASHA  Standard8 Superior.jpg", "PASCO, NATASHA  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["174813", "gcs:images/7/2026-01-16/1780947781921_k0hxq.jpg", "PASCO, NATASHA  Standard8 Sonrisa.jpg", "PASCO, NATASHA  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["20450", "gcs:images/8/2026-01-16/1780947782279_r9jkp.jpg", "ABRAHAMS, FABIA  Standard8 Derecho.jpg", "ABRAHAMS, FABIA  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["20450", "gcs:images/8/2026-01-16/1780947782617_qk0mv.jpg", "ABRAHAMS, FABIA  Standard8 Facial.jpg", "ABRAHAMS, FABIA  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["20450", "gcs:images/8/2026-01-16/1780947782939_a4v2c.jpg", "ABRAHAMS, FABIA  Standard8 Frontal.jpg", "ABRAHAMS, FABIA  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["20450", "gcs:images/8/2026-01-16/1780947783240_evytf.jpg", "ABRAHAMS, FABIA  Standard8 Inferior.jpg", "ABRAHAMS, FABIA  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["20450", "gcs:images/8/2026-01-16/1780947783581_ldqml.jpg", "ABRAHAMS, FABIA  Standard8 Izquierdo.jpg", "ABRAHAMS, FABIA  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["20450", "gcs:images/8/2026-01-16/1780947783900_0f3ag.jpg", "ABRAHAMS, FABIA  Standard8 Perfil.jpg", "ABRAHAMS, FABIA  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["20450", "gcs:images/8/2026-01-16/1780947784199_6kvq4.jpg", "ABRAHAMS, FABIA  Standard8 Superior.jpg", "ABRAHAMS, FABIA  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["20450", "gcs:images/8/2026-01-16/1780947784529_3mvr3.jpg", "ABRAHAMS, FABIA  Standard8 Sonrisa.jpg", "ABRAHAMS, FABIA  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947784875_7xbts.jpg", "BROCE, ANN MARIE  Standard8 Derecho.jpg", "BROCE, ANN MARIE  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947785215_8v5wj.jpg", "BROCE, ANN MARIE  Standard8 Facial.jpg", "BROCE, ANN MARIE  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947785563_lgcfs.jpg", "BROCE, ANN MARIE  Standard8 Frontal.jpg", "BROCE, ANN MARIE  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947785878_q0sdc.jpg", "BROCE, ANN MARIE  Standard8 Inferior.jpg", "BROCE, ANN MARIE  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947786218_cbvge.jpg", "BROCE, ANN MARIE  Standard8 Izquierdo.jpg", "BROCE, ANN MARIE  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947786526_p8wdh.jpg", "BROCE, ANN MARIE  Standard8 Perfil.jpg", "BROCE, ANN MARIE  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947786831_wkxrd.jpg", "BROCE, ANN MARIE  Standard8 Superior.jpg", "BROCE, ANN MARIE  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["21083", "gcs:images/9/2026-01-16/1780947787130_k40ai.jpg", "BROCE, ANN MARIE  Standard8 Sonrisa.jpg", "BROCE, ANN MARIE  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["21768", "gcs:images/10/2026-01-16/1780947787484_y8j2m.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Derecho.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["21768", "gcs:images/10/2026-01-16/1780947787820_cq7ob.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Facial.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["21768", "gcs:images/10/2026-01-16/1780947788173_lrm0e.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Frontal.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["21768", "gcs:images/10/2026-01-16/1780947788498_m7m6w.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Inferior.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["21768", "gcs:images/10/2026-01-16/1780947788837_o1rqh.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Izquierdo.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["21768", "gcs:images/10/2026-01-16/1780947789136_k7w2r.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Perfil.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["21768", "gcs:images/10/2026-01-16/1780947789472_24w7x.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Superior.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["21768", "gcs:images/10/2026-01-16/1780947789784_a3hpj.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Sonrisa.jpg", "JEAN FRANCOIS, NATHANIEL  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["21869", "gcs:images/11/2026-01-16/1780947790142_3ejit.jpg", "FRANCO, LUIS  Standard8 Derecho.jpg", "FRANCO, LUIS  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["21869", "gcs:images/11/2026-01-16/1780947790487_z8m8c.jpg", "FRANCO, LUIS  Standard8 Facial.jpg", "FRANCO, LUIS  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["21869", "gcs:images/11/2026-01-16/1780947790826_rfk2b.jpg", "FRANCO, LUIS  Standard8 Frontal.jpg", "FRANCO, LUIS  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["21869", "gcs:images/11/2026-01-16/1780947791144_bvjmq.jpg", "FRANCO, LUIS  Standard8 Inferior.jpg", "FRANCO, LUIS  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["21869", "gcs:images/11/2026-01-16/1780947791480_vqmzp.jpg", "FRANCO, LUIS  Standard8 Izquierdo.jpg", "FRANCO, LUIS  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["21869", "gcs:images/11/2026-01-16/1780947791794_lhzk7.jpg", "FRANCO, LUIS  Standard8 Perfil.jpg", "FRANCO, LUIS  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["21869", "gcs:images/11/2026-01-16/1780947792104_r9vte.jpg", "FRANCO, LUIS  Standard8 Superior.jpg", "FRANCO, LUIS  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["21869", "gcs:images/11/2026-01-16/1780947792436_mns4f.jpg", "FRANCO, LUIS  Standard8 Sonrisa.jpg", "FRANCO, LUIS  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22414", "gcs:images/12/2026-01-16/1780947792812_pjk3c.jpg", "CERRUD, JESUS  Standard8 Derecho.jpg", "CERRUD, JESUS  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22414", "gcs:images/12/2026-01-16/1780947793167_xbw8v.jpg", "CERRUD, JESUS  Standard8 Facial.jpg", "CERRUD, JESUS  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22414", "gcs:images/12/2026-01-16/1780947793514_5v7mz.jpg", "CERRUD, JESUS  Standard8 Frontal.jpg", "CERRUD, JESUS  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22414", "gcs:images/12/2026-01-16/1780947793834_t0pnw.jpg", "CERRUD, JESUS  Standard8 Inferior.jpg", "CERRUD, JESUS  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22414", "gcs:images/12/2026-01-16/1780947794180_jh4ql.jpg", "CERRUD, JESUS  Standard8 Izquierdo.jpg", "CERRUD, JESUS  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22414", "gcs:images/12/2026-01-16/1780947794487_vz8xd.jpg", "CERRUD, JESUS  Standard8 Perfil.jpg", "CERRUD, JESUS  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22414", "gcs:images/12/2026-01-16/1780947794792_k3njt.jpg", "CERRUD, JESUS  Standard8 Superior.jpg", "CERRUD, JESUS  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22414", "gcs:images/12/2026-01-16/1780947795094_wq5rb.jpg", "CERRUD, JESUS  Standard8 Sonrisa.jpg", "CERRUD, JESUS  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947795465_8a2hy.jpg", "MARIN, EMILIE  Standard8 Derecho.jpg", "MARIN, EMILIE  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947795808_cr9wx.jpg", "MARIN, EMILIE  Standard8 Facial.jpg", "MARIN, EMILIE  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947796154_xbkve.jpg", "MARIN, EMILIE  Standard8 Frontal.jpg", "MARIN, EMILIE  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947796476_mj4tz.jpg", "MARIN, EMILIE  Standard8 Inferior.jpg", "MARIN, EMILIE  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947796813_5nkpc.jpg", "MARIN, EMILIE  Standard8 Izquierdo.jpg", "MARIN, EMILIE  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947797132_vh3wq.jpg", "MARIN, EMILIE  Standard8 Perfil.jpg", "MARIN, EMILIE  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947797455_jxm8b.jpg", "MARIN, EMILIE  Standard8 Superior.jpg", "MARIN, EMILIE  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22448", "gcs:images/13/2026-01-16/1780947797768_2vqnw.jpg", "MARIN, EMILIE  Standard8 Sonrisa.jpg", "MARIN, EMILIE  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22500", "gcs:images/14/2026-01-16/1780947798149_htk9f.jpg", "CABALLERO, KENIA  Standard8 Derecho.jpg", "CABALLERO, KENIA  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22500", "gcs:images/14/2026-01-16/1780947798500_6b2rl.jpg", "CABALLERO, KENIA  Standard8 Facial.jpg", "CABALLERO, KENIA  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22500", "gcs:images/14/2026-01-16/1780947798836_q7vjp.jpg", "CABALLERO, KENIA  Standard8 Frontal.jpg", "CABALLERO, KENIA  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22500", "gcs:images/14/2026-01-16/1780947799160_x5wmk.jpg", "CABALLERO, KENIA  Standard8 Inferior.jpg", "CABALLERO, KENIA  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22500", "gcs:images/14/2026-01-16/1780947799497_3jmbt.jpg", "CABALLERO, KENIA  Standard8 Izquierdo.jpg", "CABALLERO, KENIA  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22500", "gcs:images/14/2026-01-16/1780947799810_nvrk2.jpg", "CABALLERO, KENIA  Standard8 Perfil.jpg", "CABALLERO, KENIA  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22500", "gcs:images/14/2026-01-16/1780947800127_mq4jh.jpg", "CABALLERO, KENIA  Standard8 Superior.jpg", "CABALLERO, KENIA  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22500", "gcs:images/14/2026-01-16/1780947800451_7czpt.jpg", "CABALLERO, KENIA  Standard8 Sonrisa.jpg", "CABALLERO, KENIA  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22536", "gcs:images/15/2026-01-16/1780947800827_wvb4n.jpg", "DE VASQUEZ, RITA  Standard8 Derecho.jpg", "DE VASQUEZ, RITA  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22536", "gcs:images/15/2026-01-16/1780947801176_kp9xs.jpg", "DE VASQUEZ, RITA  Standard8 Facial.jpg", "DE VASQUEZ, RITA  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22536", "gcs:images/15/2026-01-16/1780947801520_8bvjr.jpg", "DE VASQUEZ, RITA  Standard8 Frontal.jpg", "DE VASQUEZ, RITA  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22536", "gcs:images/15/2026-01-16/1780947801840_f3mqw.jpg", "DE VASQUEZ, RITA  Standard8 Inferior.jpg", "DE VASQUEZ, RITA  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22536", "gcs:images/15/2026-01-16/1780947802177_2thnk.jpg", "DE VASQUEZ, RITA  Standard8 Izquierdo.jpg", "DE VASQUEZ, RITA  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22536", "gcs:images/15/2026-01-16/1780947802489_vcxrb.jpg", "DE VASQUEZ, RITA  Standard8 Perfil.jpg", "DE VASQUEZ, RITA  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22536", "gcs:images/15/2026-01-16/1780947802807_jf6mp.jpg", "DE VASQUEZ, RITA  Standard8 Superior.jpg", "DE VASQUEZ, RITA  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22536", "gcs:images/15/2026-01-16/1780947803119_bx2kv.jpg", "DE VASQUEZ, RITA  Standard8 Sonrisa.jpg", "DE VASQUEZ, RITA  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22591", "gcs:images/16/2026-01-16/1780947803499_qwp5t.jpg", "ECHEVERS, ALEJANDRO  Standard8 Derecho.jpg", "ECHEVERS, ALEJANDRO  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22591", "gcs:images/16/2026-01-16/1780947803853_hm7zv.jpg", "ECHEVERS, ALEJANDRO  Standard8 Facial.jpg", "ECHEVERS, ALEJANDRO  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22591", "gcs:images/16/2026-01-16/1780947804197_3kvnj.jpg", "ECHEVERS, ALEJANDRO  Standard8 Frontal.jpg", "ECHEVERS, ALEJANDRO  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22591", "gcs:images/16/2026-01-16/1780947804518_cx9bw.jpg", "ECHEVERS, ALEJANDRO  Standard8 Inferior.jpg", "ECHEVERS, ALEJANDRO  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22591", "gcs:images/16/2026-01-16/1780947804856_vp4qt.jpg", "ECHEVERS, ALEJANDRO  Standard8 Izquierdo.jpg", "ECHEVERS, ALEJANDRO  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22591", "gcs:images/16/2026-01-16/1780947805166_mt3rb.jpg", "ECHEVERS, ALEJANDRO  Standard8 Perfil.jpg", "ECHEVERS, ALEJANDRO  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22591", "gcs:images/16/2026-01-16/1780947805484_jk8xn.jpg", "ECHEVERS, ALEJANDRO  Standard8 Superior.jpg", "ECHEVERS, ALEJANDRO  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22591", "gcs:images/16/2026-01-16/1780947805794_wv6fh.jpg", "ECHEVERS, ALEJANDRO  Standard8 Sonrisa.jpg", "ECHEVERS, ALEJANDRO  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22669", "gcs:images/17/2026-01-16/1780947806177_5bzqm.jpg", "HASAN, MUHAMMAD  Standard8 Derecho.jpg", "HASAN, MUHAMMAD  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22669", "gcs:images/17/2026-01-16/1780947806524_npj4k.jpg", "HASAN, MUHAMMAD  Standard8 Facial.jpg", "HASAN, MUHAMMAD  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22669", "gcs:images/17/2026-01-16/1780947806862_3tcwv.jpg", "HASAN, MUHAMMAD  Standard8 Frontal.jpg", "HASAN, MUHAMMAD  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22669", "gcs:images/17/2026-01-16/1780947807182_xhbqr.jpg", "HASAN, MUHAMMAD  Standard8 Inferior.jpg", "HASAN, MUHAMMAD  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22669", "gcs:images/17/2026-01-16/1780947807519_mf2jt.jpg", "HASAN, MUHAMMAD  Standard8 Izquierdo.jpg", "HASAN, MUHAMMAD  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22669", "gcs:images/17/2026-01-16/1780947807831_vn7wk.jpg", "HASAN, MUHAMMAD  Standard8 Perfil.jpg", "HASAN, MUHAMMAD  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22669", "gcs:images/17/2026-01-16/1780947808152_zq3cp.jpg", "HASAN, MUHAMMAD  Standard8 Superior.jpg", "HASAN, MUHAMMAD  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22669", "gcs:images/17/2026-01-16/1780947808467_bw8nh.jpg", "HASAN, MUHAMMAD  Standard8 Sonrisa.jpg", "HASAN, MUHAMMAD  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947808849_ck5pt.jpg", "OMAIS, ASINAT  Standard8 Derecho.jpg", "OMAIS, ASINAT  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947809197_qf3xv.jpg", "OMAIS, ASINAT  Standard8 Facial.jpg", "OMAIS, ASINAT  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947809542_7jbmr.jpg", "OMAIS, ASINAT  Standard8 Frontal.jpg", "OMAIS, ASINAT  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947809863_hv4nw.jpg", "OMAIS, ASINAT  Standard8 Inferior.jpg", "OMAIS, ASINAT  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947810201_3tzqp.jpg", "OMAIS, ASINAT  Standard8 Izquierdo.jpg", "OMAIS, ASINAT  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947810513_kx9fb.jpg", "OMAIS, ASINAT  Standard8 Perfil.jpg", "OMAIS, ASINAT  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947810830_vq2mj.jpg", "OMAIS, ASINAT  Standard8 Superior.jpg", "OMAIS, ASINAT  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22795", "gcs:images/18/2026-01-16/1780947811145_8bpwr.jpg", "OMAIS, ASINAT  Standard8 Sonrisa.jpg", "OMAIS, ASINAT  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22810", "gcs:images/19/2026-01-16/1780947811526_cn4tz.jpg", "RIVERA, VIRGINIA  Standard8 Derecho.jpg", "RIVERA, VIRGINIA  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22810", "gcs:images/19/2026-01-16/1780947811872_jq7xb.jpg", "RIVERA, VIRGINIA  Standard8 Facial.jpg", "RIVERA, VIRGINIA  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22810", "gcs:images/19/2026-01-16/1780947812221_5wmkv.jpg", "RIVERA, VIRGINIA  Standard8 Frontal.jpg", "RIVERA, VIRGINIA  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22810", "gcs:images/19/2026-01-16/1780947812543_hf3rn.jpg", "RIVERA, VIRGINIA  Standard8 Inferior.jpg", "RIVERA, VIRGINIA  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22810", "gcs:images/19/2026-01-16/1780947812881_pv8qt.jpg", "RIVERA, VIRGINIA  Standard8 Izquierdo.jpg", "RIVERA, VIRGINIA  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22810", "gcs:images/19/2026-01-16/1780947813194_wx6kb.jpg", "RIVERA, VIRGINIA  Standard8 Perfil.jpg", "RIVERA, VIRGINIA  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22810", "gcs:images/19/2026-01-16/1780947813517_mj4zp.jpg", "RIVERA, VIRGINIA  Standard8 Superior.jpg", "RIVERA, VIRGINIA  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22810", "gcs:images/19/2026-01-16/1780947813834_5bvqt.jpg", "RIVERA, VIRGINIA  Standard8 Sonrisa.jpg", "RIVERA, VIRGINIA  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22812", "gcs:images/20/2026-01-16/1780947814217_kwn7h.jpg", "CISNEROS, DEREK  Standard8 Derecho.jpg", "CISNEROS, DEREK  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22812", "gcs:images/20/2026-01-16/1780947814565_3xqpv.jpg", "CISNEROS, DEREK  Standard8 Facial.jpg", "CISNEROS, DEREK  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22812", "gcs:images/20/2026-01-16/1780947814912_bh2mw.jpg", "CISNEROS, DEREK  Standard8 Frontal.jpg", "CISNEROS, DEREK  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22812", "gcs:images/20/2026-01-16/1780947815233_vf5jn.jpg", "CISNEROS, DEREK  Standard8 Inferior.jpg", "CISNEROS, DEREK  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22812", "gcs:images/20/2026-01-16/1780947815572_qt9bk.jpg", "CISNEROS, DEREK  Standard8 Izquierdo.jpg", "CISNEROS, DEREK  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22812", "gcs:images/20/2026-01-16/1780947815886_cp4xr.jpg", "CISNEROS, DEREK  Standard8 Perfil.jpg", "CISNEROS, DEREK  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22812", "gcs:images/20/2026-01-16/1780947816209_8whnm.jpg", "CISNEROS, DEREK  Standard8 Superior.jpg", "CISNEROS, DEREK  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22812", "gcs:images/20/2026-01-16/1780947816527_fv3tz.jpg", "CISNEROS, DEREK  Standard8 Sonrisa.jpg", "CISNEROS, DEREK  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22814", "gcs:images/21/2026-01-16/1780947816909_7mjkb.jpg", "PERNIA, LISBETH  Standard8 Derecho.jpg", "PERNIA, LISBETH  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22814", "gcs:images/21/2026-01-16/1780947817258_4nqhv.jpg", "PERNIA, LISBETH  Standard8 Facial.jpg", "PERNIA, LISBETH  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22814", "gcs:images/21/2026-01-16/1780947817606_xb3mp.jpg", "PERNIA, LISBETH  Standard8 Frontal.jpg", "PERNIA, LISBETH  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22814", "gcs:images/21/2026-01-16/1780947817929_kw7nt.jpg", "PERNIA, LISBETH  Standard8 Inferior.jpg", "PERNIA, LISBETH  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22814", "gcs:images/21/2026-01-16/1780947818268_pv2qj.jpg", "PERNIA, LISBETH  Standard8 Izquierdo.jpg", "PERNIA, LISBETH  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22814", "gcs:images/21/2026-01-16/1780947818580_3mxhb.jpg", "PERNIA, LISBETH  Standard8 Perfil.jpg", "PERNIA, LISBETH  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22814", "gcs:images/21/2026-01-16/1780947818905_fq8nz.jpg", "PERNIA, LISBETH  Standard8 Superior.jpg", "PERNIA, LISBETH  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22814", "gcs:images/21/2026-01-16/1780947819220_7bvxr.jpg", "PERNIA, LISBETH  Standard8 Sonrisa.jpg", "PERNIA, LISBETH  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22821", "gcs:images/22/2026-01-16/1780947819607_hk4mt.jpg", "PINEDA, BRANDON  Standard8 Derecho.jpg", "PINEDA, BRANDON  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22821", "gcs:images/22/2026-01-16/1780947819957_nq2bv.jpg", "PINEDA, BRANDON  Standard8 Facial.jpg", "PINEDA, BRANDON  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22821", "gcs:images/22/2026-01-16/1780947820309_5zxpk.jpg", "PINEDA, BRANDON  Standard8 Frontal.jpg", "PINEDA, BRANDON  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22821", "gcs:images/22/2026-01-16/1780947820633_wh3qr.jpg", "PINEDA, BRANDON  Standard8 Inferior.jpg", "PINEDA, BRANDON  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22821", "gcs:images/22/2026-01-16/1780947820973_jm7tv.jpg", "PINEDA, BRANDON  Standard8 Izquierdo.jpg", "PINEDA, BRANDON  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22821", "gcs:images/22/2026-01-16/1780947821287_vb4xn.jpg", "PINEDA, BRANDON  Standard8 Perfil.jpg", "PINEDA, BRANDON  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22821", "gcs:images/22/2026-01-16/1780947821617_3kwzh.jpg", "PINEDA, BRANDON  Standard8 Superior.jpg", "PINEDA, BRANDON  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22821", "gcs:images/22/2026-01-16/1780947821934_cp5qb.jpg", "PINEDA, BRANDON  Standard8 Sonrisa.jpg", "PINEDA, BRANDON  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22838", "gcs:images/23/2026-01-16/1780947822325_fv8mr.jpg", "HELUENI, JACOBO  Standard8 Derecho.jpg", "HELUENI, JACOBO  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22838", "gcs:images/23/2026-01-16/1780947822679_qx3pt.jpg", "HELUENI, JACOBO  Standard8 Facial.jpg", "HELUENI, JACOBO  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22838", "gcs:images/23/2026-01-16/1780947823027_8bvkn.jpg", "HELUENI, JACOBO  Standard8 Frontal.jpg", "HELUENI, JACOBO  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22838", "gcs:images/23/2026-01-16/1780947823350_hm4wz.jpg", "HELUENI, JACOBO  Standard8 Inferior.jpg", "HELUENI, JACOBO  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22838", "gcs:images/23/2026-01-16/1780947823690_2vqtj.jpg", "HELUENI, JACOBO  Standard8 Izquierdo.jpg", "HELUENI, JACOBO  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22838", "gcs:images/23/2026-01-16/1780947824001_nk9bx.jpg", "HELUENI, JACOBO  Standard8 Perfil.jpg", "HELUENI, JACOBO  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22838", "gcs:images/23/2026-01-16/1780947824321_5wqjm.jpg", "HELUENI, JACOBO  Standard8 Superior.jpg", "HELUENI, JACOBO  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22838", "gcs:images/23/2026-01-16/1780947824636_7bvxp.jpg", "HELUENI, JACOBO  Standard8 Sonrisa.jpg", "HELUENI, JACOBO  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22839", "gcs:images/24/2026-01-16/1780947825027_mn3qt.jpg", "ESCOBAR, MICAEL  Standard8 Derecho.jpg", "ESCOBAR, MICAEL  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22839", "gcs:images/24/2026-01-16/1780947825380_4bvzk.jpg", "ESCOBAR, MICAEL  Standard8 Facial.jpg", "ESCOBAR, MICAEL  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22839", "gcs:images/24/2026-01-16/1780947825729_xq7mh.jpg", "ESCOBAR, MICAEL  Standard8 Frontal.jpg", "ESCOBAR, MICAEL  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22839", "gcs:images/24/2026-01-16/1780947826053_vb4wt.jpg", "ESCOBAR, MICAEL  Standard8 Inferior.jpg", "ESCOBAR, MICAEL  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22839", "gcs:images/24/2026-01-16/1780947826393_kf8nj.jpg", "ESCOBAR, MICAEL  Standard8 Izquierdo.jpg", "ESCOBAR, MICAEL  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22839", "gcs:images/24/2026-01-16/1780947826706_3mxqb.jpg", "ESCOBAR, MICAEL  Standard8 Perfil.jpg", "ESCOBAR, MICAEL  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22839", "gcs:images/24/2026-01-16/1780947827032_ph7vn.jpg", "ESCOBAR, MICAEL  Standard8 Superior.jpg", "ESCOBAR, MICAEL  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22839", "gcs:images/24/2026-01-16/1780947827349_5bwqr.jpg", "ESCOBAR, MICAEL  Standard8 Sonrisa.jpg", "ESCOBAR, MICAEL  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22851", "gcs:images/25/2026-01-16/1780947827741_jm4kv.jpg", "SEGOVIA, JUAN PABLO  Standard8 Derecho.jpg", "SEGOVIA, JUAN PABLO  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22851", "gcs:images/25/2026-01-16/1780947828095_cx9bt.jpg", "SEGOVIA, JUAN PABLO  Standard8 Facial.jpg", "SEGOVIA, JUAN PABLO  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22851", "gcs:images/25/2026-01-16/1780947828448_7qvnw.jpg", "SEGOVIA, JUAN PABLO  Standard8 Frontal.jpg", "SEGOVIA, JUAN PABLO  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22851", "gcs:images/25/2026-01-16/1780947828773_5bkxp.jpg", "SEGOVIA, JUAN PABLO  Standard8 Inferior.jpg", "SEGOVIA, JUAN PABLO  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22851", "gcs:images/25/2026-01-16/1780947829113_nq3mh.jpg", "SEGOVIA, JUAN PABLO  Standard8 Izquierdo.jpg", "SEGOVIA, JUAN PABLO  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22851", "gcs:images/25/2026-01-16/1780947829425_wv7tb.jpg", "SEGOVIA, JUAN PABLO  Standard8 Perfil.jpg", "SEGOVIA, JUAN PABLO  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22851", "gcs:images/25/2026-01-16/1780947829751_3fxqz.jpg", "SEGOVIA, JUAN PABLO  Standard8 Superior.jpg", "SEGOVIA, JUAN PABLO  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22851", "gcs:images/25/2026-01-16/1780947830067_8bvmj.jpg", "SEGOVIA, JUAN PABLO  Standard8 Sonrisa.jpg", "SEGOVIA, JUAN PABLO  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22852", "gcs:images/26/2026-01-16/1780947830461_kp5qt.jpg", "ARAUZ, CHRISTOPHER  Standard8 Derecho.jpg", "ARAUZ, CHRISTOPHER  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22852", "gcs:images/26/2026-01-16/1780947830815_vn8xb.jpg", "ARAUZ, CHRISTOPHER  Standard8 Facial.jpg", "ARAUZ, CHRISTOPHER  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22852", "gcs:images/26/2026-01-16/1780947831167_4mwqj.jpg", "ARAUZ, CHRISTOPHER  Standard8 Frontal.jpg", "ARAUZ, CHRISTOPHER  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22852", "gcs:images/26/2026-01-16/1780947831490_7bvnk.jpg", "ARAUZ, CHRISTOPHER  Standard8 Inferior.jpg", "ARAUZ, CHRISTOPHER  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22852", "gcs:images/26/2026-01-16/1780947831830_xh3pw.jpg", "ARAUZ, CHRISTOPHER  Standard8 Izquierdo.jpg", "ARAUZ, CHRISTOPHER  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22852", "gcs:images/26/2026-01-16/1780947832143_mq9vt.jpg", "ARAUZ, CHRISTOPHER  Standard8 Perfil.jpg", "ARAUZ, CHRISTOPHER  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22852", "gcs:images/26/2026-01-16/1780947832469_5wbxr.jpg", "ARAUZ, CHRISTOPHER  Standard8 Superior.jpg", "ARAUZ, CHRISTOPHER  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22852", "gcs:images/26/2026-01-16/1780947832783_3kqnp.jpg", "ARAUZ, CHRISTOPHER  Standard8 Sonrisa.jpg", "ARAUZ, CHRISTOPHER  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22864", "gcs:images/27/2026-01-16/1780947833177_bv6mt.jpg", "ANTEBI, ANAT  Standard8 Derecho.jpg", "ANTEBI, ANAT  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22864", "gcs:images/27/2026-01-16/1780947833531_7qxpk.jpg", "ANTEBI, ANAT  Standard8 Facial.jpg", "ANTEBI, ANAT  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22864", "gcs:images/27/2026-01-16/1780947833879_4nwzb.jpg", "ANTEBI, ANAT  Standard8 Frontal.jpg", "ANTEBI, ANAT  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22864", "gcs:images/27/2026-01-16/1780947834203_xm5qt.jpg", "ANTEBI, ANAT  Standard8 Inferior.jpg", "ANTEBI, ANAT  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22864", "gcs:images/27/2026-01-16/1780947834543_kv3jb.jpg", "ANTEBI, ANAT  Standard8 Izquierdo.jpg", "ANTEBI, ANAT  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22864", "gcs:images/27/2026-01-16/1780947834855_8bwxr.jpg", "ANTEBI, ANAT  Standard8 Perfil.jpg", "ANTEBI, ANAT  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22864", "gcs:images/27/2026-01-16/1780947835183_5vqnm.jpg", "ANTEBI, ANAT  Standard8 Superior.jpg", "ANTEBI, ANAT  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22864", "gcs:images/27/2026-01-16/1780947835497_3mxkt.jpg", "ANTEBI, ANAT  Standard8 Sonrisa.jpg", "ANTEBI, ANAT  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22891", "gcs:images/28/2026-01-16/1780947835891_pn7bv.jpg", "ARAUZ, LIA CAMILA  Standard8 Derecho.jpg", "ARAUZ, LIA CAMILA  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22891", "gcs:images/28/2026-01-16/1780947836245_xq4mw.jpg", "ARAUZ, LIA CAMILA  Standard8 Facial.jpg", "ARAUZ, LIA CAMILA  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22891", "gcs:images/28/2026-01-16/1780947836597_7bvzn.jpg", "ARAUZ, LIA CAMILA  Standard8 Frontal.jpg", "ARAUZ, LIA CAMILA  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22891", "gcs:images/28/2026-01-16/1780947836921_4mkjt.jpg", "ARAUZ, LIA CAMILA  Standard8 Inferior.jpg", "ARAUZ, LIA CAMILA  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22891", "gcs:images/28/2026-01-16/1780947837261_nq5xb.jpg", "ARAUZ, LIA CAMILA  Standard8 Izquierdo.jpg", "ARAUZ, LIA CAMILA  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22891", "gcs:images/28/2026-01-16/1780947837573_3vwmk.jpg", "ARAUZ, LIA CAMILA  Standard8 Perfil.jpg", "ARAUZ, LIA CAMILA  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22891", "gcs:images/28/2026-01-16/1780947837900_8bxqp.jpg", "ARAUZ, LIA CAMILA  Standard8 Superior.jpg", "ARAUZ, LIA CAMILA  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22891", "gcs:images/28/2026-01-16/1780947838214_5kvnj.jpg", "ARAUZ, LIA CAMILA  Standard8 Sonrisa.jpg", "ARAUZ, LIA CAMILA  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22900", "gcs:images/29/2026-01-16/1780947838609_wm3qt.jpg", "SPENCER, ANALEE  Standard8 Derecho.jpg", "SPENCER, ANALEE  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22900", "gcs:images/29/2026-01-16/1780947838963_4bvxn.jpg", "SPENCER, ANALEE  Standard8 Facial.jpg", "SPENCER, ANALEE  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22900", "gcs:images/29/2026-01-16/1780947839316_7qmzk.jpg", "SPENCER, ANALEE  Standard8 Frontal.jpg", "SPENCER, ANALEE  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22900", "gcs:images/29/2026-01-16/1780947839641_xv5wt.jpg", "SPENCER, ANALEE  Standard8 Inferior.jpg", "SPENCER, ANALEE  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22900", "gcs:images/29/2026-01-16/1780947839981_5bkqr.jpg", "SPENCER, ANALEE  Standard8 Izquierdo.jpg", "SPENCER, ANALEE  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22900", "gcs:images/29/2026-01-16/1780947840294_mv3xb.jpg", "SPENCER, ANALEE  Standard8 Perfil.jpg", "SPENCER, ANALEE  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22900", "gcs:images/29/2026-01-16/1780947840621_kn7qt.jpg", "SPENCER, ANALEE  Standard8 Superior.jpg", "SPENCER, ANALEE  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22900", "gcs:images/29/2026-01-16/1780947840937_3wvbp.jpg", "SPENCER, ANALEE  Standard8 Sonrisa.jpg", "SPENCER, ANALEE  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22907", "gcs:images/30/2026-01-16/1780947841333_8bxmj.jpg", "CAOLO, CHRISTOPHER  Standard8 Derecho.jpg", "CAOLO, CHRISTOPHER  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22907", "gcs:images/30/2026-01-16/1780947841688_5vqnk.jpg", "CAOLO, CHRISTOPHER  Standard8 Facial.jpg", "CAOLO, CHRISTOPHER  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22907", "gcs:images/30/2026-01-16/1780947842040_4mwzb.jpg", "CAOLO, CHRISTOPHER  Standard8 Frontal.jpg", "CAOLO, CHRISTOPHER  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22907", "gcs:images/30/2026-01-16/1780947842366_xb3qt.jpg", "CAOLO, CHRISTOPHER  Standard8 Inferior.jpg", "CAOLO, CHRISTOPHER  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22907", "gcs:images/30/2026-01-16/1780947842707_7nvwk.jpg", "CAOLO, CHRISTOPHER  Standard8 Izquierdo.jpg", "CAOLO, CHRISTOPHER  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22907", "gcs:images/30/2026-01-16/1780947843020_qv5mb.jpg", "CAOLO, CHRISTOPHER  Standard8 Perfil.jpg", "CAOLO, CHRISTOPHER  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22907", "gcs:images/30/2026-01-16/1780947843350_3bxqt.jpg", "CAOLO, CHRISTOPHER  Standard8 Superior.jpg", "CAOLO, CHRISTOPHER  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22907", "gcs:images/30/2026-01-16/1780947843665_8kvnj.jpg", "CAOLO, CHRISTOPHER  Standard8 Sonrisa.jpg", "CAOLO, CHRISTOPHER  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22935", "gcs:images/31/2026-01-16/1780947844063_5bvwm.jpg", "PAN, DAVID  Standard8 Derecho.jpg", "PAN, DAVID  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22935", "gcs:images/31/2026-01-16/1780947844417_xq7nk.jpg", "PAN, DAVID  Standard8 Facial.jpg", "PAN, DAVID  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22935", "gcs:images/31/2026-01-16/1780947844770_4mwbt.jpg", "PAN, DAVID  Standard8 Frontal.jpg", "PAN, DAVID  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22935", "gcs:images/31/2026-01-16/1780947845096_7bvqr.jpg", "PAN, DAVID  Standard8 Inferior.jpg", "PAN, DAVID  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22935", "gcs:images/31/2026-01-16/1780947845435_kn3xz.jpg", "PAN, DAVID  Standard8 Izquierdo.jpg", "PAN, DAVID  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22935", "gcs:images/31/2026-01-16/1780947845752_vb5mj.jpg", "PAN, DAVID  Standard8 Perfil.jpg", "PAN, DAVID  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22935", "gcs:images/31/2026-01-16/1780947846087_8qxnk.jpg", "PAN, DAVID  Standard8 Superior.jpg", "PAN, DAVID  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22935", "gcs:images/31/2026-01-16/1780947846406_3wvbt.jpg", "PAN, DAVID  Standard8 Sonrisa.jpg", "PAN, DAVID  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["22936", "gcs:images/32/2026-01-16/1780947846806_5bxqm.jpg", "OMAIS, SAYIDA  Standard8 Derecho.jpg", "OMAIS, SAYIDA  Standard8 Derecho", "2026-01-16T16:21:30Z", false, false],
  ["22936", "gcs:images/32/2026-01-16/1780947847160_4kvnj.jpg", "OMAIS, SAYIDA  Standard8 Facial.jpg", "OMAIS, SAYIDA  Standard8 Facial", "2026-01-16T16:19:10Z", false, false],
  ["22936", "gcs:images/32/2026-01-16/1780947847513_7mwzt.jpg", "OMAIS, SAYIDA  Standard8 Frontal.jpg", "OMAIS, SAYIDA  Standard8 Frontal", "2026-01-16T16:22:08Z", false, false],
  ["22936", "gcs:images/32/2026-01-16/1780947847838_xb3qr.jpg", "OMAIS, SAYIDA  Standard8 Inferior.jpg", "OMAIS, SAYIDA  Standard8 Inferior", "2026-01-16T16:20:58Z", false, false],
  ["22936", "gcs:images/32/2026-01-16/1780947848178_kn6vb.jpg", "OMAIS, SAYIDA  Standard8 Izquierdo.jpg", "OMAIS, SAYIDA  Standard8 Izquierdo", "2026-01-16T16:23:06Z", false, false],
  ["22936", "gcs:images/32/2026-01-16/1780947848490_5bwmk.jpg", "OMAIS, SAYIDA  Standard8 Perfil.jpg", "OMAIS, SAYIDA  Standard8 Perfil", "2026-01-16T16:18:36Z", false, false],
  ["22936", "gcs:images/32/2026-01-16/1780947848819_8vxqt.jpg", "OMAIS, SAYIDA  Standard8 Superior.jpg", "OMAIS, SAYIDA  Standard8 Superior", "2026-01-16T16:21:58Z", false, false],
  ["22936", "gcs:images/32/2026-01-16/1780947849134_3mwbn.jpg", "OMAIS, SAYIDA  Standard8 Sonrisa.jpg", "OMAIS, SAYIDA  Standard8 Sonrisa", "2026-01-16T16:18:49Z", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947843080_k3pvb.jpg", "PASCO, FERNANDO  Standard8 Derecho.jpg", "PASCO, FERNANDO  Standard8 Derecho", "2026-02-13T11:28:11Z", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947843396_5xmqj.jpg", "PASCO, FERNANDO  Standard8 Facial.jpg", "PASCO, FERNANDO  Standard8 Facial", "2026-02-13T11:25:59Z", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947843706_8bvnk.jpg", "PASCO, FERNANDO  Standard8 Frontal.jpg", "PASCO, FERNANDO  Standard8 Frontal", "2026-02-13T11:26:09Z", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947844016_xq4mt.jpg", "PASCO, FERNANDO  Standard8 Inferior.jpg", "PASCO, FERNANDO  Standard8 Inferior", "2026-02-13T11:25:25Z", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947844326_7kwnb.jpg", "PASCO, FERNANDO  Standard8 Izquierdo.jpg", "PASCO, FERNANDO  Standard8 Izquierdo", "2026-02-13T11:27:12Z", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947844636_4bvzq.jpg", "PASCO, FERNANDO  Standard8 Perfil.jpg", "PASCO, FERNANDO  Standard8 Perfil", "2026-02-13T11:26:39Z", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947845145_3mxwt.jpg", "PASCO, FERNANDO  Standard8 Superior.jpg", "PASCO, FERNANDO  Standard8 Superior", "2026-02-13T11:25:46Z", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947845747_89hvy.jpg", "PASCO, FERNANDO  Standard8 Sonrisa.jpg", "PASCO, FERNANDO  Standard8 Sonrisa", "2026-02-13T11:27:40Z", false, false],
  ["92816", "gcs:images/33/2026-02-13/1780947846035_4fajy.jpg", "PASCO, FERNANDO  Standard8 Superior.jpg", "PASCO, FERNANDO  Standard8 Superior", "2026-02-13T11:26:28Z", false, false],
  ];

  for (const tenantId of [mainId, demoId]) {
    const { rows: ic } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM images i
         JOIN patients p ON i.patient_id = p.id
        WHERE p.tenant_id = $1`,
      [tenantId]
    );
    if (parseInt(ic[0]?.count ?? "0") === 0) {
      const { rows: patRows } = await pool.query<{ id: number; patient_code: string }>(
        `SELECT id, patient_code FROM patients WHERE tenant_id = $1`,
        [tenantId]
      );
      const codeToId = new Map(patRows.map(r => [r.patient_code, r.id]));

      let seeded = 0;
      for (const [patCode, filePath, fileName, notes, capturedAt, isUnassigned, isLibrary] of imageSeeds) {
        const patientId = codeToId.get(patCode);
        if (!patientId) continue;
        await pool.query(
          `INSERT INTO images (patient_id, file_path, file_name, notes, captured_at, is_unassigned, is_library_asset, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          [patientId, filePath, fileName, notes, capturedAt, isUnassigned, isLibrary]
        );
        seeded++;
      }
      logger.info({ tenantId, seeded }, "Images seeded for tenant");
    }
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
