import { queryClient } from "@/lib/queryClient";
import { getListImagesQueryKey, getListPatientImagesQueryKey } from "@workspace/api-client-react";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;
const COMPRESS_THRESHOLD = 512 * 1024;

/**
 * Resize + re-encode an image File to JPEG on a canvas, returned as a Blob.
 * Keeps aspect ratio; caps the longer side at MAX_DIMENSION px.
 */
function compressImage(file: File): Promise<{ blob: Blob; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas 2D unavailable")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("Canvas toBlob failed")); return; }
        resolve({ blob, mimeType: "image/jpeg" });
      }, "image/jpeg", JPEG_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Failed to load image")); };
    img.src = objectUrl;
  });
}

/**
 * Upload a patient image using a direct-to-GCS signed URL flow so the large
 * file body never passes through the Replit deployment proxy (which stalls on
 * bodies over a few hundred KB).
 *
 * Flow:
 *   1. POST /api/images/upload-url  — tiny metadata request → signed GCS PUT URL
 *   2. PUT  <signedUrl>             — raw file bytes go DIRECTLY to GCS
 *   3. POST /api/images/register    — tiny confirmation → creates DB record
 */
export async function uploadPatientImage(
  file: File,
  patientId: number,
  notes?: string,
  capturedAt?: string,
  derivedFromImageId?: number,
) {
  let uploadBlob: Blob = file;
  let mimeType = file.type || "image/jpeg";
  let fileName = file.name || "photo.jpg";

  if (file.size > COMPRESS_THRESHOLD && file.type.startsWith("image/")) {
    const compressed = await compressImage(file);
    uploadBlob = compressed.blob;
    mimeType = compressed.mimeType;
    const ext = mimeType === "image/jpeg" ? ".jpg" : ".png";
    fileName = fileName.replace(/\.[^.]+$/, "") + ext;
  }

  // ── Step 1: get a signed PUT URL from our server (metadata only, tiny body) ──
  const urlRes = await fetch("/api/images/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, mimeType, patientId }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!urlRes.ok) {
    const body = await urlRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Could not prepare upload (HTTP ${urlRes.status})`);
  }

  const { signedUrl, objectName } = await urlRes.json() as { signedUrl: string; objectName: string };

  // ── Step 1b: compute SHA-256 of the bytes we are about to upload ──
  let sha256: string | null = null;
  try {
    const arrayBuffer = await uploadBlob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    sha256 = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // Non-critical — proceed without hash if SubtleCrypto unavailable
  }

  // ── Step 2: PUT file bytes DIRECTLY to GCS — bypasses the Replit proxy ──
  const putRes = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: uploadBlob,
    signal: AbortSignal.timeout(120_000),
  });

  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => "");
    throw new Error(`Upload to storage failed (HTTP ${putRes.status})${detail ? `: ${detail}` : ""} — please try again`);
  }

  // ── Step 3: register the uploaded file in the database (tiny body) ──
  const regRes = await fetch("/api/images/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objectName,
      fileName,
      mimeType,
      patientId,
      notes,
      capturedAt: capturedAt ?? new Date().toISOString(),
      sha256,
      derivedFromImageId,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!regRes.ok) {
    const body = await regRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Registration failed (HTTP ${regRes.status})`);
  }

  const result = await regRes.json();

  queryClient.invalidateQueries({ queryKey: getListImagesQueryKey() });
  queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(patientId) });

  return result;
}
