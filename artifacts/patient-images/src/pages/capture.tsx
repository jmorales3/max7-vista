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
import { Camera, Upload, X, Check, Loader2, Plus, Images } from "lucide-react";

interface QueuedFile {
  id: string;
  file: File | null;
  previewUrl: string;
  source: "camera" | "upload";
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
  const [notes, setNotes] = useState("");
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
    const item: QueuedFile = {
      id: crypto.randomUUID(),
      file,
      previewUrl: imageSrc,
      source: "camera",
    };
    setQueue((prev) => [...prev, item]);
  }, [webcamRef]);

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const incoming: QueuedFile[] = Array.from(e.target.files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      source: "upload" as const,
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

  const clearQueue = () => {
    queue.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setQueue([]);
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
        const result = await uploadPatientImage(
          item.file!,
          parseInt(patientId, 10),
          notes,
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
      toast({
        title: successCount === 1 ? t("capture.imageSaved") : `${successCount} images saved`,
        description: successCount === 1
          ? t("capture.imageSavedDesc")
          : `All ${successCount} images have been uploaded successfully.`,
      });
      clearQueue();
      if (queue.length === 1 && lastId) {
        setLocation(`/editor/${lastId}`);
      } else {
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
            <Select
              value={patientId}
              onValueChange={setPatientId}
              disabled={loadingPatients}
            >
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
              <p className="text-sm text-muted-foreground mb-4">
                {t("capture.uploadInfo")} — select multiple files at once
              </p>
              <Input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                id="file-upload"
                onChange={handleFilesChange}
              />
              <Button variant="outline" onClick={(e) => { e.stopPropagation(); document.getElementById("file-upload")?.click(); }}>
                <Plus className="h-4 w-4 mr-2" />
                {t("capture.selectFile")}
              </Button>
            </div>
          )}

          {/* Queued photos preview */}
          {showQueue && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  {queue.length} photo{queue.length !== 1 ? "s" : ""} ready to upload
                </p>
                <div className="flex gap-2">
                  {mode === "upload" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById("file-upload")?.click()}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add more
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={clearQueue}>
                    Clear all
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {queue.map((item) => (
                  <div key={item.id} className="relative group aspect-square rounded-lg overflow-hidden bg-muted">
                    <img
                      src={item.previewUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      className="absolute top-1 right-1 rounded-full bg-black/60 hover:bg-destructive text-white h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes + actions */}
          {showQueue && (
            <>
              <div className="space-y-2">
                <Label htmlFor="notes">{t("capture.clinicalNotes")}</Label>
                <Textarea
                  id="notes"
                  placeholder={t("capture.notesPlaceholder")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="resize-none"
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
                        ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
                        : "Uploading…"}
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      {queue.length === 1
                        ? t("capture.saveAndEdit")
                        : `Upload ${queue.length} photos`}
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
