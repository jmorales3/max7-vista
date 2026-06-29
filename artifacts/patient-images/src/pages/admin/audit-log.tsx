import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ClipboardList, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiUrl } from "@/lib/apiUrl";

interface AuditLogEntry {
  id: number;
  tenantId: number | null;
  userId: number | null;
  username: string | null;
  patientId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  totalPages: number;
}

const ACTION_COLORS: Record<string, string> = {
  login: "bg-green-100 text-green-800",
  logout: "bg-slate-100 text-slate-700",
  login_failed: "bg-red-100 text-red-800",
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
  library_upload: "bg-purple-100 text-purple-800",
  library_delete: "bg-red-100 text-red-800",
  bulk_import: "bg-teal-100 text-teal-800",
  migration_export: "bg-indigo-100 text-indigo-800",
  migration_import: "bg-teal-100 text-teal-800",
};

interface Filters {
  action: string;
  username: string;
  patient: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = {
  action: "",
  username: "",
  patient: "",
  dateFrom: "",
  dateTo: "",
};

async function fetchAuditLog(params: {
  page: number;
} & Filters): Promise<AuditLogResponse> {
  const q = new URLSearchParams({ page: String(params.page), limit: "50" });
  if (params.action) q.set("action", params.action);
  if (params.username) q.set("username", params.username);
  if (params.patient) q.set("patient", params.patient);
  if (params.dateFrom) q.set("from", params.dateFrom);
  if (params.dateTo) q.set("to", params.dateTo);

  const res = await fetch(getApiUrl(`/api/audit-logs?${q}`), { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch audit log");
  return res.json();
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs", page, applied],
    queryFn: () => fetchAuditLog({ page, ...applied }),
  });

  function applyFilters() {
    setPage(1);
    setApplied({ ...draft });
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setPage(1);
    setApplied(EMPTY_FILTERS);
  }

  const hasFilters = Object.values(draft).some(Boolean);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <ClipboardList className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            {t("auditLog.title")}
          </h1>
          <p className="text-muted-foreground">{t("auditLog.subtitle")}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("auditLog.filterAction")}</Label>
            <select
              className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            >
              <option value="">{t("auditLog.allActions")}</option>
              <optgroup label="Auth">
                <option value="login">login</option>
                <option value="logout">logout</option>
                <option value="login_failed">login_failed</option>
              </optgroup>
              <optgroup label="Patient">
                <option value="patient_view">patient_view</option>
                <option value="patient_create">patient_create</option>
                <option value="patient_edit">patient_edit</option>
                <option value="patient_delete">patient_delete</option>
              </optgroup>
              <optgroup label="Image">
                <option value="image_view">image_view</option>
                <option value="image_upload">image_upload</option>
                <option value="image_edit">image_edit</option>
                <option value="image_delete">image_delete</option>
                <option value="image_replace">image_replace</option>
                <option value="image_export">image_export</option>
                <option value="image_print">image_print</option>
              </optgroup>
              <optgroup label="Library">
                <option value="library_upload">library_upload</option>
                <option value="library_delete">library_delete</option>
              </optgroup>
              <optgroup label="System">
                <option value="bulk_import">bulk_import</option>
                <option value="migration_export">migration_export</option>
                <option value="migration_import">migration_import</option>
              </optgroup>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("auditLog.filterUser")}</Label>
            <Input
              placeholder={t("auditLog.filterUser")}
              value={draft.username}
              onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("auditLog.filterPatient")}</Label>
            <Input
              placeholder={t("auditLog.filterPatient")}
              value={draft.patient}
              onChange={(e) => setDraft((d) => ({ ...d, patient: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("auditLog.filterDateFrom")}</Label>
            <Input
              type="date"
              value={draft.dateFrom}
              onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("auditLog.filterDateTo")}</Label>
            <Input
              type="date"
              value={draft.dateTo}
              onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1 flex flex-col justify-end">
            <div className="flex gap-2">
              <Button size="sm" onClick={applyFilters} className="flex-1">
                {t("common.apply")}
              </Button>
              {hasFilters && (
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">{t("auditLog.loading")}</div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">{t("common.error")}</div>
        ) : !data?.items.length ? (
          <div className="p-8 text-center text-muted-foreground">{t("auditLog.noLogs")}</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">{t("auditLog.colTimestamp")}</TableHead>
                  <TableHead className="w-28">{t("auditLog.colUser")}</TableHead>
                  <TableHead className="w-36">{t("auditLog.colAction")}</TableHead>
                  <TableHead className="w-32">{t("auditLog.colResource")}</TableHead>
                  <TableHead>{t("auditLog.colDetails")}</TableHead>
                  <TableHead className="w-32">{t("auditLog.colIP")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {entry.username ?? <span className="text-muted-foreground italic">—</span>}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          ACTION_COLORS[entry.action] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {entry.action}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.entityType}
                      {entry.entityId != null && (
                        <span className="ml-1 text-foreground/50">#{entry.entityId}</span>
                      )}
                      {entry.patientId != null && entry.entityType !== "patient" && (
                        <div className="text-foreground/40">pt#{entry.patientId}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {entry.details != null ? JSON.stringify(entry.details) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {entry.ipAddress ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {data.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                <span>
                  {t("auditLog.pageOf", { page: data.page, total: data.totalPages })}
                  {" · "}
                  {data.total} {t("auditLog.totalEntries")}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={data.page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    {t("auditLog.prevPage")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={data.page >= data.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("auditLog.nextPage")}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
