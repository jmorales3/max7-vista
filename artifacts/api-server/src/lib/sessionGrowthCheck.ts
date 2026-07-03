import Database from "better-sqlite3";
import { pool } from "@workspace/db";
import { getSetting, setSetting } from "./storage";
import { resolveSessionDbPath } from "./sqliteSessionStore";
import { logger } from "./logger";

const IS_SQLITE =
  process.env["ELECTRON_MODE"] === "true" ||
  process.env["DATABASE_PATH"] !== undefined;

export const SESSION_ALERT_THRESHOLD_SETTING_KEY = "sessionAlertThreshold";
export const DEFAULT_SESSION_ALERT_THRESHOLD = 5000;
const SESSION_ALERT_STATE_SETTING_KEY = "sessionGrowthAlertState";

export interface SessionAlertState {
  active: boolean;
  count: number;
  threshold: number;
  detectedAt: string | null;
}

export async function getSessionAlertThreshold(): Promise<number> {
  const raw = await getSetting(SESSION_ALERT_THRESHOLD_SETTING_KEY);
  if (!raw) return DEFAULT_SESSION_ALERT_THRESHOLD;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_ALERT_THRESHOLD;
}

export async function setSessionAlertThreshold(threshold: number): Promise<void> {
  await setSetting(SESSION_ALERT_THRESHOLD_SETTING_KEY, String(threshold));
}

export async function getSessionCount(): Promise<number> {
  if (IS_SQLITE) {
    const dbPath = resolveSessionDbPath();
    const db = new Database(dbPath, { readonly: true, fileMustExist: false });
    try {
      const row = db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as
        | { count: number }
        | undefined;
      return row?.count ?? 0;
    } finally {
      db.close();
    }
  }

  const result = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM "sessions"');
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

export async function getSessionAlertState(): Promise<SessionAlertState> {
  const raw = await getSetting(SESSION_ALERT_STATE_SETTING_KEY);
  if (!raw) {
    return { active: false, count: 0, threshold: await getSessionAlertThreshold(), detectedAt: null };
  }
  try {
    return JSON.parse(raw) as SessionAlertState;
  } catch {
    return { active: false, count: 0, threshold: await getSessionAlertThreshold(), detectedAt: null };
  }
}

async function setSessionAlertState(state: SessionAlertState): Promise<void> {
  await setSetting(SESSION_ALERT_STATE_SETTING_KEY, JSON.stringify(state));
}

/**
 * Checks how many rows currently live in the session store (Postgres
 * "sessions" table, or the SQLite sessions.db file for self-hosted/Electron
 * mode) and compares against a configurable threshold. An unexpectedly large
 * session table usually means something is failing to clean up sessions
 * (e.g. a broken pruning job, or a client repeatedly re-authenticating
 * without ever expiring), and left unchecked it can slow down every request
 * that touches the session store and blow up disk/DB usage over time.
 *
 * Persists the alert state via the settings table so the admin UI can
 * surface it, and logs a warning the first time the threshold is crossed
 * (not on every check, to avoid log spam) and an info line when it clears.
 */
export async function checkSessionGrowth(): Promise<SessionAlertState> {
  const threshold = await getSessionAlertThreshold();
  let count: number;
  try {
    count = await getSessionCount();
  } catch (err) {
    logger.warn({ err }, "Session growth check: failed to read session count");
    return getSessionAlertState();
  }

  const previous = await getSessionAlertState();
  const isOverThreshold = count >= threshold;

  const state: SessionAlertState = {
    active: isOverThreshold,
    count,
    threshold,
    detectedAt: isOverThreshold ? previous.detectedAt ?? new Date().toISOString() : null,
  };

  if (isOverThreshold && !previous.active) {
    logger.warn(
      { sessionCount: count, threshold },
      "Session store row count exceeds alert threshold — check for a stuck cleanup job or runaway session creation",
    );
  } else if (!isOverThreshold && previous.active) {
    logger.info({ sessionCount: count, threshold }, "Session store row count back under alert threshold");
  }

  await setSessionAlertState(state);
  return state;
}

export function scheduleSessionGrowthCheck(intervalMs = 6 * 60 * 60 * 1000): void {
  const run = () => {
    checkSessionGrowth().catch((err) => {
      logger.warn({ err }, "Session growth check failed");
    });
  };

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
}
