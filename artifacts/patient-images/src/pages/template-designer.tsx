import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Save, SquareStack, RotateCcw, Grid3X3, Copy, ClipboardPaste, ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TemplateFrame { id: string; x: number; y: number; width: number; height: number; label?: string; }
interface Template { id: number; title: string; description?: string | null; officeName?: string | null; officeInfo?: string | null; logoData?: string | null; pageWidth: number; pageHeight: number; frames: TemplateFrame[]; createdAt: string; updatedAt: string; }

type DragState =
  | { type: "move"; frameId: string; startMX: number; startMY: number; origX: number; origY: number }
  | { type: "resize"; frameId: string; handle: string; startMX: number; startMY: number; origX: number; origY: number; origW: number; origH: number };

const MM_PER_IN = 25.4;
const PX_PER_MM = 96 / 25.4;
const GRID_MM = 5;
const PAGE_PRESETS = [
  { id: "letter", label: "Letter (8.5×11 in)", width: 215.9, height: 279.4 },
  { id: "a4", label: "A4 (210×297 mm)", width: 210, height: 297 },
  { id: "legal", label: "Legal (8.5×14 in)", width: 215.9, height: 355.6 },
  { id: "custom", label: "Custom", width: 0, height: 0 },
];
const RESIZE_HANDLES = [
  { id: "nw", style: { top: -5, left: -5, cursor: "nw-resize" } },
  { id: "ne", style: { top: -5, right: -5, cursor: "ne-resize" } },
  { id: "sw", style: { bottom: -5, left: -5, cursor: "sw-resize" } },
  { id: "se", style: { bottom: -5, right: -5, cursor: "se-resize" } },
];

function toDisp(mm: number, unit: "in" | "mm") {
  return unit === "in" ? (mm / MM_PER_IN).toFixed(2) : mm.toFixed(1);
}
function fromDisp(val: string, unit: "in" | "mm"): number | null {
  const n = parseFloat(val);
  return isNaN(n) ? null : unit === "in" ? n * MM_PER_IN : n;
}
function detectPreset(w: number, h: number) {
  const portrait = PAGE_PRESETS.find((p) => p.id !== "custom" && Math.abs(p.width - w) < 0.5 && Math.abs(p.height - h) < 0.5);
  if (portrait) return portrait.id;
  const landscape = PAGE_PRESETS.find((p) => p.id !== "custom" && Math.abs(p.height - w) < 0.5 && Math.abs(p.width - h) < 0.5);
  if (landscape) return landscape.id;
  return "custom";
}
function snapVal(val: number, enabled: boolean): number {
  if (!enabled) return val;
  return Math.round(val / GRID_MM) * GRID_MM;
}

export default function TemplateDesigner() {
  const params = useParams<{ id: string }>();
  const templateId = parseInt(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [title, setTitle] = useState("Untitled Template");
  const [officeName, setOfficeName] = useState("");
  const [officeInfo, setOfficeInfo] = useState("");
  const [pageWidth, setPageWidth] = useState(215.9);
  const [pageHeight, setPageHeight] = useState(279.4);
  const [frames, setFrames] = useState<TemplateFrame[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [unit, setUnit] = useState<"in" | "mm">("in");
  const [pagePreset, setPagePreset] = useState("letter");
  const [customW, setCustomW] = useState("8.50");
  const [customH, setCustomH] = useState("11.00");
  const [isDirty, setIsDirty] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [copiedSize, setCopiedSize] = useState<{ width: number; height: number } | null>(null);
  const [logoData, setLogoData] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [containerWidth, setContainerWidth] = useState(640);
  const dragRef = useRef<DragState | null>(null);
  const framesRef = useRef<TemplateFrame[]>([]);
  const pageWRef = useRef(215.9);
  const pageHRef = useRef(279.4);
  const containerWRef = useRef(640);
  const snapRef = useRef(true);

  useEffect(() => { framesRef.current = frames; }, [frames]);
  useEffect(() => { pageWRef.current = pageWidth; }, [pageWidth]);
  useEffect(() => { pageHRef.current = pageHeight; }, [pageHeight]);
  useEffect(() => { containerWRef.current = containerWidth; }, [containerWidth]);
  useEffect(() => { snapRef.current = snapToGrid; }, [snapToGrid]);

  const isLandscape = pageWidth > pageHeight;

  const physW = pageWidth * PX_PER_MM;
  const physH = pageHeight * PX_PER_MM;
  const displayScale = containerWidth > 0 ? Math.min(1, (containerWidth - 2) / physW) : 1;
  const displayW = physW * displayScale;
  const displayH = physH * displayScale;

  // Grid lines (every GRID_MM mm)
  const gridLinesX: number[] = [];
  const gridLinesY: number[] = [];
  if (snapToGrid) {
    for (let x = GRID_MM; x < pageWidth; x += GRID_MM) gridLinesX.push(x * PX_PER_MM * displayScale);
    for (let y = GRID_MM; y < pageHeight; y += GRID_MM) gridLinesY.push(y * PX_PER_MM * displayScale);
  }

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const w = containerWRef.current;
      const physicalW = pageWRef.current * PX_PER_MM;
      const scale = Math.min(1, (w - 2) / physicalW);
      const pxPerMm = PX_PER_MM * scale;
      const dx = (e.clientX - d.startMX) / pxPerMm;
      const dy = (e.clientY - d.startMY) / pxPerMm;
      const MIN = 10;
      const snap = snapRef.current;

      setFrames((prev) =>
        prev.map((f) => {
          if (f.id !== d.frameId) return f;
          if (d.type === "move") {
            const nx = snapVal(Math.max(0, Math.min(d.origX + dx, pageWRef.current - f.width)), snap);
            const ny = snapVal(Math.max(0, Math.min(d.origY + dy, pageHRef.current - f.height)), snap);
            return { ...f, x: nx, y: ny };
          }
          let nx = d.origX, ny = d.origY, nw = d.origW, nh = d.origH;
          const h = d.handle;
          if (h.includes("e")) nw = Math.max(MIN, d.origW + dx);
          if (h.includes("w")) { nw = Math.max(MIN, d.origW - dx); nx = d.origX + (d.origW - nw); }
          if (h.includes("s")) nh = Math.max(MIN, d.origH + dy);
          if (h.includes("n")) { nh = Math.max(MIN, d.origH - dy); ny = d.origY + (d.origH - nh); }
          nw = snapVal(Math.max(MIN, nw), snap);
          nh = snapVal(Math.max(MIN, nh), snap);
          nx = snapVal(Math.max(0, Math.min(nx, pageWRef.current - nw)), snap);
          ny = snapVal(Math.max(0, Math.min(ny, pageHRef.current - nh)), snap);
          return { ...f, x: nx, y: ny, width: nw, height: nh };
        })
      );
      setIsDirty(true);
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const { data: template, isLoading } = useQuery<Template>({
    queryKey: ["templates", templateId],
    queryFn: () => customFetch<Template>(`/api/templates/${templateId}`),
    enabled: !isNaN(templateId),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!template) return;
    setTitle(template.title ?? "");
    setOfficeName(template.officeName ?? "");
    setOfficeInfo(template.officeInfo ?? "");
    setLogoData(template.logoData ?? null);
    setPageWidth(template.pageWidth);
    setPageHeight(template.pageHeight);
    setFrames((template.frames as TemplateFrame[]) ?? []);
    setPagePreset(detectPreset(template.pageWidth, template.pageHeight));
    setCustomW(toDisp(template.pageWidth, "in"));
    setCustomH(toDisp(template.pageHeight, "in"));
    setIsDirty(false);
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: (body: object) => customFetch<Template>(`/api/templates/${templateId}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["templates", templateId] });
      setIsDirty(false);
      toast({ title: t("templates.designer.saved") });
    },
    onError: () => toast({ title: t("templates.designer.saveFailed"), variant: "destructive" }),
  });

  function handleSave() {
    saveMutation.mutate({ title, officeName: officeName || null, officeInfo: officeInfo || null, logoData: logoData ?? null, pageWidth, pageHeight, frames });
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX_W = 300;
        const MAX_H = 120;
        const scale = Math.min(1, MAX_W / img.width, MAX_H / img.height);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setLogoData(canvas.toDataURL("image/png", 0.85));
          setIsDirty(true);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function addFrame() {
    const id = crypto.randomUUID();
    const newFrame: TemplateFrame = { id, x: snapVal(10, snapToGrid), y: snapVal(10, snapToGrid), width: snapVal(50, snapToGrid), height: snapVal(50, snapToGrid), label: `Frame ${frames.length + 1}` };
    setFrames((prev) => [...prev, newFrame]);
    setSelectedFrameId(id);
    setIsDirty(true);
  }

  function removeFrame(id: string) {
    setFrames((prev) => prev.filter((f) => f.id !== id));
    if (selectedFrameId === id) setSelectedFrameId(null);
    setIsDirty(true);
  }

  function updateFrame(id: string, changes: Partial<TemplateFrame>) {
    setFrames((prev) => prev.map((f) => f.id === id ? { ...f, ...changes } : f));
    setIsDirty(true);
  }

  function handlePagePreset(preset: string) {
    setPagePreset(preset);
    const p = PAGE_PRESETS.find((x) => x.id === preset);
    if (p && preset !== "custom") {
      // preserve current orientation when switching presets
      const wantLandscape = isLandscape;
      const pw = wantLandscape ? Math.max(p.width, p.height) : Math.min(p.width, p.height);
      const ph = wantLandscape ? Math.min(p.width, p.height) : Math.max(p.width, p.height);
      setPageWidth(pw);
      setPageHeight(ph);
      setCustomW(toDisp(pw, unit));
      setCustomH(toDisp(ph, unit));
      setIsDirty(true);
    }
  }

  function applyCustomSize() {
    const w = fromDisp(customW, unit);
    const h = fromDisp(customH, unit);
    if (w && h && w > 0 && h > 0) {
      setPageWidth(w); setPageHeight(h); setIsDirty(true);
    }
  }

  function toggleOrientation() {
    const newW = pageHeight;
    const newH = pageWidth;
    setPageWidth(newW);
    setPageHeight(newH);
    setCustomW(toDisp(newW, unit));
    setCustomH(toDisp(newH, unit));
    setIsDirty(true);
  }

  const selectedFrame = frames.find((f) => f.id === selectedFrameId) ?? null;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">{t("templates.designer.loading")}</div>;
  }

  return (
    <div className="flex -mx-4 -mt-4 md:-mx-6 md:-mt-6 lg:-mx-8 lg:-mt-8" style={{ height: "calc(100vh - 3.5rem)" }}>
      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 bg-muted/40 overflow-auto flex flex-col items-center p-6 min-w-0" style={{ scrollbarGutter: "stable" }}>
        <div className="w-full max-w-3xl">
          <div
            style={{
              width: displayW,
              height: displayH,
              position: "relative",
              background: "white",
              boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
              margin: "0 auto",
              overflow: "hidden",
            }}
            onClick={() => setSelectedFrameId(null)}
          >
            {/* Grid overlay */}
            {snapToGrid && (
              <svg
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}
              >
                {gridLinesX.map((x, i) => (
                  <line key={`gx${i}`} x1={x} y1={0} x2={x} y2={displayH} stroke="hsl(var(--muted-foreground)/0.12)" strokeWidth={0.5} />
                ))}
                {gridLinesY.map((y, i) => (
                  <line key={`gy${i}`} x1={0} y1={y} x2={displayW} y2={y} stroke="hsl(var(--muted-foreground)/0.12)" strokeWidth={0.5} />
                ))}
              </svg>
            )}

            {/* Frames */}
            {frames.map((frame, i) => {
              const isSelected = frame.id === selectedFrameId;
              const fx = frame.x * PX_PER_MM * displayScale;
              const fy = frame.y * PX_PER_MM * displayScale;
              const fw = frame.width * PX_PER_MM * displayScale;
              const fh = frame.height * PX_PER_MM * displayScale;
              const labelFontSize = Math.max(9, 11 * displayScale);
              return (
                <div
                  key={frame.id}
                  style={{ position: "absolute", left: fx, top: fy, width: fw, height: fh, zIndex: isSelected ? 10 : 5 }}
                  onClick={(e) => { e.stopPropagation(); setSelectedFrameId(frame.id); }}
                >
                  <div
                    style={{
                      position: "absolute", inset: 0,
                      border: isSelected ? "2px solid hsl(var(--primary))" : "2px dashed hsl(var(--muted-foreground))",
                      background: isSelected ? "hsl(var(--primary)/0.05)" : "hsl(var(--muted)/0.3)",
                      cursor: "move",
                      boxSizing: "border-box",
                      userSelect: "none",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedFrameId(frame.id);
                      dragRef.current = { type: "move", frameId: frame.id, startMX: e.clientX, startMY: e.clientY, origX: frame.x, origY: frame.y };
                    }}
                  >
                    <span style={{ fontSize: labelFontSize, color: "hsl(var(--muted-foreground))", fontWeight: 500, pointerEvents: "none", textAlign: "center", padding: "0 4px" }}>
                      {frame.label || `Frame ${i + 1}`}
                    </span>
                    <span style={{ fontSize: Math.max(8, 9 * displayScale), color: "hsl(var(--muted-foreground)/0.6)", pointerEvents: "none", marginTop: 2 }}>
                      {toDisp(frame.width, unit)}×{toDisp(frame.height, unit)} {unit}
                    </span>
                  </div>
                  {isSelected && RESIZE_HANDLES.map((rh) => (
                    <div
                      key={rh.id}
                      style={{
                        position: "absolute", width: 10, height: 10,
                        background: "hsl(var(--primary))", borderRadius: 2,
                        zIndex: 20, ...rh.style,
                        cursor: rh.style.cursor,
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dragRef.current = { type: "resize", frameId: frame.id, handle: rh.id, startMX: e.clientX, startMY: e.clientY, origX: frame.x, origY: frame.y, origW: frame.width, origH: frame.height };
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-3">
            {(pageWidth / MM_PER_IN).toFixed(2)}" × {(pageHeight / MM_PER_IN).toFixed(2)}" · {isLandscape ? t("templates.designer.landscape") : t("templates.designer.portrait")} · {frames.length} frame{frames.length !== 1 ? "s" : ""}
            {displayScale < 0.99 && ` · Zoom ${Math.round(displayScale * 100)}%`}
          </p>
        </div>
      </div>

      {/* Right sidebar */}
      <div className="w-72 xl:w-80 border-l bg-background overflow-y-auto flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <Button variant="ghost" size="sm" onClick={() => navigate("/templates")} className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> {t("nav.templates")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending || !isDirty}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saveMutation.isPending ? t("templates.designer.saving") : t("templates.designer.save")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Template Info */}
          <section className="px-4 py-3 border-b space-y-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">{t("templates.designer.templateInfo")}</h3>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("templates.designer.name")}</Label>
              <Input value={title} onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("templates.designer.officeName")}</Label>
              <Input value={officeName} onChange={(e) => { setOfficeName(e.target.value); setIsDirty(true); }} placeholder={t("templates.designer.optional")} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("templates.designer.officeInfo")}</Label>
              <Textarea value={officeInfo} onChange={(e) => { setOfficeInfo(e.target.value); setIsDirty(true); }} placeholder={t("templates.designer.optional")} rows={2} className="text-sm resize-none" />
            </div>

            {/* Office Logo */}
            <div className="space-y-1.5">
              <Label className="text-xs">{t("templates.designer.officeLogo")}</Label>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              {logoData ? (
                <div className="flex items-center gap-2">
                  <img src={logoData} alt="logo" className="h-10 max-w-[120px] object-contain rounded border border-border bg-muted/30 p-0.5" />
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => { setLogoData(null); setIsDirty(true); }}
                  >
                    <X className="h-3 w-3 mr-1" />{t("templates.designer.removeLogo")}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button" variant="outline" size="sm"
                  className="h-8 text-xs w-full gap-1.5"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <ImageIcon className="h-3.5 w-3.5" />{t("templates.designer.uploadLogo")}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">{t("templates.designer.logoHint")}</p>
            </div>
          </section>

          {/* Page Size */}
          <section className="px-4 py-3 border-b space-y-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">{t("templates.designer.pageSize")}</h3>
            <Select value={pagePreset} onValueChange={handlePagePreset}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Orientation toggle */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">{t("templates.designer.orientation")}</span>
              <Button
                variant="outline" size="sm"
                className={cn("h-7 px-2.5 text-xs gap-1.5", !isLandscape && "bg-primary text-primary-foreground border-primary")}
                onClick={() => isLandscape && toggleOrientation()}
              >
                <span style={{ display: "inline-block", width: 10, height: 13, border: "1.5px solid currentColor", borderRadius: 1, flexShrink: 0 }} />
                {t("templates.designer.portrait")}
              </Button>
              <Button
                variant="outline" size="sm"
                className={cn("h-7 px-2.5 text-xs gap-1.5", isLandscape && "bg-primary text-primary-foreground border-primary")}
                onClick={() => !isLandscape && toggleOrientation()}
              >
                <span style={{ display: "inline-block", width: 13, height: 10, border: "1.5px solid currentColor", borderRadius: 1, flexShrink: 0 }} />
                {t("templates.designer.landscape")}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-1.5 text-muted-foreground" title={t("templates.designer.swapOrientation")} onClick={toggleOrientation}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Unit toggle */}
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className={cn("h-6 px-2 text-xs", unit === "in" && "bg-primary text-primary-foreground")} onClick={() => { setUnit("in"); setCustomW(toDisp(pageWidth, "in")); setCustomH(toDisp(pageHeight, "in")); }}>in</Button>
              <Button variant="outline" size="sm" className={cn("h-6 px-2 text-xs", unit === "mm" && "bg-primary text-primary-foreground")} onClick={() => { setUnit("mm"); setCustomW(toDisp(pageWidth, "mm")); setCustomH(toDisp(pageHeight, "mm")); }}>mm</Button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t("templates.designer.width", { unit })}</Label>
                <Input value={customW} onChange={(e) => setCustomW(e.target.value)} onBlur={applyCustomSize} className="h-7 text-xs" />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t("templates.designer.height", { unit })}</Label>
                <Input value={customH} onChange={(e) => setCustomH(e.target.value)} onBlur={applyCustomSize} className="h-7 text-xs" />
              </div>
            </div>

            {/* Snap to grid toggle */}
            <button
              className={cn(
                "flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs border transition-colors",
                snapToGrid
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/60"
              )}
              onClick={() => setSnapToGrid((v) => !v)}
            >
              <Grid3X3 className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="font-medium">{t("templates.designer.snapToGrid")}</span>
              <span className="ml-auto text-xs opacity-70">{snapToGrid ? `${GRID_MM}mm` : t("templates.designer.snapOff")}</span>
            </button>
          </section>

          {/* Frames list */}
          <section className="px-4 py-3 border-b space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
                <SquareStack className="h-3.5 w-3.5" />
                {t("templates.designer.frames", { count: frames.length })}
              </h3>
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={addFrame}>
                <Plus className="h-3 w-3 mr-1" /> {t("templates.designer.add")}
              </Button>
            </div>
            {frames.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">{t("templates.designer.noFrames")}</p>
            )}
            <div className="space-y-1">
              {frames.map((f, i) => (
                <div
                  key={f.id}
                  className={cn("flex items-center justify-between rounded px-2 py-1.5 cursor-pointer text-xs", selectedFrameId === f.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/60")}
                  onClick={() => setSelectedFrameId(f.id)}
                >
                  <span className="truncate font-medium">{f.label || `Frame ${i + 1}`}</span>
                  <div className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0">
                    <span>{toDisp(f.width, unit)}×{toDisp(f.height, unit)}</span>
                    <button className="hover:text-destructive p-0.5" onClick={(e) => { e.stopPropagation(); removeFrame(f.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Selected frame controls */}
          {selectedFrame && (
            <section className="px-4 py-3 space-y-3">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">{t("templates.designer.selectedFrame")}</h3>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("templates.designer.label")}</Label>
                <Input value={selectedFrame.label ?? ""} onChange={(e) => updateFrame(selectedFrame.id, { label: e.target.value })} className="h-7 text-xs" placeholder={t("templates.designer.labelPlaceholder")} />
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className={cn("h-6 px-2 text-xs", unit === "in" && "bg-primary text-primary-foreground")} onClick={() => setUnit("in")}>in</Button>
                <Button variant="outline" size="sm" className={cn("h-6 px-2 text-xs", unit === "mm" && "bg-primary text-primary-foreground")} onClick={() => setUnit("mm")}>mm</Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("templates.designer.width", { unit })}</Label>
                  <Input
                    value={toDisp(selectedFrame.width, unit)}
                    onChange={(e) => { const v = fromDisp(e.target.value, unit); if (v && v > 0) updateFrame(selectedFrame.id, { width: v }); }}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("templates.designer.height", { unit })}</Label>
                  <Input
                    value={toDisp(selectedFrame.height, unit)}
                    onChange={(e) => { const v = fromDisp(e.target.value, unit); if (v && v > 0) updateFrame(selectedFrame.id, { height: v }); }}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("templates.designer.xPos", { unit })}</Label>
                  <Input
                    value={toDisp(selectedFrame.x, unit)}
                    onChange={(e) => { const v = fromDisp(e.target.value, unit); if (v !== null && v >= 0) updateFrame(selectedFrame.id, { x: v }); }}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("templates.designer.yPos", { unit })}</Label>
                  <Input
                    value={toDisp(selectedFrame.y, unit)}
                    onChange={(e) => { const v = fromDisp(e.target.value, unit); if (v !== null && v >= 0) updateFrame(selectedFrame.id, { y: v }); }}
                    className="h-7 text-xs"
                  />
                </div>
              </div>

              {/* Copy / Paste size */}
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1.5"
                  onClick={() => setCopiedSize({ width: selectedFrame.width, height: selectedFrame.height })}
                >
                  <Copy className="h-3 w-3" /> {t("templates.designer.copySize")}
                </Button>
                {copiedSize && copiedSize.width !== selectedFrame.width || copiedSize && copiedSize.height !== selectedFrame.height ? (
                  <Button
                    size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1.5 text-primary border-primary/40"
                    onClick={() => {
                      if (copiedSize) {
                        updateFrame(selectedFrame.id, { width: copiedSize.width, height: copiedSize.height });
                      }
                    }}
                  >
                    <ClipboardPaste className="h-3 w-3" /> {t("templates.designer.pasteSize")}
                  </Button>
                ) : copiedSize ? (
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1.5 opacity-50" disabled>
                    <ClipboardPaste className="h-3 w-3" /> {t("templates.designer.sameSize")}
                  </Button>
                ) : null}
              </div>
              {copiedSize && (
                <p className="text-xs text-muted-foreground">
                  {t("templates.designer.copiedSize", { w: toDisp(copiedSize.width, unit), h: toDisp(copiedSize.height, unit), unit })}
                </p>
              )}

              <Button size="sm" variant="outline" className="w-full h-7 text-xs text-destructive hover:text-destructive" onClick={() => removeFrame(selectedFrame.id)}>
                <Trash2 className="h-3 w-3 mr-1.5" /> {t("templates.designer.removeFrame")}
              </Button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
