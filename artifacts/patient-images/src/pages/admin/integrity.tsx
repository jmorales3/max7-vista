import { useState, type ReactElement } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ShieldAlert, RefreshCw, Wrench, ScanSearch, CheckCircle2, AlertTriangle, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/apiUrl";

interface IntegrityStatus {
  totalImages: number;
  withHash: number;
  missingHash: number;
}

interface BackfillResult {
  scanned: number;
  updated: number;
  missingFile: number;
  errors: Array<{ imageId: number; fileName: string; error: string }>;
}

interface VerifyMismatch {
  imageId: number;
  fileName: string;
  filePath: string;
  patientId: number | null;
  status: "mismatch" | "missing_file" | "error";
  detail?: string;
}

interface VerifyResult {
  scanned: number;
  ok: number;
  mismatches: VerifyMismatch[];
  missingFiles: VerifyMismatch[];
  errors: VerifyMismatch[];
}

async function fetchStatus(): Promise<IntegrityStatus> {
  const res = await fetch(getApiUrl("/api/admin/integrity/status"), { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load integrity status");
  return res.json();
}

async function runBackfill(): Promise<BackfillResult> {
  const res = await fetch(getApiUrl("/api/admin/integrity/backfill"), {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Backfill failed");
  }
  return res.json();
}

async function runVerify(): Promise<VerifyResult> {
  const res = await fetch(getApiUrl("/api/admin/integrity/verify"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Verify failed");
  }
  return res.json();
}

const STATUS_ICON: Record<VerifyMismatch["status"], ReactElement> = {
  mismatch: <AlertTriangle className="h-4 w-4 text-red-600" />,
  missing_file: <FileWarning className="h-4 w-4 text-amber-600" />,
  error: <AlertTriangle className="h-4 w-4 text-slate-500" />,
};

export default function AdminIntegrity() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);

  const { data: status, isLoading, isError, error: statusError } = useQuery({
    queryKey: ["admin-integrity-status"],
    queryFn: fetchStatus,
  });

  const backfillMutation = useMutation({
    mutationFn: runBackfill,
    onSuccess: (result) => {
      setBackfillResult(result);
      qc.invalidateQueries({ queryKey: ["admin-integrity-status"] });
      toast({
        title: t("adminIntegrity.backfillComplete"),
        description: t("adminIntegrity.backfillSummary", {
          updated: result.updated,
          scanned: result.scanned,
        }),
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: err.message });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: runVerify,
    onSuccess: (result) => {
      setVerifyResult(result);
      const problems = result.mismatches.length + result.missingFiles.length + result.errors.length;
      toast({
        variant: problems > 0 ? "destructive" : "default",
        title: problems > 0 ? t("adminIntegrity.verifyIssuesFound") : t("adminIntegrity.verifyClean"),
        description: t("adminIntegrity.verifySummary", { ok: result.ok, scanned: result.scanned }),
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: err.message });
    },
  });

  const problemRows = verifyResult
    ? [...verifyResult.mismatches, ...verifyResult.missingFiles, ...verifyResult.errors]
    : [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">{t("adminIntegrity.title")}</h1>
      </div>
      <p className="text-muted-foreground text-sm">{t("adminIntegrity.description")}</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("adminIntegrity.statusTitle")}</CardTitle>
          <CardDescription>{t("adminIntegrity.statusDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : isError || !status ? (
            <p className="text-sm text-destructive">
              {statusError instanceof Error ? statusError.message : t("adminIntegrity.statusLoadError")}
            </p>
          ) : (
            <>
              <div>
                <p className="text-2xl font-semibold">{status.totalImages}</p>
                <p className="text-xs text-muted-foreground">{t("adminIntegrity.totalImages")}</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-green-600">{status.withHash}</p>
                <p className="text-xs text-muted-foreground">{t("adminIntegrity.withHash")}</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-amber-600">{status.missingHash}</p>
                <p className="text-xs text-muted-foreground">{t("adminIntegrity.missingHash")}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" /> {t("adminIntegrity.backfillTitle")}
            </CardTitle>
            <CardDescription>{t("adminIntegrity.backfillDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending}>
              {backfillMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wrench className="h-4 w-4 mr-2" />
              )}
              {t("adminIntegrity.runBackfill")}
            </Button>
            {backfillMutation.isPending && (
              <p className="text-xs text-muted-foreground">{t("adminIntegrity.workingHint")}</p>
            )}
            {backfillResult && (
              <div className="text-sm space-y-1 border-t pt-3">
                <p>{t("adminIntegrity.scanned")}: {backfillResult.scanned}</p>
                <p className="text-green-600">{t("adminIntegrity.updated")}: {backfillResult.updated}</p>
                {backfillResult.missingFile > 0 && (
                  <p className="text-amber-600">{t("adminIntegrity.missingFile")}: {backfillResult.missingFile}</p>
                )}
                {backfillResult.errors.length > 0 && (
                  <p className="text-red-600">{t("adminIntegrity.errors")}: {backfillResult.errors.length}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ScanSearch className="h-4 w-4" /> {t("adminIntegrity.verifyTitle")}
            </CardTitle>
            <CardDescription>{t("adminIntegrity.verifyDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="secondary"
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
            >
              {verifyMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ScanSearch className="h-4 w-4 mr-2" />
              )}
              {t("adminIntegrity.runVerify")}
            </Button>
            {verifyMutation.isPending && (
              <p className="text-xs text-muted-foreground">{t("adminIntegrity.workingHint")}</p>
            )}
            {verifyResult && (
              <div className="text-sm space-y-1 border-t pt-3">
                <p>{t("adminIntegrity.scanned")}: {verifyResult.scanned}</p>
                <p className="text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {t("adminIntegrity.ok")}: {verifyResult.ok}
                </p>
                {verifyResult.mismatches.length > 0 && (
                  <p className="text-red-600">{t("adminIntegrity.mismatches")}: {verifyResult.mismatches.length}</p>
                )}
                {verifyResult.missingFiles.length > 0 && (
                  <p className="text-amber-600">{t("adminIntegrity.missingFile")}: {verifyResult.missingFiles.length}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {problemRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("adminIntegrity.issuesTitle")}</CardTitle>
            <CardDescription>{t("adminIntegrity.issuesDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("adminIntegrity.status")}</TableHead>
                  <TableHead>{t("adminIntegrity.fileName")}</TableHead>
                  <TableHead>{t("adminIntegrity.patientId")}</TableHead>
                  <TableHead>{t("adminIntegrity.detail")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problemRows.map((row) => (
                  <TableRow key={row.imageId}>
                    <TableCell>
                      <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        {STATUS_ICON[row.status]}
                        {t(`adminIntegrity.statusValue.${row.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.fileName}</TableCell>
                    <TableCell>{row.patientId ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {row.detail ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
