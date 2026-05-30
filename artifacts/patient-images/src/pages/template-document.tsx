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
interface DocumentFrame { frameId: string; imageId?: number; panX: number; panY: number; zoom?: number; }
interface TemplateDocument { id: number; templateId: number; patientId?: number | null; title: string; frames: DocumentFrame[]; printedAt?: string | null; createdAt: string; updatedAt: string; }
interface PatientData { id: number; name: string; dateOfBirth?: string | null; }
interface ImageItem { id: number; fileName?: string; capturedAt: string; patientId?: number | null; }

const PX_PER_MM = 96 / 25.4;

function ImageInFrame({
  frame, docFrame, pxPerMm, displayScale, editing, onClick, onPanChange, onZoomChange, onRemove, clickToAddLabel, removeImageTitle,
}: {
  frame: TemplateFrame; docFrame: DocumentFrame; pxPerMm: number; displayScale: number;
  editing: boolean; onClick: () => void;
  onPanChange: (x: number, y: number) => void;
  onZoomChange: (zoom: number) => void;
  onRemove: () => void;
  clickToAddLabel: string; removeImageTitle: string;
}) {
  const [natSize, setNatSize] = useState<{ w: number; h: number } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; spx: number; spy: number } | null>(null);

  const frameW = frame.width * pxPerMm;
  const frameH = frame.height * pxPerMm;
  const hasImage = !!docFrame.imageId;

  // zoom: float scale multiplier. 1.0 = show full image fitting inside frame.
  // Legacy docs had zoom=0 (fit) or zoom=100 (fill) — treat any value ≥10 as legacy → reset to 1.
  const zoomScale = docFrame.zoom && docFrame.zoom > 0 && docFrame.zoom < 10 ? docFrame.zoom : 1.0;

  // Fit scale: largest multiplier that fits the full image inside the frame (with natural dims known)
  const fitScale = natSize ? Math.min(frameW / natSize.w, frameH / natSize.h) : null;

  // Rendered image dimensions in canvas pixels
  const displayW = natSize && fitScale ? natSize.w * fitScale * zoomScale : frameW;
  const displayH = natSize && fitScale ? natSize.h * fitScale * zoomScale : frameH;

  // Pan clamp limits (canvas pixels from center; positive = shifted right/down)
  const maxPanX = Math.max(0, (displayW - frameW) / 2);
  const maxPanY = Math.max(0, (displayH - frameH) / 2);
  const panX = Math.max(-maxPanX, Math.min(maxPanX, docFrame.panX));
  const panY = Math.max(-maxPanY, Math.min(maxPanY, docFrame.panY));

  // Top-left corner of image inside the frame (canvas pixels)
  const imgLeft = (frameW - displayW) / 2 + panX;
  const imgTop  = (frameH - displayH) / 2 + panY;

  const canDrag = hasImage && natSize !== null && (maxPanX > 1 || maxPanY > 1);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!hasImage) return;
    e.preventDefault();
    panRef.current = { sx: e.clientX, sy: e.clientY, spx: panX, spy: panY };
    const mxX = maxPanX; const mxY = maxPanY;
    const onMove = (ev: MouseEvent) => {
      if (!panRef.current) return;
      // Convert screen-pixel delta → canvas-pixel delta (parent is scaled by displayScale)
      const dx = (ev.clientX - panRef.current.sx) / displayScale;
      const dy = (ev.clientY - panRef.current.sy) / displayScale;
      onPanChange(
        Math.max(-mxX, Math.min(mxX, panRef.current.spx + dx)),
        Math.max(-mxY, Math.min(mxY, panRef.current.spy + dy)),
      );
    };
    const onUp = () => {
      panRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const labelFontPx = Math.max(9, 13 * (pxPerMm / PX_PER_MM));
  const ctrlFontPx  = Math.max(7, 8  * (pxPerMm / PX_PER_MM));

  return (
    <div style={{ position: "absolute", left: frame.x * pxPerMm, top: frame.y * pxPerMm, width: frameW }}>
      <div
        style={{
          width: frameW, height: frameH,
          overflow: "hidden",
          border: editing ? (hasImage ? "2px solid hsl(var(--primary)/0.6)" : "2px dashed hsl(var(--primary))") : "1px solid hsl(var(--border))",
          boxSizing: "border-box",
          cursor: hasImage ? (canDrag ? "grab" : "default") : "pointer",
          position: "relative",
          background: "hsl(var(--muted)/0.5)",
        }}
        onClick={hasImage ? undefined : onClick}
        onMouseDown={hasImage ? handleMouseDown : undefined}
      >
        {hasImage ? (
          <img
            key={docFrame.imageId}
            src={`/api/images/${docFrame.imageId}/file`}
            onLoad={(e) => setNatSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            draggable={false}
            alt=""
            style={{
              position: "absolute",
              left: natSize ? imgLeft : 0,
              top:  natSize ? imgTop  : 0,
              width:  natSize ? displayW : "100%",
              height: natSize ? displayH : "100%",
              maxWidth: "none",
              objectFit: natSize ? undefined : "contain",
              userSelect: "none", pointerEvents: "none",
            }}
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

        {/* Remove button — hidden in print */}
        {hasImage && editing && (
          <button
            className="no-print"
            style={{ position: "absolute", top: 2, right: 2, background: "hsl(var(--destructive))", color: "white", borderRadius: 4, border: "none", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            title={removeImageTitle}
          >
            <X style={{ width: 10, height: 10 }} />
          </button>
        )}

        {/* Drag-to-pan hint — hidden in print */}
        {canDrag && editing && frameH > 50 && (
          <div className="no-print" style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.45)", color: "white", borderRadius: 3, fontSize: ctrlFontPx, padding: "1px 5px", pointerEvents: "none", lineHeight: 1.5, whiteSpace: "nowrap" }}>
            drag to pan
          </div>
        )}
      </div>

      {/* Zoom slider — outside frame, hidden in print */}
      {hasImage && editing && (
        <div
          className="no-print"
          style={{ display: "flex", alignItems: "center", width: frameW, marginTop: 3, gap: 4 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span style={{ fontSize: ctrlFontPx, color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap", userSelect: "none" }}>1×</span>
          <input
            type="range"
            min={1}
            max={5}
            step={0.05}
            value={zoomScale}
            style={{ flex: 1, height: 14, cursor: "pointer", accentColor: "hsl(var(--primary))" }}
            onChange={(e) => {
              const newScale = parseFloat(e.target.value);
              if (natSize && fitScale) {
                const nW = natSize.w * fitScale * newScale;
                const nH = natSize.h * fitScale * newScale;
                const nMxX = Math.max(0, (nW - frameW) / 2);
                const nMxY = Math.max(0, (nH - frameH) / 2);
                const cPx = Math.max(-nMxX, Math.min(nMxX, docFrame.panX));
                const cPy = Math.max(-nMxY, Math.min(nMxY, docFrame.panY));
                if (cPx !== docFrame.panX || cPy !== docFrame.panY) onPanChange(cPx, cPy);
              }
              onZoomChange(newScale);
            }}
          />
          <span style={{ fontSize: ctrlFontPx, color: "hsl(var(--muted-foreground))", minWidth: "2.2em", textAlign: "right", userSelect: "none" }}>
            {zoomScale.toFixed(1)}×
          </span>
        </div>
      )}

      {/* Label below frame */}
      {hasImage && frame.label && (
        <div
          style={{ width: "100%", textAlign: "center", fontSize: labelFontPx, lineHeight: 1.3, color: "#333", padding: "2px 4px", borderLeft: "1px solid hsl(var(--border))", borderRight: "1px solid hsl(var(--border))", borderBottom: "1px solid hsl(var(--border))", background: "#fafafa", boxSizing: "border-box" }}
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
      if (!ex) return { frameId: tf.id, panX: 0, panY: 0, zoom: 1 };
      // Migrate legacy format (zoom was 0=fit or 100=fill)
      if (!ex.zoom || ex.zoom === 0 || ex.zoom >= 10) return { ...ex, panX: 0, panY: 0, zoom: 1 };
      return ex;
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
    setDocFrames((prev) => prev.map((df) => df.frameId === frameId ? { ...df, imageId, panX: 0, panY: 0, zoom: 1 } : df));
    setPickerFrameId(null);
    setDirty(true);
  }

  function removeImage(frameId: string) {
    setDocFrames((prev) => prev.map((df) => df.frameId === frameId ? { ...df, imageId: undefined, panX: 0, panY: 0, zoom: 1 } : df));
    setDirty(true);
  }

  function updatePan(frameId: string, panX: number, panY: number) {
    setDocFrames((prev) => prev.map((df) => df.frameId === frameId ? { ...df, panX, panY } : df));
    setDirty(true);
  }

  function updateZoom(frameId: string, zoom: number) {
    setDocFrames((prev) => prev.map((df) => df.frameId === frameId ? { ...df, zoom } : df));
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
            position: relative !important;
            overflow: visible !important;
          }
          .print-canvas {
            transform: none !important;
            position: relative !important;
          }
          .print-header {
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 88.9mm !important;
            max-width: 88.9mm !important;
            padding: 8.35mm 5mm !important;
            background: rgba(255,255,255,0.92) !important;
            border: none !important;
            border-radius: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
            gap: 2mm !important;
          }
          .print-header img { height: 15mm !important; max-width: 36mm !important; object-fit: contain !important; }
          .print-header-name { font-size: 13pt !important; }
          .print-header-info { font-size: 10pt !important; }
          .print-header-patient { font-size: 10pt !important; }
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
              height: physH * displayScale,
              background: "white",
              boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Frame canvas — fills the full page */}
            <div
              className="print-canvas"
              style={{
                transform: `scale(${displayScale})`,
                transformOrigin: "top left",
                width: physW,
                height: physH,
                position: "relative",
              }}
            >
              {(template.frames as TemplateFrame[]).map((frame) => {
                const df = docFrames.find((d) => d.frameId === frame.id) ?? { frameId: frame.id, panX: 0, panY: 0, zoom: 1 };
                return (
                  <ImageInFrame
                    key={frame.id}
                    frame={frame}
                    docFrame={df}
                    pxPerMm={PX_PER_MM}
                    displayScale={displayScale}
                    editing={true}
                    onClick={() => setPickerFrameId(frame.id)}
                    onPanChange={(px, py) => updatePan(frame.id, px, py)}
                    onZoomChange={(z) => updateZoom(frame.id, z)}
                    onRemove={() => removeImage(frame.id)}
                    clickToAddLabel={t("templates.document.clickToAdd")}
                    removeImageTitle={t("templates.document.removeImage")}
                  />
                );
              })}
            </div>

            {/* Office info — centered overlay on the page */}
            <div
              className="print-header"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 76.2 * PX_PER_MM * displayScale,
                boxSizing: "border-box",
                background: "rgba(255,255,255,0.92)",
                border: "1px solid #ddd",
                borderRadius: 4,
                padding: `${29 * displayScale}px ${12 * displayScale}px`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: 2 * displayScale,
              }}
            >
              {template.logoData && (
                <img
                  src={template.logoData}
                  alt="logo"
                  style={{ height: 38 * displayScale, maxWidth: 90 * displayScale, objectFit: "contain" }}
                />
              )}
              {template.officeName && (
                <div className="print-header-name" style={{ fontWeight: 700, fontSize: Math.max(11, 13 * displayScale), color: "#111", lineHeight: 1.2 }}>
                  {template.officeName}
                </div>
              )}
              {template.officeInfo && (
                <div className="print-header-info" style={{ fontSize: Math.max(9, 10 * displayScale), color: "#555", lineHeight: 1.2, whiteSpace: "pre-line" }}>
                  {template.officeInfo}
                </div>
              )}
              <div className="print-header-patient" style={{ fontSize: Math.max(9, 10 * displayScale), color: "#444", lineHeight: 1.2, borderTop: "1px solid #ddd", paddingTop: 3 * displayScale, marginTop: displayScale }}>
                {patient && <span style={{ fontWeight: 600 }}>{patient.name}</span>}
                {patient?.dateOfBirth && <span> · {t("templates.document.dob")} {patient.dateOfBirth}</span>}
                <span> · {t("templates.document.date")} {printDate}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Save + Print bar — always visible even when scrolled */}
      <div className="no-print sticky bottom-0 bg-background/95 backdrop-blur-sm border-t py-2.5 px-4 flex items-center justify-between gap-2 -mx-4 md:-mx-6 lg:-mx-8">
        <span className="text-sm font-medium text-foreground truncate max-w-xs">{document.title}</span>
        <div className="flex items-center gap-2 shrink-0">
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
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[28rem] overflow-y-auto py-2 pr-1">
              {(patientImages as ImageItem[]).filter((img) => !img.patientId || img.patientId === document.patientId).map((img) => (
                <div
                  key={img.id}
                  role="button"
                  tabIndex={0}
                  style={{
                    width: "100%",
                    paddingTop: "100%",
                    borderRadius: 8,
                    border: "2px solid transparent",
                    cursor: "pointer",
                    backgroundImage: `url('/api/images/${img.id}/file')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                  }}
                  className="hover:border-primary focus:outline-none focus:border-primary"
                  onClick={() => pickerFrameId && assignImage(pickerFrameId, img.id)}
                  onKeyDown={(e) => e.key === "Enter" && pickerFrameId && assignImage(pickerFrameId, img.id)}
                />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
