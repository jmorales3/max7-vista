import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  File,
  FileText,
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  FileImage,
  Upload,
  Download,
  Trash2,
  FolderOpen,
} from "lucide-react";
import { format } from "date-fns";
import {
  useListPatientDocuments,
  useUploadDocument,
  useDeleteDocument,
  getListPatientDocumentsQueryKey,
} from "@/lib/documents-client";

interface Props {
  patientId: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function DocIcon({ mimeType }: { mimeType: string }) {
  const cls = "h-5 w-5 shrink-0";
  if (mimeType === "application/pdf")
    return <FileText className={`${cls} text-red-500`} />;
  if (mimeType.includes("word") || mimeType.includes("document"))
    return <FileText className={`${cls} text-blue-500`} />;
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet") || mimeType.includes("csv"))
    return <FileSpreadsheet className={`${cls} text-green-600`} />;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return <FileText className={`${cls} text-orange-500`} />;
  if (mimeType.startsWith("video/"))
    return <FileVideo className={`${cls} text-purple-500`} />;
  if (mimeType.startsWith("audio/"))
    return <FileAudio className={`${cls} text-pink-500`} />;
  if (mimeType.startsWith("image/"))
    return <FileImage className={`${cls} text-sky-500`} />;
  return <File className={`${cls} text-muted-foreground`} />;
}

const ACCEPTED = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "video/*",
  "audio/*",
  "image/*",
].join(",");

export function PatientDocuments({ patientId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: documents = [], isLoading } = useListPatientDocuments(patientId);

  const upload = useUploadDocument({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListPatientDocumentsQueryKey(patientId) });
      toast({ title: "Document uploaded" });
    },
    onError: (e: unknown) => {
      toast({ variant: "destructive", title: "Upload failed", description: e instanceof Error ? e.message : "Unknown error" });
    },
  });

  const deleteDoc = useDeleteDocument({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListPatientDocumentsQueryKey(patientId) });
      toast({ title: "Document deleted" });
      setDeleteId(null);
    },
    onError: () => {
      toast({ variant: "destructive", title: "Delete failed" });
      setDeleteId(null);
    },
  });

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => {
      upload.mutate({ patientId, file });
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  const docToDelete = documents.find((d) => d.id === deleteId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          Documents
          <span className="text-sm font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
            {documents.length}
          </span>
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : documents.length > 0 ? (
        <div className="rounded-xl border divide-y overflow-hidden">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/40 transition-colors">
              <DocIcon mimeType={doc.fileType} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(doc.fileSize)} · {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                  {doc.notes && ` · ${doc.notes}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Download"
                  asChild
                >
                  <a href={`/api/documents/${doc.id}/file`} download={doc.fileName}>
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  title="Delete"
                  onClick={() => setDeleteId(doc.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 bg-card"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <FolderOpen className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">No documents yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Drop files here or click to upload · PDF, Word, Excel, PowerPoint, video, and more
          </p>
        </div>
      )}

      {upload.isPending && (
        <p className="text-sm text-muted-foreground animate-pulse">Uploading…</p>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              "{docToDelete?.fileName}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteDoc.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
