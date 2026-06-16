/**
 * Thin GCS wrapper for uploading and streaming files.
 * Uses Replit sidecar authentication — no credentials config needed.
 *
 * filePath convention stored in DB:
 *   "gcs:<objectName>"   e.g. "gcs:images/4/2024-01-01/1700000000000.jpg"
 *
 * Legacy local-disk paths (no "gcs:" prefix) are still supported for
 * reading so that older records continue to work.
 */

import { Storage } from "@google-cloud/storage";
import type { Response } from "express";
import fs from "fs";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
} as ConstructorParameters<typeof Storage>[0]);

function getBucketName(): string {
  const id = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!id) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
  // env var is the full bucket ID like "replit-objstore-<uuid>"
  // GCS bucket name is just the uuid part after the last slash (or the whole thing)
  return id.startsWith("/") ? id.slice(1) : id;
}

/** Returns true if the filePath is a GCS reference */
export function isGcsPath(filePath: string): boolean {
  return filePath.startsWith("gcs:");
}

/** Convert an object name to the canonical DB storage key */
export function toGcsPath(objectName: string): string {
  return `gcs:${objectName}`;
}

/** Extract the GCS object name from a DB storage key */
export function fromGcsPath(filePath: string): string {
  return filePath.startsWith("gcs:") ? filePath.slice(4) : filePath;
}

/**
 * Ask the Replit sidecar for a short-lived signed PUT URL for the given object,
 * then stream the buffer directly to GCS via that URL.
 *
 * This avoids the @google-cloud/storage SDK credential chain for writes, which
 * can produce 403 errors in production when the external_account token exchange
 * stalls or lacks write permissions. The sidecar-issued signed URL is
 * self-contained and bypasses all SDK auth.
 */
async function uploadToGcsOnce(
  buffer: Buffer,
  objectName: string,
  contentType: string,
  timeoutMs: number,
): Promise<void> {
  const bucketName = getBucketName();

  // 1. Request a signed PUT URL from the sidecar (same endpoint used for GET signed URLs).
  const signedUrlRes = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method: "PUT",
        expires_at: new Date(Date.now() + timeoutMs + 60_000).toISOString(),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!signedUrlRes.ok) {
    const detail = await signedUrlRes.text().catch(() => "");
    throw new Error(`Sidecar signed-url error ${signedUrlRes.status}: ${detail}`);
  }

  const { signed_url } = (await signedUrlRes.json()) as { signed_url: string };

  // 2. PUT the buffer directly to GCS using the signed URL.
  const putRes = await fetch(signed_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => "");
    throw new Error(`GCS PUT failed (${putRes.status}): ${detail}`);
  }
}

export async function uploadToGcs(
  buffer: Buffer,
  objectName: string,
  contentType: string,
): Promise<string> {
  const PER_ATTEMPT_MS = 25_000;
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await uploadToGcsOnce(buffer, objectName, contentType, PER_ATTEMPT_MS);
      return toGcsPath(objectName);
    } catch (err) {
      lastErr = err;
      console.warn(`GCS upload attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1_500 * attempt));
      }
    }
  }

  throw new Error(
    `Storage upload failed after ${MAX_ATTEMPTS} attempts — please try again. Detail: ${String(lastErr)}`,
  );
}

/**
 * Stream a file from GCS (or fall back to local disk) to an Express response.
 * Handles Content-Type and 404 automatically.
 */
export async function streamFile(
  filePath: string,
  fileName: string,
  res: Response,
  download = false,
): Promise<void> {
  if (isGcsPath(filePath)) {
    const objectName = fromGcsPath(filePath);
    const bucket = storageClient.bucket(getBucketName());
    const file = bucket.file(objectName);

    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const [metadata] = await file.getMetadata();
    const contentType = (metadata.contentType as string) || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    if (download) {
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    } else {
      res.setHeader("Cache-Control", "private, max-age=31536000");
    }

    file.createReadStream().pipe(res);
  } else {
    // Legacy local-disk path
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found on disk" });
      return;
    }
    if (download) {
      res.download(filePath, fileName);
    } else {
      res.sendFile(filePath);
    }
  }
}

/**
 * Generate a short-lived signed PUT URL so a browser client can upload a file
 * directly to GCS without routing the body through the Replit proxy.
 * ttlSec defaults to 15 minutes — enough time for the client to start the PUT.
 */
export async function getSignedUploadUrl(
  objectName: string,
  ttlSec = 900,
): Promise<string> {
  const bucketName = getBucketName();

  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method: "PUT",
        expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Sidecar signed-url error ${response.status}: ${detail}`);
  }

  const { signed_url } = await response.json();
  return signed_url as string;
}

/**
 * Generate a time-limited signed GET URL for a file stored in GCS.
 * The returned URL is publicly accessible for `ttlSec` seconds (default 1 hour)
 * and can be passed to Microsoft Office Online viewer or opened in a browser tab.
 * Legacy local-disk paths (no "gcs:" prefix) throw — signed URLs are only for GCS.
 */
export async function getSignedDownloadUrl(
  filePath: string,
  ttlSec = 3600,
): Promise<string> {
  if (!isGcsPath(filePath)) {
    throw new Error("Signed URLs are only supported for GCS-stored files");
  }
  const objectName = fromGcsPath(filePath);
  const bucketName = getBucketName();

  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method: "GET",
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };

  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Sidecar signed-url error ${response.status}`);
  }

  const { signed_url } = await response.json();
  return signed_url as string;
}

/**
 * Download a file from GCS (or legacy local disk) and return it as a Buffer.
 * Returns null if the file does not exist.
 * Used by migration export to bundle files into the ZIP.
 */
export async function readFileAsBuffer(filePath: string): Promise<Buffer | null> {
  if (!isGcsPath(filePath)) {
    // Legacy local-disk path
    if (!fs.existsSync(filePath)) return null;
    return fs.promises.readFile(filePath);
  }
  const objectName = fromGcsPath(filePath);
  const bucket = storageClient.bucket(getBucketName());
  const file = bucket.file(objectName);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buffer] = await file.download();
  return buffer;
}

/**
 * List all objects under a GCS prefix (e.g. "images/").
 * Returns object names relative to the bucket root.
 */
export async function listGcsFiles(prefix = ""): Promise<string[]> {
  const bucket = storageClient.bucket(getBucketName());
  const [files] = await bucket.getFiles({ prefix });
  return files.map((f) => f.name);
}

/**
 * Delete a file from GCS (or local disk for legacy paths).
 * Silently ignores missing files.
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    if (isGcsPath(filePath)) {
      const objectName = fromGcsPath(filePath);
      const bucket = storageClient.bucket(getBucketName());
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) await file.delete();
    } else {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  } catch {
    // ignore — best-effort cleanup
  }
}
