import crypto from "crypto";
import os from "os";
import fs from "fs";
import path from "path";

export const TRIAL_DAYS = 30;

export const LICENSE_SECRET =
  process.env["LICENSE_HMAC_SECRET"] ?? "max7-dev-fallback-secret-CHANGEME";

export type LicenseState = "trial" | "trial_expired" | "active" | "expired" | "tampered";

export interface LicenseStatus {
  state: LicenseState;
  daysLeft: number | null;
  trialDays: number;
  expiresAt: string | null;
  plan: string | null;
  machineId: string;
  activatedAt: string | null;
}

export interface LicensePayload {
  mid: string;
  plan: "1yr" | "2yr" | "lifetime";
  exp: string | null;
}

export interface LicenseRecord {
  id: number;
  machine_id: string;
  first_run_date: string;
  activated_at: string | null;
  expires_at: string | null;
  plan_type: string | null;
  license_code: string | null;
  record_hash: string;
}

// ── HMAC ──────────────────────────────────────────────────────────────────────

export function signHmac(data: string): string {
  return crypto.createHmac("sha256", LICENSE_SECRET).update(data).digest("hex");
}

// ── Machine ID ────────────────────────────────────────────────────────────────

export function computeMachineId(): string {
  const cpuModel = os.cpus()[0]?.model ?? "unknown-cpu";
  const platform = os.platform();
  let mac = "no-mac";
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
        mac = iface.mac;
        break;
      }
    }
    if (mac !== "no-mac") break;
  }
  const raw = `${cpuModel}::${platform}::${mac}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export function getMachineId(userDataDir: string): string {
  const idFile = path.join(userDataDir, "machine.id");
  const sigFile = path.join(userDataDir, "machine.id.sig");

  if (fs.existsSync(idFile) && fs.existsSync(sigFile)) {
    const stored = fs.readFileSync(idFile, "utf-8").trim();
    const sig = fs.readFileSync(sigFile, "utf-8").trim();
    if (sig === signHmac(stored) && /^[0-9a-f]{32}$/.test(stored)) {
      return stored;
    }
  }

  const id = computeMachineId();
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(idFile, id, "utf-8");
  fs.writeFileSync(sigFile, signHmac(id), "utf-8");
  return id;
}

// ── Record Integrity ──────────────────────────────────────────────────────────

export function computeRecordHash(r: {
  machine_id: string;
  first_run_date: string;
  expires_at: string | null;
  plan_type: string | null;
  license_code: string | null;
}): string {
  const data = `${r.machine_id}|${r.first_run_date}|${r.expires_at ?? ""}|${r.plan_type ?? ""}|${r.license_code ?? ""}`;
  return signHmac(data);
}

// ── License Code ──────────────────────────────────────────────────────────────

export function parseLicenseCode(
  code: string,
): { payload: LicensePayload; valid: boolean } | null {
  try {
    const stripped = code.trim().replace(/^MAX7-/i, "");
    const lastDot = stripped.lastIndexOf(".");
    if (lastDot === -1) return null;
    const b64 = stripped.slice(0, lastDot);
    const sig = stripped.slice(lastDot + 1);
    if (signHmac(b64) !== sig) {
      return { payload: null as unknown as LicensePayload, valid: false };
    }
    const payload = JSON.parse(
      Buffer.from(b64, "base64url").toString("utf-8"),
    ) as LicensePayload;
    return { payload, valid: true };
  } catch {
    return null;
  }
}

export function generateLicenseCode(payload: LicensePayload): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = signHmac(b64);
  return `MAX7-${b64}.${sig}`;
}

// ── Status Computation ────────────────────────────────────────────────────────

export function computeStatus(rec: LicenseRecord, machineId: string): LicenseStatus {
  const expectedHash = computeRecordHash(rec);
  if (rec.record_hash !== expectedHash) {
    return {
      state: "tampered",
      daysLeft: null,
      trialDays: TRIAL_DAYS,
      expiresAt: null,
      plan: null,
      machineId,
      activatedAt: null,
    };
  }

  if (rec.activated_at) {
    const isExpired = rec.expires_at ? new Date(rec.expires_at) < new Date() : false;
    return {
      state: isExpired ? "expired" : "active",
      daysLeft: null,
      trialDays: TRIAL_DAYS,
      expiresAt: rec.expires_at,
      plan: rec.plan_type,
      machineId,
      activatedAt: rec.activated_at,
    };
  }

  const firstRun = new Date(rec.first_run_date);
  const elapsed = Math.floor(
    (Date.now() - firstRun.getTime()) / (1000 * 60 * 60 * 24),
  );
  const daysLeft = Math.max(0, TRIAL_DAYS - elapsed);

  return {
    state: daysLeft > 0 ? "trial" : "trial_expired",
    daysLeft,
    trialDays: TRIAL_DAYS,
    expiresAt: null,
    plan: null,
    machineId,
    activatedAt: null,
  };
}
