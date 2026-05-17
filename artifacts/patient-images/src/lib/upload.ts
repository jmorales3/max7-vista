import { queryClient } from "@/lib/queryClient";
import { getListImagesQueryKey, getListPatientImagesQueryKey } from "@workspace/api-client-react";

export async function uploadPatientImage(file: File, patientId: number, notes?: string, capturedAt?: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("patientId", patientId.toString());
  
  if (notes) {
    formData.append("notes", notes);
  }
  
  if (capturedAt) {
    formData.append("capturedAt", capturedAt);
  } else {
    formData.append("capturedAt", new Date().toISOString());
  }

  const response = await fetch("/api/images", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || "Failed to upload image");
  }

  const result = await response.json();
  
  // Invalidate queries to refresh lists
  queryClient.invalidateQueries({ queryKey: getListImagesQueryKey() });
  queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(patientId) });

  return result;
}
