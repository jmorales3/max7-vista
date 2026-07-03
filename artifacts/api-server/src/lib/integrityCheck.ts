/**
 * Image integrity checking.
 *
 *  - Backfill: compute sha256 for existing image records that don't have one
 *    yet (older rows created before hashing was added on upload).
 *  - Verify: re-read the stored file for every image that DOES have a hash
 *    and recompute it, flagging any mismatch (corruption / silent edit) or
 *    missing file (deleted out-of-band).
 *
 * File reads happen with bounded concurrency (not fully sequential, not
 * unbounded) via readFileAsBuffer() (GCS or legacy local disk), so a library
 * of several hundred images finishes in seconds rather than minutes while
 * memory usage stays bounded.
 */

import crypto from "crypto";
import { pool } from "@workspace/db";
import { readFileAsBuffer } from "./gcsStorage";

const CONCURRENCY = 16;

export interface BackfillResult {
  scanned: number;
  updated: number;
  missingFile: number;
  errors: Array<{ imageId: number; fileName: string; error: string }>;
}

export interface VerifyMismatch {
  imageId: number;
  fileName: string;
  filePath: string;
  patientId: number | null;
  status: "mismatch" | "missing_file" | "error";
  detail?: string;
}

export interface VerifyResult {
  scanned: number;
  ok: number;
  mismatches: VerifyMismatch[];
  missingFiles: VerifyMismatch[];
  errors: VerifyMismatch[];
}

type ImageRow = {
  id: number;
  patient_id: number | null;
  file_path: string;
  file_name: string;
};

function sha256Of(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Runs `worker` over `items` with at most `concurrency` in flight at once. */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

/** Compute and persist sha256 for every image row where it is currently NULL. */
export async function backfillImageHashes(): Promise<BackfillResult> {
  const { rows } = await pool.query<ImageRow>(
    `SELECT id, patient_id, file_path, file_name FROM images WHERE sha256 IS NULL ORDER BY id`
  );

  const result: BackfillResult = { scanned: rows.length, updated: 0, missingFile: 0, errors: [] };

  await runWithConcurrency(rows, CONCURRENCY, async (row) => {
    try {
      const buffer = await readFileAsBuffer(row.file_path);
      if (!buffer) {
        result.missingFile++;
        return;
      }
      const hash = sha256Of(buffer);
      await pool.query(`UPDATE images SET sha256 = $1 WHERE id = $2`, [hash, row.id]);
      result.updated++;
    } catch (err) {
      result.errors.push({ imageId: row.id, fileName: row.file_name, error: String(err) });
    }
  });

  return result;
}

/**
 * Re-read every image that already has a stored hash and recompute it,
 * reporting any mismatch or missing file. Does not modify the database —
 * this is a read-only audit. Run backfillImageHashes() separately to fix
 * missing hashes; mismatches should be investigated manually since they may
 * indicate corruption rather than a benign change.
 */
export async function verifyImageIntegrity(limit?: number): Promise<VerifyResult> {
  const { rows } = await pool.query<ImageRow & { sha256: string }>(
    `SELECT id, patient_id, file_path, file_name, sha256 FROM images
     WHERE sha256 IS NOT NULL
     ORDER BY id
     ${limit ? "LIMIT $1" : ""}`,
    limit ? [limit] : []
  );

  const result: VerifyResult = { scanned: rows.length, ok: 0, mismatches: [], missingFiles: [], errors: [] };

  await runWithConcurrency(rows, CONCURRENCY, async (row) => {
    try {
      const buffer = await readFileAsBuffer(row.file_path);
      if (!buffer) {
        result.missingFiles.push({
          imageId: row.id,
          fileName: row.file_name,
          filePath: row.file_path,
          patientId: row.patient_id,
          status: "missing_file",
        });
        return;
      }
      const hash = sha256Of(buffer);
      if (hash !== row.sha256) {
        result.mismatches.push({
          imageId: row.id,
          fileName: row.file_name,
          filePath: row.file_path,
          patientId: row.patient_id,
          status: "mismatch",
          detail: `expected ${row.sha256}, got ${hash}`,
        });
      } else {
        result.ok++;
      }
    } catch (err) {
      result.errors.push({
        imageId: row.id,
        fileName: row.file_name,
        filePath: row.file_path,
        patientId: row.patient_id,
        status: "error",
        detail: String(err),
      });
    }
  });

  return result;
}

/** Summary counts for the admin dashboard — cheap, no file I/O. */
export async function getIntegrityStatus() {
  const { rows } = await pool.query<{ total: string; with_hash: string; missing_hash: string }>(
    `SELECT
       count(*) AS total,
       count(*) FILTER (WHERE sha256 IS NOT NULL) AS with_hash,
       count(*) FILTER (WHERE sha256 IS NULL) AS missing_hash
     FROM images`
  );
  const row = rows[0];
  return {
    totalImages: parseInt(row.total, 10),
    withHash: parseInt(row.with_hash, 10),
    missingHash: parseInt(row.missing_hash, 10),
  };
}
