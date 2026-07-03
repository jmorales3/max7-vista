import { Store } from "express-session";
import type { SessionData } from "express-session";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { logger } from "./logger";

export function resolveSessionDbPath(): string {
  const dbPath = process.env["DATABASE_PATH"];
  if (dbPath && dbPath !== ":memory:") {
    return path.join(path.dirname(dbPath), "sessions.db");
  }
  const dataDir = path.join(process.cwd(), "data");
  return path.join(dataDir, "sessions.db");
}

export class SqliteSessionStore extends Store {
  private db: Database.Database;
  private pruneTimer: NodeJS.Timeout;

  constructor() {
    super();

    const sessionDbPath = resolveSessionDbPath();
    const dir = path.dirname(sessionDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(sessionDbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid   TEXT    PRIMARY KEY NOT NULL,
        sess  TEXT    NOT NULL,
        expired_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expired_at
        ON sessions (expired_at);
    `);

    logger.info({ sessionDbPath }, "SQLite session store initialised");

    this.pruneTimer = setInterval(() => this.pruneExpired(), 15 * 60 * 1000);
    this.pruneTimer.unref();
  }

  private pruneExpired(): void {
    try {
      const { changes } = this.db
        .prepare("DELETE FROM sessions WHERE expired_at <= ?")
        .run(Date.now()) as { changes: number };
      if (changes > 0) {
        logger.debug({ pruned: changes }, "Pruned expired sessions from SQLite store");
      }
    } catch (err) {
      logger.warn({ err }, "SQLite session store: failed to prune expired sessions");
    }
  }

  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    try {
      const row = this.db
        .prepare("SELECT sess FROM sessions WHERE sid = ? AND expired_at > ?")
        .get(sid, Date.now()) as { sess: string } | undefined;

      if (!row) {
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess) as SessionData);
    } catch (err) {
      callback(err);
    }
  }

  set(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    try {
      const maxAge = session.cookie?.maxAge ?? 8 * 60 * 60 * 1000;
      const expiredAt = Date.now() + maxAge;
      this.db
        .prepare(
          `INSERT INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE
             SET sess = excluded.sess, expired_at = excluded.expired_at`,
        )
        .run(sid, JSON.stringify(session), expiredAt);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    try {
      this.db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid: string, session: SessionData, callback?: () => void): void {
    try {
      const maxAge = session.cookie?.maxAge ?? 8 * 60 * 60 * 1000;
      const expiredAt = Date.now() + maxAge;
      this.db
        .prepare("UPDATE sessions SET expired_at = ? WHERE sid = ?")
        .run(expiredAt, sid);
      callback?.();
    } catch (err) {
      logger.warn({ err, sid }, "SQLite session store: failed to touch session");
      callback?.();
    }
  }
}
