import { queryClient } from "@/lib/queryClient";
import { getListImagesQueryKey, getListPatientImagesQueryKey } from "@workspace/api-client-react";

/**
 * Read a File as a base64 data-URL string.
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
 * Invalidates the image list queries after a successful upload.
 */
export async function uploadPatientImage(
  file: File,
  patientId: number,
  notes?: string,
  capturedAt?: string,
) {
  const fileBase64 = await fileToBase64(file);

  const response = await fetch("/api/images/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileBase64,
      fileName: file.name || "photo.jpg",
      mimeType: file.type || "image/jpeg",
      patientId,
      notes,
      capturedAt: capturedAt ?? new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(60_000),
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
