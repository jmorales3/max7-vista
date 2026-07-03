import { Router } from "express";
import {
  getMachineId,
  parseLicenseCode,
  computeRecordHash,
  computeStatus,
  computeExpiryFromNow,
  writeLicFile,
  verifyLicFile,
  type LicenseRecord,
} from "../lib/license";

const IS_SQLITE =
  process.env["ELECTRON_MODE"] === "true" ||
  process.env["SELF_HOST_SQLITE"] === "true";

const USER_DATA_DIR = process.env["USER_DATA_DIR"] ?? process.cwd();

const router = Router();

type SqliteClient = {
  prepare: (s: string) => {
    get: (...a: unknown[]) => unknown;
    run: (...a: unknown[]) => void;
  };
};

function getClient(): SqliteClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { db } = require("@workspace/db") as {
    db: { $client: SqliteClient };
  };
  return db.$client;
}

function ensureRecord(client: SqliteClient, machineId: string): LicenseRecord {
  const existing = client
    .prepare("SELECT * FROM license WHERE machine_id = ? LIMIT 1")
    .get(machineId) as LicenseRecord | undefined;
  if (existing) return existing;

  const firstRunDate = new Date().toISOString();
  const hash = computeRecordHash({
    machine_id: machineId,
    first_run_date: firstRunDate,
    expires_at: null,
    plan_type: null,
    license_code: null,
  });
  client
    .prepare(
      "INSERT INTO license (machine_id, first_run_date, record_hash) VALUES (?, ?, ?)",
    )
    .run(machineId, firstRunDate, hash);

  return client
    .prepare("SELECT * FROM license WHERE machine_id = ? LIMIT 1")
    .get(machineId) as LicenseRecord;
}

// GET /api/license/status  (no auth required)
router.get("/license/status", (req, res) => {
  if (!IS_SQLITE) return res.status(404).json({ error: "Not a desktop install" });
  try {
    const client = getClient();
    const { machineId, deviceMismatch } = getMachineId(USER_DATA_DIR);
    const rec = ensureRecord(client, machineId);
    const licFileValid = verifyLicFile(USER_DATA_DIR, rec);
    return res.json(computeStatus(rec, machineId, licFileValid, deviceMismatch));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/license/activate  (no auth required)
router.post("/license/activate", (req, res) => {
  if (!IS_SQLITE) return res.status(404).json({ error: "Not a desktop install" });
  try {
    const { code } = req.body as { code?: string };
    if (!code) return res.status(400).json({ error: "code is required" });

    const client = getClient();
    const { machineId, deviceMismatch } = getMachineId(USER_DATA_DIR);
    if (deviceMismatch) {
      return res.status(400).json({
        error: "This code is registered to another device",
      });
    }

    const parsed = parseLicenseCode(code);
    if (!parsed) return res.status(400).json({ error: "Invalid code format" });
    if (!parsed.valid) return res.status(400).json({ error: "Invalid license signature" });

    const { payload } = parsed;
    if (payload.machineId !== machineId) {
      return res.status(400).json({ error: "License is not valid for this machine" });
    }

    const rec = ensureRecord(client, machineId);
    const now = new Date().toISOString();
    // Expiry is always computed here, at activation time, from the plan —
    // never trusted from the code itself — so a 6mo/1yr term always runs
    // from the moment of activation, not from when the code was issued.
    const expiresAt = computeExpiryFromNow(payload.plan);
    const cleanCode = code.trim();

    const newHash = computeRecordHash({
      machine_id: machineId,
      first_run_date: rec.first_run_date,
      expires_at: expiresAt,
      plan_type: payload.plan,
      license_code: cleanCode,
    });

    client
      .prepare(
        `UPDATE license SET activated_at = ?, expires_at = ?, plan_type = ?, license_code = ?, record_hash = ? WHERE machine_id = ?`,
      )
      .run(now, expiresAt, payload.plan, cleanCode, newHash, machineId);

    const updated = client
      .prepare("SELECT * FROM license WHERE machine_id = ? LIMIT 1")
      .get(machineId) as LicenseRecord;

    writeLicFile(USER_DATA_DIR, {
      machineId: updated.machine_id,
      plan: updated.plan_type,
      expiresAt: updated.expires_at,
      activatedAt: updated.activated_at,
    });

    return res.json(computeStatus(updated, machineId, true, false));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
