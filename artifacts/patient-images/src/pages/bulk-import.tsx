import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/lib/apiUrl";
import { useToast } from "@/hooks/use-toast";
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
  errors: Array<{ file: string; reason: string }>;
}

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
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        {file ? "Change file" : "Select file"}
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          Import complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-lg bg-muted p-4">
            <p className="text-3xl font-bold text-primary">{summary.imagesImported}</p>
            <p className="text-xs text-muted-foreground mt-1">Images imported</p>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-3xl font-bold">{summary.patientsCreated}</p>
            <p className="text-xs text-muted-foreground mt-1">Patients created</p>
          </div>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-3xl font-bold">{summary.patientsMatched}</p>
            <p className="text-xs text-muted-foreground mt-1">Patients matched</p>
          </div>
        </div>

        {summary.errors.length > 0 && (
          <div>
            <p className="text-sm font-medium text-destructive mb-2">
              {summary.errors.length} file{summary.errors.length !== 1 ? "s" : ""} could not be
              imported:
            </p>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Reason</TableHead>
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
  const { toast } = useToast();
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!archiveFile) return;

    setLoading(true);
    setSummary(null);
    setImportError(null);

    const formData = new FormData();
    formData.append("archive", archiveFile);
    if (csvFile) formData.append("patients", csvFile);

    try {
      const res = await fetch(getApiUrl("/api/import/bulk"), {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const result: ImportSummary = await res.json();
      setSummary(result);

      if (result.errors.length === 0) {
        toast({
          title: "Import complete",
          description: `${result.imagesImported} image${result.imagesImported !== 1 ? "s" : ""} imported successfully.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Import finished with errors",
          description: `${result.imagesImported} imported, ${result.errors.length} failed.`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setImportError(msg);
      toast({ variant: "destructive", title: "Import failed", description: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            <strong className="text-foreground">1. ZIP archive</strong> — Pack your image folder
            into a ZIP. The top-level subfolders must be named with the patient ID (e.g.{" "}
            <code className="bg-muted px-1 rounded text-xs">2116/photo1.jpg</code>). A single root
            wrapper folder is detected and skipped automatically (e.g.{" "}
            <code className="bg-muted px-1 rounded text-xs">foto/2116/photo1.jpg</code> works too).
          </p>
          <p>
            <strong className="text-foreground">2. Patient CSV (optional)</strong> — A spreadsheet
            with at least an <code className="bg-muted px-1 rounded text-xs">id</code> column
            matching the folder names. Optional columns:{" "}
            <code className="bg-muted px-1 rounded text-xs">name</code>,{" "}
            <code className="bg-muted px-1 rounded text-xs">dateOfBirth</code>. Without a CSV,
            patients are created using the folder name as both ID and name.
          </p>
          <p>
            <strong className="text-foreground">3. Dates &amp; legends</strong> — Capture dates are
            read from EXIF metadata (DateTimeOriginal), falling back to the ZIP modification
            timestamp. The filename (without extension) becomes the image legend.
          </p>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select files</CardTitle>
            <CardDescription>ZIP archive is required; CSV is optional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ZIP archive *</Label>
                <FileInputCard
                  id="archive-input"
                  icon={FileArchive}
                  label="Image archive (.zip)"
                  hint="Root → Patient ID folder → image files"
                  accept=".zip,application/zip"
                  file={archiveFile}
                  onChange={setArchiveFile}
                />
              </div>
              <div className="space-y-2">
                <Label>Patient CSV (optional)</Label>
                <FileInputCard
                  id="csv-input"
                  icon={FileSpreadsheet}
                  label="Patient list (.csv)"
                  hint="Columns: id, name, dateOfBirth"
                  accept=".csv,text/csv"
                  file={csvFile}
                  onChange={setCsvFile}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={!archiveFile || loading} size="lg">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Start import
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
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      )}

      {summary && <ImportSummaryCard summary={summary} />}
    </div>
  );
}

// ─── Server folder tab ────────────────────────────────────────────────────────

function FolderImportTab() {
  const { toast } = useToast();
  const [folderPath, setFolderPath] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!folderPath.trim()) return;

    setLoading(true);
    setSummary(null);
    setImportError(null);

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

      const result: ImportSummary = await res.json();
      setSummary(result);

      if (result.errors.length === 0) {
        toast({
          title: "Import complete",
          description: `${result.imagesImported} image${result.imagesImported !== 1 ? "s" : ""} imported successfully.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Import finished with errors",
          description: `${result.imagesImported} imported, ${result.errors.length} failed.`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setImportError(msg);
      toast({ variant: "destructive", title: "Import failed", description: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            <strong className="text-foreground">No ZIP needed</strong> — Enter the full path to a
            folder that already exists on the server. The server reads the images directly from
            disk without any upload.
          </p>
          <p>
            <strong className="text-foreground">Folder structure</strong> — The immediate
            subfolders of the path you enter must be named with the patient ID (e.g.{" "}
            <code className="bg-muted px-1 rounded text-xs">/data/photos/2116/</code>). A single
            root wrapper folder is detected and skipped automatically (e.g.{" "}
            <code className="bg-muted px-1 rounded text-xs">/data/photos/foto/2116/</code> also
            works).
          </p>
          <p>
            <strong className="text-foreground">Patient CSV (optional)</strong> — Provide a CSV
            with <code className="bg-muted px-1 rounded text-xs">id</code>,{" "}
            <code className="bg-muted px-1 rounded text-xs">name</code>, and optionally{" "}
            <code className="bg-muted px-1 rounded text-xs">dateOfBirth</code> columns to populate
            patient records. Without a CSV, patients are created using the folder name as both ID
            and name.
          </p>
          <p>
            <strong className="text-foreground">Originals are preserved</strong> — Images are
            copied into the Max7 Vista storage directory. Your source folder is never modified.
          </p>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configure import</CardTitle>
            <CardDescription>
              Enter the server folder path. The CSV is optional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="folder-path">
                Server folder path <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <FolderOpen className="h-5 w-5 text-muted-foreground mt-2.5 shrink-0" />
                <Input
                  id="folder-path"
                  placeholder="/data/photos  or  C:\Images\Patients"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  className="font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This path must be accessible by the Max7 Vista server process.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Patient CSV (optional)</Label>
              <FileInputCard
                id="folder-csv-input"
                icon={FileSpreadsheet}
                label="Patient list (.csv)"
                hint="Columns: id, name, dateOfBirth"
                accept=".csv,text/csv"
                file={csvFile}
                onChange={setCsvFile}
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={!folderPath.trim() || loading} size="lg">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Start import
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
          <AlertTitle>Import failed</AlertTitle>
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
          {t("bulkImport.title", "Bulk Import")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("bulkImport.subtitle", "Import an existing image archive into the system in one step.")}
        </p>
      </div>

      <Tabs defaultValue="zip">
        <TabsList className="w-full">
          <TabsTrigger value="zip" className="flex-1 gap-2">
            <FileArchive className="h-4 w-4" />
            {t("bulkImport.tabZip", "Upload ZIP")}
          </TabsTrigger>
          <TabsTrigger value="folder" className="flex-1 gap-2">
            <FolderOpen className="h-4 w-4" />
            {t("bulkImport.tabFolder", "Server Folder")}
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
