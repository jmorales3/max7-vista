import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import Webcam from "react-webcam";
import { useListPatients, getListPatientsQueryKey } from "@workspace/api-client-react";
import { uploadPatientImage } from "@/lib/upload";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Upload, X, Check, Loader2, Plus, Images, FileText } from "lucide-react";

interface QueuedFile {
  id: string;
  file: File | null;
  previewUrl: string;
  source: "camera" | "upload";
  notes: string;
}

export default function Capture() {
  const { t } = useTranslation();
  const [searchParams] = useState(new URLSearchParams(window.location.search));
  const initialPatientId = searchParams.get("patientId");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [patientId, setPatientId] = useState<string>(initialPatientId || "");
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [seriesNotes, setSeriesNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  const webcamRef = useRef<Webcam>(null);

  const { data: patients, isLoading: loadingPatients } = useListPatients({}, {
    query: { queryKey: getListPatientsQueryKey() },
  });

  const capture = useCallback(async () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;
    const res = await fetch(imageSrc);
    const blob = await res.blob();
    const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
    setQueue((prev) => [...prev, {
      id: crypto.randomUUID(),
      file,
      previewUrl: imageSrc,
      source: "camera",
      notes: "",
    }]);
  }, [webcamRef]);

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const incoming: QueuedFile[] = Array.from(e.target.files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      source: "upload" as const,
      notes: "",
    }));
    setQueue((prev) => [...prev, ...incoming]);
    e.target.value = "";
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const updateItemNotes = (id: string, notes: string) => {
    setQueue((prev) => prev.map((item) => item.id === id ? { ...item, notes } : item));
  };

  const clearQueue = () => {
    queue.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setQueue([]);
    setSeriesNotes("");
  };

  const handleSave = async () => {
    if (!patientId) {
      toast({
        variant: "destructive",
        title: t("capture.patientRequired"),
        description: t("capture.patientRequiredDesc"),
      });
      return;
    }
    if (queue.length === 0) return;

    setIsUploading(true);
    setUploadProgress({ done: 0, total: queue.length });

    let successCount = 0;
    let lastId: number | null = null;

    for (const item of queue) {
      try {
        const combined = [seriesNotes.trim(), item.notes.trim()]
          .filter(Boolean)
          .join("\n\n");

        const result = await uploadPatientImage(
          item.file!,
          parseInt(patientId, 10),
          combined || undefined,
        );
        lastId = result.id;
        successCount++;
        setUploadProgress({ done: successCount, total: queue.length });
      } catch (err) {
        toast({
          variant: "destructive",
          title: t("capture.uploadFailed"),
          description: err instanceof Error ? err.message : t("common.error"),
        });
      }
    }

    setIsUploading(false);
    setUploadProgress(null);

    if (successCount > 0) {
      const queueLength = queue.length;
      clearQueue();
      if (queueLength === 1 && lastId) {
        toast({ title: t("capture.imageSaved"), description: t("capture.imageSavedDesc") });
        setLocation(`/editor/${lastId}`);
      } else {
        toast({
          title: t("capture.allSaved", { count: successCount }),
          description: t("capture.allSavedDesc", { count: successCount }),
        });
        setLocation(`/gallery?patientId=${patientId}`);
      }
    }
  };

  const showQueue = queue.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">{t("capture.title")}</h1>
        <p className="text-muted-foreground">{t("capture.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Patient selector */}
          <div className="space-y-2">
            <Label htmlFor="patient">
              {t("capture.selectPatient")} <span className="text-destructive">*</span>
            </Label>
            <Select value={patientId} onValueChange={setPatientId} disabled={loadingPatients}>
              <SelectTrigger id="patient">
                <SelectValue placeholder={t("capture.selectPatientPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {patients?.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}{" "}
                    <span className="text-muted-foreground text-xs font-mono ml-2">
                      ({p.patientCode})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
            <Button
              variant={mode === "camera" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMode("camera")}
            >
              <Camera className="h-4 w-4 mr-2" />
              {t("capture.camera")}
            </Button>
            <Button
              variant={mode === "upload" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMode("upload")}
            >
              <Upload className="h-4 w-4 mr-2" />
              {t("capture.upload")}
            </Button>
          </div>

          {/* Camera / upload input area */}
          {mode === "camera" ? (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode: "environment" }}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
                <Button
                  size="lg"
                  className="rounded-full h-16 w-16 p-0 border-4 border-white/20 hover:border-white shadow-xl bg-primary hover:bg-primary/90"
                  onClick={capture}
                >
                  <Camera className="h-8 w-8" />
                </Button>
              </div>
              {showQueue && (
                <div className="absolute top-3 right-3 bg-primary text-primary-foreground text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow">
                  {queue.length}
                </div>
              )}
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-xl aspect-video flex flex-col items-center justify-center p-6 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById("file-upload")?.click()}
            >
              <Images className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">{t("capture.clickToBrowse")}</p>
              <p className="text-sm text-muted-foreground mb-4">{t("capture.uploadInfo")}</p>
              <Input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                id="file-upload"
                onChange={handleFilesChange}
              />
              <Button
                variant="outline"
                onClick={(e) => { e.stopPropagation(); document.getElementById("file-upload")?.click(); }}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("capture.selectFile")}
              </Button>
            </div>
          )}

          {/* Queue header */}
          {showQueue && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {t("capture.photosReady", { count: queue.length })}
              </p>
              <div className="flex gap-2">
                {mode === "upload" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById("file-upload")?.click()}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    {t("capture.addMore")}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={clearQueue} disabled={isUploading}>
                  {t("capture.clearAll")}
                </Button>
              </div>
            </div>
          )}

          {/* Per-image cards with individual notes */}
          {showQueue && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {queue.map((item, index) => (
                <div
                  key={item.id}
                  className="border rounded-xl overflow-hidden bg-card shadow-sm"
                >
                  {/* Image preview */}
                  <div className="relative aspect-video bg-muted overflow-hidden">
                    <img
                      src={item.previewUrl}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {index + 1}
                    </div>
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      disabled={isUploading}
                      className="absolute top-2 right-2 rounded-full bg-black/60 hover:bg-destructive text-white h-6 w-6 flex items-center justify-center transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Per-image notes */}
                  <div className="p-3 space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      {t("capture.imageNotes")}
                    </Label>
                    <Textarea
                      placeholder={t("capture.imageNotesPlaceholder")}
                      value={item.notes}
                      onChange={(e) => updateItemNotes(item.id, e.target.value)}
                      disabled={isUploading}
                      className="resize-none text-sm h-20 min-h-0"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Series notes + actions */}
          {showQueue && (
            <>
              {/* Series-level notes */}
              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="series-notes" className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {t("capture.seriesNotes")}
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    — applies to all images above
                  </span>
                </Label>
                <Textarea
                  id="series-notes"
                  placeholder={t("capture.seriesNotesPlaceholder")}
                  value={seriesNotes}
                  onChange={(e) => setSeriesNotes(e.target.value)}
                  disabled={isUploading}
                  className="resize-none h-24"
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button variant="outline" onClick={clearQueue} disabled={isUploading}>
                  {t("common.discard")}
                </Button>
                <Button onClick={handleSave} disabled={isUploading || !patientId}>
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {uploadProgress
                        ? t("capture.uploadingProgress", { done: uploadProgress.done, total: uploadProgress.total })
                        : "Uploading…"}
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      {queue.length === 1
                        ? t("capture.saveAndEdit")
                        : t("capture.uploadPhotos", { count: queue.length })}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
