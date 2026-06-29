import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  UseMutationOptions,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";

export interface PatientDocument {
  id: number;
  patientId: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  notes: string | null;
  uploadedAt: string;
  createdAt: string;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Query key ────────────────────────────────────────────────────────────────

export function getListPatientDocumentsQueryKey(patientId: number) {
  return [`/api/documents`, { patientId }] as const;
}

// ── List documents for a patient ─────────────────────────────────────────────

export function useListPatientDocuments(
  patientId: number,
  options?: { query?: UseQueryOptions<PatientDocument[], Error, PatientDocument[]> },
): UseQueryResult<PatientDocument[], Error> {
  return useQuery<PatientDocument[], Error>({
    queryKey: getListPatientDocumentsQueryKey(patientId),
    queryFn: () => apiFetch<PatientDocument[]>(`/api/documents?patientId=${patientId}`),
    enabled: !!patientId,
    ...options?.query,
  });
}

// ── Upload a document ─────────────────────────────────────────────────────────

interface UploadDocumentArgs {
  patientId: number;
  file: File;
  notes?: string;
}

export function useUploadDocument(
  options?: Omit<UseMutationOptions<PatientDocument, Error, UploadDocumentArgs>, "mutationFn">,
) {
  return useMutation<PatientDocument, Error, UploadDocumentArgs>({
    mutationFn: ({ patientId, file, notes }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("patientId", String(patientId));
      if (notes) form.append("notes", notes);
      return apiFetch<PatientDocument>("/api/documents", { method: "POST", body: form });
    },
    ...options,
  });
}

// ── Delete a document ─────────────────────────────────────────────────────────

export function useDeleteDocument(
  options?: Omit<UseMutationOptions<void, Error, number>, "mutationFn">,
) {
  return useMutation<void, Error, number>({
    mutationFn: (id) => apiFetch<void>(`/api/documents/${id}`, { method: "DELETE" }),
    ...options,
  });
}
