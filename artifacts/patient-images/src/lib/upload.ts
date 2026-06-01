import { uploadImage } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { getListImagesQueryKey, getListPatientImagesQueryKey } from "@workspace/api-client-react";

/**
 * Upload a patient image using the generated API client (multipart/form-data).
 * Invalidates the image list queries after a successful upload.
 */
export async function uploadPatientImage(
  file: File,
  patientId: number,
  notes?: string,
  capturedAt?: string,
) {
  const result = await uploadImage(
    {
      file,
      patientId,
      notes,
      capturedAt: capturedAt ?? new Date().toISOString(),
    },
    { signal: AbortSignal.timeout(30_000) },
  );

  queryClient.invalidateQueries({ queryKey: getListImagesQueryKey() });
  queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(patientId) });

  return result;
}
