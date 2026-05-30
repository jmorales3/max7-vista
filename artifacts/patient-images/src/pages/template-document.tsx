import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Printer, Save, ImagePlus, X } from "lucide-react";
import { format } from "date-fns";

interface TemplateFrame { id: string; x: number; y: number; width: number; height: number; label?: string; }
interface Template { id: number; title: string; officeName?: string | null; officeInfo?: string | null; logoData?: string | null; pageWidth: number; pageHeight: number; frames: TemplateFrame[]; }
interface DocumentFrame { frameId: string; imageId?: number; panX: number; panY: number; }
interface TemplateDocument { id: number; templateId: number; patientId?: number | null; title: string; frames: DocumentFrame[]; printedAt?: string | null; createdAt: string; updatedAt: string; }
interface PatientData { id: number; name: string; dateOfBirth?: string | null; }
interface ImageItem { id: number; fileName?: string; capturedAt: string; patientId?: number | null; }

const PX_PER_MM = 96 / 25.4;

function ImageInFrame({
  frame, docFrame, pxPerMm, editing, onClick, onPanChange, clickToAddLabel, removeImageTitle,
}: {
  frame: TemplateFrame; docFrame: DocumentFrame; pxPerMm: number;
  editing: boolean; onClick: () => void; onPanChange: (x: number, y: number) => void;
  clickToAddLabel: string; removeImageTitle: string;
}) {
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; spx: number; spy: number } | null>(null);

  const frameW = frame.width * pxPerMm;
  const frameH = frame.height * pxPerMm;
  const hasImage = !!docFrame.imageId;

  let imgLeft = 0, imgTop = 0, imgW = frameW, imgH = frameH;
  if (hasImage && naturalSize && naturalSize.w > 0 && naturalSize.h > 0) {
    const coverScale = Math.max(frameW / naturalSize.w, frameH / naturalSize.h);
    imgW = naturalSize.w * coverScale;
    imgH = naturalSize.h * coverScale;
    const maxOX = Math.max(0, imgW - frameW);
    const maxOY = Math.max(0, imgH - frameH);
    imgLeft = -((docFrame.panX / 100) * maxOX);
    imgTop = -((docFrame.panY / 100) * maxOY);
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!hasImage || !naturalSize) return;
    e.preventDefault();
    panRef.current = { sx: e.clientX, sy: e.clientY, spx: docFrame.panX, spy: docFrame.panY };
    const coverScale = Math.max(frameW / naturalSize.w, frameH / naturalSize.h);
    const scaledW = naturalSize.w * coverScale;
    const scaledH = naturalSize.h * coverScale;
    const maxOX = Math.max(1, scaledW - frameW);
    const maxOY = Math.max(1, scaledH - frameH);

    const onMove = (ev: MouseEvent) => {
      if (!panRef.current) return;
      const dx = ev.clientX - panRef.current.sx;
      const dy = ev.clientY - panRef.current.sy;
      const npx = Math.max(0, Math.min(100, panRef.current.spx - (dx / maxOX) * 100));
      const npy = Math.max(0, Math.min(100, panRef.current.spy - (dy / maxOY) * 100));
      onPanChange(npx, npy);
    };
    const onUp = () => {
      panRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const labelFontPx = Math.max(7, 9 * (pxPerMm / PX_PER_MM));

  return (
    <div
      style={{
        position: "absolute",
        left: frame.x * pxPerMm,
        top: frame.y * pxPerMm,
        width: frameW,
      }}
    >
      {/* Image frame box */}
      <div
        style={{
          width: frameW, height: frameH,
          overflow: "hidden",
          border: editing ? (hasImage ? "2px solid hsl(var(--primary)/0.6)" : "2px dashed hsl(var(--primary))") : "1px solid hsl(var(--border))",
          boxSizing: "border-box",
          cursor: hasImage ? "grab" : "pointer",
          position: "relative",
        }}
        onClick={hasImage ? undefined : onClick}
        onMouseDown={hasImage ? handleMouseDown : undefined}
      >
        {hasImage ? (
          <img
            src={`/api/images/${docFrame.imageId}/file`}
            onLoad={(e) => {
              const img = e.target as HTMLImageElement;
              setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            style={{
              position: "absolute",
              left: imgLeft, top: imgTop,
              width: imgW, height: imgH,
              userSelect: "none",
              pointerEvents: "none",
              objectFit: "none",
            }}
            draggable={false}
            alt=""
          />
        ) : (
          <div
            style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "hsl(var(--muted)/0.4)", gap: 4 }}
            onClick={onClick}
          >
            <ImagePlus style={{ width: Math.min(24, frameW * 0.25), height: Math.min(24, frameH * 0.25), color: "hsl(var(--muted-foreground))", opacity: 0.6 }} />
            {frameH > 60 && (
              <span style={{ fontSize: labelFontPx, color: "hsl(var(--muted-foreground))", textAlign: "center", padding: "0 6px" }}>
                {frame.label ?? clickToAddLabel}
              </span>
            )}
          </div>
        )}
        {hasImage && editing && (
          <button
            style={{ position: "absolute", top: 2, right: 2, background: "hsl(var(--destructive))", color: "white", borderRadius: 4, border: "none", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onPanChange(-1, -1); }}
            title={removeImageTitle}
          >
            <X style={{ width: 10, height: 10 }} />
          </button>
        )}
      </div>

      {/* Label below frame — shown when image is loaded and label exists */}
      {hasImage && frame.label && (
        <div
          style={{
            width: "100%",
            textAlign: "center",
            fontSize: labelFontPx,
            lineHeight: 1.3,
            color: "#333",
            padding: "2px 4px",
            borderLeft: "1px solid hsl(var(--border))",
            borderRight: "1px solid hsl(var(--border))",
            borderBottom: "1px solid hsl(var(--border))",
            background: "#fafafa",
            boxSizing: "border-box",
          }}
        >
          {frame.label}
        </div>
      )}
    </div>
  );
}

export default function TemplateDocumentPage() {
  const params = useParams<{ id: string }>();
  const documentId = parseInt(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [docFrames, setDocFrames] = useState<DocumentFrame[]>([]);
  const [pickerFrameId, setPickerFrameId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(680);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((e) => setContainerWidth(e[0].contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { data: document, isLoading: docLoading } = useQuery<TemplateDocument>({
    queryKey: ["template-documents", documentId],
    queryFn: () => customFetch<TemplateDocument>(`/api/template-documents/${documentId}`),
    enabled: !isNaN(documentId),
  });

  const { data: template, isLoading: tplLoading } = useQuery<Template>({
    queryKey: ["templates", document?.templateId],
    queryFn: () => customFetch<Template>(`/api/templates/${document!.templateId}`),
    enabled: !!document?.templateId,
  });

  const { data: patient } = useQuery<PatientData>({
    queryKey: ["patients", document?.patientId],
    queryFn: () => customFetch<PatientData>(`/api/patients/${document!.patientId}`),
    enabled: !!document?.patientId,
  });

  const { data: patientImages = [] } = useQuery<ImageItem[]>({
    queryKey: ["images", { patientId: document?.patientId }],
    queryFn: () => customFetch<ImageItem[]>(`/api/images?patientId=${document!.patientId}`),
    enabled: !!document?.patientId,
  });

  useEffect(() => {
    if (!document || !template) return;
    const existing = document.frames as DocumentFrame[];
    const merged = (template.frames as TemplateFrame[]).map((tf) => {
      const ex = existing.find((df) => df.frameId === tf.id);
      return ex ?? { frameId: tf.id, panX: 50, panY: 50 };
    });
    setDocFrames(merged);
    setDirty(false);
  }, [document, template]);

  const saveMutation = useMutation({
    mutationFn: (frames: DocumentFrame[]) =>
      customFetch<TemplateDocument>(`/api/template-documents/${documentId}`, {
        method: "PUT",
        body: JSON.stringify({ frames }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-documents", documentId] });
      setDirty(false);
      toast({ title: t("templates.document.saved") });
    },
    onError: () => toast({ title: t("templates.document.saveFailed"), variant: "destructive" }),
  });

  function handleSave() {
    saveMutation.mutate(docFrames);
  }

  function handlePrint() {
    if (dirty) {
      saveMutation.mutate(docFrames);
    }
    window.print();
  }

  function assignImage(frameId: string, imageId: number) {
    setDocFrames((prev) => prev.map((df) => df.frameId === frameId ? { ...df, imageId, panX: 50, panY: 50 } : df));
    setPickerFrameId(null);
    setDirty(true);
  }

  function updatePan(frameId: string, panX: number, panY: number) {
    if (panX === -1 && panY === -1) {
      setDocFrames((prev) => prev.map((df) => df.frameId === frameId ? { ...df, imageId: undefined, panX: 50, panY: 50 } : df));
    } else {
      setDocFrames((prev) => prev.map((df) => df.frameId === frameId ? { ...df, panX, panY } : df));
    }
    setDirty(true);
  }

  // suppress unused warning
  void saving; void setSaving;

  const isLoading = docLoading || tplLoading;
  const pageWidth = template?.pageWidth ?? 215.9;
  const pageHeight = template?.pageHeight ?? 279.4;
  const physW = pageWidth * PX_PER_MM;
  const physH = pageHeight * PX_PER_MM;
  const displayScale = containerWidth > 0 ? Math.min(1, (containerWidth - 64) / physW) : 1;
  const pxPerMm = PX_PER_MM * displayScale;

  const printDate = format(new Date(), "MMMM d, yyyy");
  const pickerFrame = template?.frames.find((f) => f.id === pickerFrameId) ?? null;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">{t("templates.document.loading")}</div>;
  }
  if (!document || !template) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">{t("templates.document.notFound")}</div>;
  }

  const headerStyle: React.CSSProperties = {
    padding: "6px 10px 4px",
    borderBottom: "1px solid #ccc",
    marginBottom: 0,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  };

  const headerLeft: React.CSSProperties = { fontSize: "9pt", lineHeight: 1.4, color: "#222" };
  const headerRight: React.CSSProperties = { fontSize: "8pt", lineHeight: 1.4, color: "#555", textAlign: "right" };

  const HEADER_PX = 48 * displayScale;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-page-wrap { background: none !important; padding: 0 !important; }
          .print-page {
            transform: none !important;
            width: ${pageWidth}mm !important;
            height: ${pageHeight}mm !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          .print-header { padding: 4mm 5mm 2mm !important; }
          .print-header-left { font-size: 9pt !important; }
          .print-header-right { font-size: 8pt !important; }
          .print-frame img {
            left: var(--img-left) !important;
            top: var(--img-top) !important;
            width: var(--img-w) !important;
            height: var(--img-h) !important;
          }
          @page { size: ${pageWidth}mm ${pageHeight}mm; margin: 0; }
        }
      `}</style>

      <div className="space-y-4">
        <div className="no-print flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/templates")} className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> {t("nav.templates")}
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate max-w-48">{document.title}</span>
            {dirty && <span className="text-xs text-muted-foreground">{t("templates.document.unsavedChanges")}</span>}
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saveMutation.isPending || !dirty}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saveMutation.isPending ? t("templates.document.saving") : t("templates.document.save")}
            </Button>
            <Button size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              {t("templates.document.print")}
            </Button>
          </div>
        </div>

        <div className="no-print text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
          {t("templates.document.hint")}
        </div>

        <div ref={containerRef} className="print-page-wrap bg-muted/40 flex justify-center py-6 rounded-lg min-h-64">
          <div
            className="print-page"
            style={{
              width: physW * displayScale,
              height: (HEADER_PX + physH * displayScale),
              background: "white",
              boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              className="print-header"
              style={{
                ...headerStyle,
                height: HEADER_PX,
                transform: `scale(${displayScale})`,
                transformOrigin: "top left",
                width: physW,
              }}
            >
              <div className="print-header-left" style={{ ...headerLeft, display: "flex", alignItems: "flex-start", gap: 8 }}>
                {template.logoData && (
                  <img
                    src={template.logoData}
                    alt="logo"
                    style={{ height: 36, maxWidth: 72, objectFit: "contain", flexShrink: 0 }}
                  />
                )}
                <div>
                  {template.officeName && <div style={{ fontWeight: 600 }}>{template.officeName}</div>}
                  {template.officeInfo && <div style={{ whiteSpace: "pre-line" }}>{template.officeInfo}</div>}
                </div>
              </div>
              <div className="print-header-right" style={headerRight}>
                {patient && (
                  <>
                    <div style={{ fontWeight: 600 }}>{patient.name}</div>
                    {patient.dateOfBirth && <div>{t("templates.document.dob")} {patient.dateOfBirth}</div>}
                  </>
                )}
                <div>{t("templates.document.date")} {printDate}</div>
              </div>
            </div>
            <div
              style={{
                position: "absolute",
                top: HEADER_PX,
                left: 0,
                width: physW * displayScale,
                height: physH * displayScale,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  transform: `scale(${displayScale})`,
                  transformOrigin: "top left",
                  width: physW,
                  height: physH,
                  position: "relative",
                }}
              >
                {(template.frames as TemplateFrame[]).map((frame) => {
                  const df = docFrames.find((d) => d.frameId === frame.id) ?? { frameId: frame.id, panX: 50, panY: 50 };
                  return (
                    <ImageInFrame
                      key={frame.id}
                      frame={frame}
                      docFrame={df}
                      pxPerMm={PX_PER_MM}
                      editing={true}
                      onClick={() => setPickerFrameId(frame.id)}
                      onPanChange={(px, py) => updatePan(frame.id, px, py)}
                      clickToAddLabel={t("templates.document.clickToAdd")}
                      removeImageTitle={t("templates.document.removeImage")}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!pickerFrameId} onOpenChange={(o) => !o && setPickerFrameId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("templates.document.selectImage", { label: pickerFrame?.label ?? t("templates.document.frame") })}
            </DialogTitle>
          </DialogHeader>
          {patientImages.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {document.patientId ? t("templates.document.noImages") : t("templates.document.noPatientImages")}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-96 overflow-y-auto py-2">
              {(patientImages as ImageItem[]).filter((img) => !img.patientId || img.patientId === document.patientId).map((img) => (
                <button
                  key={img.id}
                  className="rounded-lg overflow-hidden border-2 border-transparent hover:border-primary focus:outline-none focus:border-primary aspect-square"
                  onClick={() => pickerFrameId && assignImage(pickerFrameId, img.id)}
                >
                  <img
                    src={`/api/images/${img.id}/file`}
                    alt={img.fileName ?? ""}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
