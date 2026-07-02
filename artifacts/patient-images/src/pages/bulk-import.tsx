import { useState, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { getApiUrl } from "@/lib/apiUrl";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  getListPatientsQueryKey,
  getListImagesQueryKey,
  getGetImageStatsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Upload,
  FileArchive,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderOpen,
} from "lucide-react";

interface ImportSummary {
  patientsCreated: number;
  patientsMatched: number;
  imagesImported: number;
  duplicatesSkipped?: number;
  errors: Array<{ file: string; reason: string }>;
}

interface ImportProgress {
  current: number;
  total: number;
  fileName?: string;
}

// Reads a fetch Response body as newline-delimited JSON, invoking onEvent for
// each parsed line as it streams in. Falls back to a single JSON.parse of the
// full body when the response isn't chunked (e.g. old-style non-streaming error).
async function consumeNdjsonStream(
  res: Response,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) {
    const body = await res.json().catch(() => null);
    if (body) onEvent(body as Record<string, unknown>);
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onEvent(JSON.parse(trimmed));
      } catch {
        // ignore malformed line
      }
    }
  }
  const trimmed = buffer.trim();
  if (trimmed) {
    try {
      onEvent(JSON.parse(trimmed));
    } catch {
      // ignore malformed trailing line
    }
  }
}

function ImportProgressBar({ progress, label }: { progress: ImportProgress; label: string }) {
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress.fileName && (
        <p className="text-xs text-muted-foreground truncate font-mono">{progress.fileName}</p>
      )}
    </div>
  );
}

const inlineCode = <code className="bg-muted px-1 rounded text-xs" />;

function FileInputCard({
  id,
  icon: Icon,
  label,
  hint,
  accept,
  file,
  onChange,
}: {
  id: string;
  icon: React.ElementType;
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className="border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors text-center"
      onClick={() => inputRef.current?.click()}
    >
      <Icon className={`h-10 w-10 ${file ? "text-primary" : "text-muted-foreground"}`} />
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      {file && (
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-mono truncate max-w-[220px]">
          {file.name}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        {file ? t("bulkImport.changeFile") : t("bulkImport.selectFile")}
      </Button>
      <Input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function ImportSummaryCard({ summary }: { summary: ImportSummary }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          {t("bulkImport.summaryTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`grid gap-4 text-center ${summary.duplicatesSkipped ? "grid-cols-4" : "grid-cols-3"}`}>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-3xl font-bold text-primary">{summary.imagesImported}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("bulkImport.statImagesImported")}</p>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-3xl font-bold">{summary.patientsCreated}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("bulkImport.statPatientsCreated")}</p>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-3xl font-bold">{summary.patientsMatched}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("bulkImport.statPatientsMatched")}</p>
          </div>
          {!!summary.duplicatesSkipped && (
            <div className="rounded-lg bg-muted p-4">
              <p className="text-3xl font-bold text-amber-500">{summary.duplicatesSkipped}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("bulkImport.statDuplicatesSkipped")}</p>
            </div>
          )}
        </div>

        {summary.errors.length > 0 && (
          <div>
            <p className="text-sm font-medium text-destructive mb-2">
              {t("bulkImport.errorsCount", { count: summary.errors.length })}
            </p>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("bulkImport.colFile")}</TableHead>
                    <TableHead>{t("bulkImport.colReason")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.errors.map((err, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{err.file}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {err.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ZIP tab ──────────────────────────────────────────────────────────────────

function ZipImportTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!archiveFile) return;

    setLoading(true);
    setSummary(null);
    setImportError(null);
    setProgress(null);

    try {
      // Step 1 — get a signed GCS URL (bypasses Replit proxy size limit)
      const urlRes = await fetch(getApiUrl("/api/import/bulk-upload-url"), {
        method: "POST",
        credentials: "include",
      });
      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${urlRes.status}`);
      }
      const { signedUrl, objectName } = await urlRes.json() as { signedUrl: string; objectName: string };

      // Step 2 — PUT the ZIP directly to GCS (no proxy)
      const putRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/zip" },
        body: archiveFile,
      });
      if (!putRes.ok) throw new Error(`ZIP upload failed: HTTP ${putRes.status}`);

      // Step 3 — tell the server to process the ZIP from GCS, streaming live progress
      const csvContent = csvFile ? await csvFile.text() : undefined;
      const res = await fetch(getApiUrl("/api/import/bulk-from-gcs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ objectName, csvContent }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const outcome: { result: ImportSummary | null; streamError: string | null } = {
        result: null,
        streamError: null,
      };
      await consumeNdjsonStream(res, (event) => {
        if (event.type === "start") {
          setProgress({ current: 0, total: event.total as number });
        } else if (event.type === "progress") {
          setProgress({ current: event.current as number, total: event.total as number, fileName: event.fileName as string | undefined });
        } else if (event.type === "done") {
          outcome.result = event.summary as ImportSummary;
        } else if (event.type === "error") {
          outcome.streamError = event.error as string;
        }
      });

      if (outcome.streamError) throw new Error(outcome.streamError);
      if (!outcome.result) throw new Error(t("bulkImport.unknownError"));
      const result = outcome.result;
      setSummary(result);

      void queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListImagesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetImageStatsQueryKey() });

      if (result.errors.length === 0) {
        toast({
          title: t("bulkImport.toastComplete"),
          description: t("bulkImport.toastCompleteDesc", { count: result.imagesImported }),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("bulkImport.toastErrors"),
          description: t("bulkImport.toastErrorsDesc", {
            imported: result.imagesImported,
            failed: result.errors.length,
          }),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("bulkImport.unknownError");
      setImportError(msg);
      toast({ variant: "destructive", title: t("bulkImport.toastFailed"), description: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("bulkImport.howItWorks")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            <strong className="text-foreground">{t("bulkImport.zipStep1Title")}</strong>
            {" — "}
            <Trans i18nKey="bulkImport.zipStep1Body" components={{ code: inlineCode }} />
          </p>
          <p>
            <strong className="text-foreground">{t("bulkImport.zipStep2Title")}</strong>
            {" — "}
            <Trans i18nKey="bulkImport.zipStep2Body" components={{ code: inlineCode }} />
          </p>
          <p>
            <strong className="text-foreground">{t("bulkImport.zipStep3Title")}</strong>
            {" — "}
            <Trans i18nKey="bulkImport.zipStep3Body" components={{ code: inlineCode }} />
          </p>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("bulkImport.selectFilesTitle")}</CardTitle>
            <CardDescription>{t("bulkImport.selectFilesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("bulkImport.labelZip")}</Label>
                <FileInputCard
                  id="archive-input"
                  icon={FileArchive}
                  label={t("bulkImport.labelZipInput")}
                  hint={t("bulkImport.hintZipInput")}
                  accept=".zip,application/zip"
                  file={archiveFile}
                  onChange={setArchiveFile}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("bulkImport.labelCsv")}</Label>
                <FileInputCard
                  id="csv-input"
                  icon={FileSpreadsheet}
                  label={t("bulkImport.labelCsvInput")}
                  hint={t("bulkImport.hintCsvInput")}
                  accept=".csv,text/csv"
                  file={csvFile}
                  onChange={setCsvFile}
                />
              </div>
            </div>

            {loading && progress && (
              <ImportProgressBar
                progress={progress}
                label={t("bulkImport.progressLabel", { current: progress.current, total: progress.total })}
              />
            )}

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={!archiveFile || loading} size="lg">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("bulkImport.importing")}
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {t("bulkImport.startImport")}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {importError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("bulkImport.importFailedTitle")}</AlertTitle>
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      )}

      {summary && <ImportSummaryCard summary={summary} />}
    </div>
  );
}

// ─── Server folder tab ────────────────────────────────────────────────────────

function FolderImportTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [folderPath, setFolderPath] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!folderPath.trim()) return;

    setLoading(true);
    setSummary(null);
    setImportError(null);
    setProgress(null);

    const formData = new FormData();
    formData.append("folderPath", folderPath.trim());
    if (csvFile) formData.append("patients", csvFile);

    try {
      const res = await fetch(getApiUrl("/api/import/folder"), {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const outcome: { result: ImportSummary | null; streamError: string | null } = {
        result: null,
        streamError: null,
      };
      await consumeNdjsonStream(res, (event) => {
        if (event.type === "start") {
          setProgress({ current: 0, total: event.total as number });
        } else if (event.type === "progress") {
          setProgress({ current: event.current as number, total: event.total as number, fileName: event.fileName as string | undefined });
        } else if (event.type === "done") {
          outcome.result = event.summary as ImportSummary;
        } else if (event.type === "error") {
          outcome.streamError = event.error as string;
        } else if (!("type" in event)) {
          // Non-streamed early-return responses (e.g. "no images found") are plain JSON summaries.
          outcome.result = event as unknown as ImportSummary;
        }
      });

      if (outcome.streamError) throw new Error(outcome.streamError);
      if (!outcome.result) throw new Error(t("bulkImport.unknownError"));
      const result = outcome.result;
      setSummary(result);

      void queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListImagesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetImageStatsQueryKey() });

      if (result.errors.length === 0) {
        toast({
          title: t("bulkImport.toastComplete"),
          description: t("bulkImport.toastCompleteDesc", { count: result.imagesImported }),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("bulkImport.toastErrors"),
          description: t("bulkImport.toastErrorsDesc", {
            imported: result.imagesImported,
            failed: result.errors.length,
          }),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("bulkImport.unknownError");
      setImportError(msg);
      toast({ variant: "destructive", title: t("bulkImport.toastFailed"), description: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("bulkImport.howItWorks")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            <strong className="text-foreground">{t("bulkImport.folderNoZipTitle")}</strong>
            {" — "}
            {t("bulkImport.folderNoZipBody")}
          </p>
          <p>
            <strong className="text-foreground">{t("bulkImport.folderStructureTitle")}</strong>
            {" — "}
            <Trans i18nKey="bulkImport.folderStructureBody" components={{ code: inlineCode }} />
          </p>
          <p>
            <strong className="text-foreground">{t("bulkImport.folderCsvTitle")}</strong>
            {" — "}
            <Trans i18nKey="bulkImport.folderCsvBody" components={{ code: inlineCode }} />
          </p>
          <p>
            <strong className="text-foreground">{t("bulkImport.folderOriginalsTitle")}</strong>
            {" — "}
            {t("bulkImport.folderOriginalsBody")}
          </p>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("bulkImport.configureTitle")}</CardTitle>
            <CardDescription>{t("bulkImport.configureDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="folder-path">
                {t("bulkImport.folderPathLabel")} <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <FolderOpen className="h-5 w-5 text-muted-foreground mt-2.5 shrink-0" />
                <Input
                  id="folder-path"
                  placeholder={t("bulkImport.folderPathPlaceholder")}
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  className="font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("bulkImport.folderPathHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t("bulkImport.labelCsv")}</Label>
              <FileInputCard
                id="folder-csv-input"
                icon={FileSpreadsheet}
                label={t("bulkImport.labelCsvInput")}
                hint={t("bulkImport.hintCsvInput")}
                accept=".csv,text/csv"
                file={csvFile}
                onChange={setCsvFile}
              />
            </div>

            {loading && progress && (
              <ImportProgressBar
                progress={progress}
                label={t("bulkImport.progressLabel", { current: progress.current, total: progress.total })}
              />
            )}

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={!folderPath.trim() || loading} size="lg">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("bulkImport.importing")}
                  </>
                ) : (
                  <>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    {t("bulkImport.startImport")}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {importError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("bulkImport.importFailedTitle")}</AlertTitle>
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      )}

      {summary && <ImportSummaryCard summary={summary} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BulkImport() {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          {t("bulkImport.title")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("bulkImport.subtitle")}
        </p>
      </div>

      <Tabs defaultValue="zip">
        <TabsList className="w-full">
          <TabsTrigger value="zip" className="flex-1 gap-2">
            <FileArchive className="h-4 w-4" />
            {t("bulkImport.tabZip")}
          </TabsTrigger>
          <TabsTrigger value="folder" className="flex-1 gap-2">
            <FolderOpen className="h-4 w-4" />
            {t("bulkImport.tabFolder")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="zip" className="mt-6">
          <ZipImportTab />
        </TabsContent>

        <TabsContent value="folder" className="mt-6">
          <FolderImportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
