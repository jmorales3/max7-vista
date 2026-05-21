import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/lib/apiUrl";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, FileArchive, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

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
      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
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

export default function BulkImport() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const canSubmit = !!archiveFile && !!csvFile && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!archiveFile || !csvFile) return;

    setLoading(true);
    setSummary(null);
    setImportError(null);

    const formData = new FormData();
    formData.append("archive", archiveFile);
    formData.append("patients", csvFile);

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
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Bulk Import</h1>
        <p className="text-muted-foreground mt-1">
          Import an existing image archive into the system in one step.
        </p>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            <strong className="text-foreground">1. ZIP archive</strong> — Pack your image folder into
            a ZIP file. The top-level subfolders must be named with the patient ID (e.g.{" "}
            <code className="bg-muted px-1 rounded text-xs">P001/photo1.jpg</code>). Images nested
            deeper than one level are ignored.
          </p>
          <p>
            <strong className="text-foreground">2. Patient CSV</strong> — A spreadsheet with at
            least an <code className="bg-muted px-1 rounded text-xs">id</code> column matching the
            folder names. Optional columns:{" "}
            <code className="bg-muted px-1 rounded text-xs">name</code>,{" "}
            <code className="bg-muted px-1 rounded text-xs">dateOfBirth</code>.
          </p>
          <p>
            <strong className="text-foreground">3. Dates &amp; legends</strong> — Capture dates are
            read from the image's EXIF metadata (DateTimeOriginal). If unavailable, the file's
            modification date inside the ZIP is used. The image filename (without extension) becomes
            the legend/notes field.
          </p>
          <p>
            <strong className="text-foreground">4. Deduplication</strong> — Patients already in the
            system (matched by patient ID) are reused; no duplicates are created.
          </p>
        </CardContent>
      </Card>

      {/* Upload form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select files</CardTitle>
            <CardDescription>Both files are required to run the import.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ZIP archive</Label>
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
                <Label>Patient CSV</Label>
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
              <Button type="submit" disabled={!canSubmit} size="lg">
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

      {/* Error banner */}
      {importError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      {summary && (
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
                          <TableCell className="text-xs text-muted-foreground">{err.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
