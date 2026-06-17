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
import { Badge } from "@/components/ui/badge";
import { getApiUrl } from "@/lib/apiUrl";

interface AuditLogEntry {
  id: number;
  tenantId: number | null;
  userId: number | null;
  username: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  ipAddress: string | null;
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
  create: "bg-blue-100 text-blue-800",
  edit: "bg-yellow-100 text-yellow-800",
  delete: "bg-red-100 text-red-800",
  upload: "bg-purple-100 text-purple-800",
  view: "bg-slate-100 text-slate-600",
  replace_file: "bg-orange-100 text-orange-800",
  export: "bg-indigo-100 text-indigo-800",
};

async function fetchAuditLog(params: {
  page: number;
  action: string;
  username: string;
  dateFrom: string;
  dateTo: string;
}): Promise<AuditLogResponse> {
  const q = new URLSearchParams({ page: String(params.page), limit: "50" });
  if (params.action) q.set("action", params.action);
  if (params.username) q.set("username", params.username);
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);

  const res = await fetch(getApiUrl(`/api/audit-log?${q}`), { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch audit log");
  return res.json();
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [usernameFilter, setUsernameFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [appliedFilters, setAppliedFilters] = useState({
    action: "",
    username: "",
    dateFrom: "",
    dateTo: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-log", page, appliedFilters],
    queryFn: () => fetchAuditLog({ page, ...appliedFilters }),
  });

  function applyFilters() {
    setPage(1);
    setAppliedFilters({ action: actionFilter, username: usernameFilter, dateFrom, dateTo });
  }

  function clearFilters() {
    setActionFilter("");
    setUsernameFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    setAppliedFilters({ action: "", username: "", dateFrom: "", dateTo: "" });
  }

  const hasFilters = actionFilter || usernameFilter || dateFrom || dateTo;

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("auditLog.filterAction")}</Label>
            <Input
              placeholder={t("auditLog.allActions")}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("auditLog.filterUser")}</Label>
            <Input
              placeholder={t("auditLog.filterUser")}
              value={usernameFilter}
              onChange={(e) => setUsernameFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("auditLog.filterDateFrom")}</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("auditLog.filterDateTo")}</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={applyFilters}>
            {t("common.apply")}
          </Button>
          {hasFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" />
              {t("auditLog.clearFilters")}
            </Button>
          )}
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
                  <TableHead className="w-32">{t("auditLog.colUser")}</TableHead>
                  <TableHead className="w-32">{t("auditLog.colAction")}</TableHead>
                  <TableHead className="w-36">{t("auditLog.colResource")}</TableHead>
                  <TableHead>{t("auditLog.colDetails")}</TableHead>
                  <TableHead className="w-36">{t("auditLog.colIP")}</TableHead>
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
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {entry.details ?? "—"}
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
