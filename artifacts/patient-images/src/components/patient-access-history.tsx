import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiUrl } from "@/lib/apiUrl";

interface AccessHistoryEntry {
  id: number;
  action: string;
  username: string | null;
  createdAt: string;
  entityType: string;
  entityId: number | null;
}

interface AccessHistoryResponse {
  items: AccessHistoryEntry[];
}

const ACTION_COLORS: Record<string, string> = {
  patient_view: "bg-sky-100 text-sky-700",
  patient_create: "bg-blue-100 text-blue-800",
  patient_edit: "bg-yellow-100 text-yellow-800",
  patient_delete: "bg-red-100 text-red-800",
  image_view: "bg-slate-100 text-slate-600",
  image_upload: "bg-purple-100 text-purple-800",
  image_edit: "bg-yellow-100 text-yellow-800",
  image_delete: "bg-red-100 text-red-800",
  image_replace: "bg-orange-100 text-orange-800",
  image_export: "bg-indigo-100 text-indigo-800",
  image_print: "bg-pink-100 text-pink-800",
};

async function fetchAccessHistory(patientId: number): Promise<AccessHistoryResponse> {
  const res = await fetch(getApiUrl(`/api/patients/${patientId}/access-history?limit=10`), {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Failed to load access history (${res.status})`);
  }
  return res.json();
}

export function PatientAccessHistory({ patientId }: { patientId: number }) {
  const { t } = useTranslation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["patient-access-history", patientId],
    queryFn: () => fetchAccessHistory(patientId),
  });

  const entries = data?.items ?? [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        {t("accessHistory.title")}
      </h2>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">{t("accessHistory.error")}</p>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <History className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">{t("accessHistory.empty")}</p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                    ACTION_COLORS[entry.action] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {entry.action}
                </span>
                <span className="text-sm truncate">
                  {entry.username ?? t("accessHistory.unknownUser")}
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {format(new Date(entry.createdAt), "MMM d, yyyy · HH:mm")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
