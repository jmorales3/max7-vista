import { queryClient } from "@/lib/queryClient";
import { getListImagesQueryKey, getListPatientImagesQueryKey } from "@workspace/api-client-react";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;
const COMPRESS_THRESHOLD = 512 * 1024; // only compress if file > 512 KB

/**
 * Resize + re-encode an image File to JPEG on a canvas.
 * Keeps aspect ratio; caps the longer side at MAX_DIMENSION px.
 * Returns a base64 data-URL and the effective MIME type.
 */
function compressImage(file: File): Promise<{ dataUrl: string; mimeType: string }> {
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
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      resolve({ dataUrl, mimeType: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Failed to load image")); };
    img.src = objectUrl;
  });
}

/**
 * Read a File as a base64 data-URL string (no compression).
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a patient image as JSON+base64 — avoids multipart/form-data which
 * Replit's deployment proxy drops before it reaches the API server.
 * Images larger than 512 KB are compressed/resized client-side before upload
 * so they stay well within the proxy's body-size limits.
 * Invalidates the image list queries after a successful upload.
 */
export async function uploadPatientImage(
  file: File,
  patientId: number,
  notes?: string,
  capturedAt?: string,
) {
  let fileBase64: string;
  let mimeType = file.type || "image/jpeg";

  if (file.size > COMPRESS_THRESHOLD && file.type.startsWith("image/")) {
    const compressed = await compressImage(file);
    fileBase64 = compressed.dataUrl;
    mimeType = compressed.mimeType;
  } else {
    fileBase64 = await fileToBase64(file);
  }

  const response = await fetch("/api/images/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileBase64,
      fileName: file.name || "photo.jpg",
      mimeType,
      patientId,
      notes,
      capturedAt: capturedAt ?? new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Upload failed (HTTP ${response.status})`);
  }

  const result = await response.json();

  queryClient.invalidateQueries({ queryKey: getListImagesQueryKey() });
  queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(patientId) });

  return result;
}
