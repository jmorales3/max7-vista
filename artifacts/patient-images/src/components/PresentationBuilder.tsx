import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, ChevronRight, Play, X, ArrowUp, ArrowDown,
  ArrowLeftRight, ChevronsLeftRight, Camera, Save, Pencil, Check, Layers,
} from "lucide-react";

export type SingleSlide = { type: "single"; imageId: number };
export type CompareSlide = { type: "compare"; beforeId: number; afterId: number };
export type SuperimposeSlide = {
  type: "superimpose";
  baseId: number;
  overlayId: number;
  overlayOpacity: number;
  overlayOffsetX: number;
  overlayOffsetY: number;
  overlayScaleCorrection: number;
};
export type Slide = SingleSlide | CompareSlide | SuperimposeSlide;

export interface PickerImage {
  id: number;
  patientName?: string;
  patientId?: number | null;
}

/* ─── Before/After Slider ──────────────────────────────────── */
export function BeforeAfterSlider({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const { t } = useTranslation();
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  useEffect(() => {
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => { window.removeEventListener("mouseup", onUp); window.removeEventListener("touchend", onUp); };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none overflow-hidden cursor-col-resize bg-black"
      onMouseMove={(e) => { if (dragging.current) updatePosition(e.clientX); }}
      onTouchMove={(e) => { if (dragging.current) updatePosition(e.touches[0].clientX); }}
    >
      <img src={beforeUrl} className="absolute inset-0 w-full h-full object-contain" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
        <img src={afterUrl} className="absolute inset-0 w-full h-full object-contain" />
      </div>
      <div className="absolute top-4 left-4 bg-black/70 text-white text-xs font-bold px-3 py-1.5 rounded-full tracking-widest uppercase">
        {t("presentation.before")}
      </div>
      <div className="absolute top-4 right-4 bg-black/70 text-white text-xs font-bold px-3 py-1.5 rounded-full tracking-widest uppercase">
        {t("presentation.after")}
      </div>
      <div className="absolute top-0 bottom-0 w-0.5 bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.4)]" style={{ left: `${position}%` }}>
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white shadow-2xl flex items-center justify-center cursor-ew-resize ring-2 ring-white/20"
          onMouseDown={(e) => { e.preventDefault(); dragging.current = true; }}
          onTouchStart={(e) => { e.preventDefault(); dragging.current = true; }}
        >
          <ChevronsLeftRight className="h-5 w-5 text-slate-700" />
        </div>
      </div>
    </div>
  );
}

/* ─── Superimpose Viewer ────────────────────────────────────── */
export function SuperimposeViewer({ baseUrl, overlayUrl, initialOpacity, offsetX, offsetY, scaleCorrection }: {
  baseUrl: string;
  overlayUrl: string;
  initialOpacity: number;
  offsetX: number;
  offsetY: number;
  scaleCorrection: number;
}) {
  const { t } = useTranslation();
  const [opacity, setOpacity] = useState(initialOpacity);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const dataRef = useRef({
    opacity: initialOpacity,
    baseImg: null as HTMLImageElement | null,
    overlayImg: null as HTMLImageElement | null,
  });

  // Always-fresh draw function stored in a ref so effects never go stale
  const drawRef = useRef<() => void>(() => {});
  drawRef.current = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    const { baseImg, overlayImg, opacity: op } = dataRef.current;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (baseImg && baseImg.complete) {
      const bs = Math.min(W / baseImg.naturalWidth, H / baseImg.naturalHeight);
      const bW = baseImg.naturalWidth * bs;
      const bH = baseImg.naturalHeight * bs;
      ctx.drawImage(baseImg, (W - bW) / 2, (H - bH) / 2, bW, bH);
      if (overlayImg && overlayImg.complete) {
        const os = bs * scaleCorrection;
        const oW = overlayImg.naturalWidth * os;
        const oH = overlayImg.naturalHeight * os;
        ctx.globalAlpha = op;
        ctx.drawImage(overlayImg, (W - oW) / 2 + offsetX, (H - oH) / 2 + offsetY, oW, oH);
        ctx.globalAlpha = 1;
      }
    }
  };

  // Resize observer — sets canvas dimensions and redraws
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resize = () => {
      if (!canvasRef.current) return;
      canvasRef.current.width = container.clientWidth;
      canvasRef.current.height = container.clientHeight;
      drawRef.current();
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  // Load images
  useEffect(() => {
    const bImg = new Image();
    const oImg = new Image();
    let alive = true;
    bImg.onload = () => { if (!alive) return; dataRef.current.baseImg = bImg; drawRef.current(); };
    oImg.onload = () => { if (!alive) return; dataRef.current.overlayImg = oImg; drawRef.current(); };
    bImg.src = baseUrl;
    oImg.src = overlayUrl;
    return () => { alive = false; };
  }, [baseUrl, overlayUrl]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/70 backdrop-blur-sm px-4 py-2.5 rounded-full z-10">
        <Layers className="h-3.5 w-3.5 text-white/60 shrink-0" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={opacity}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            dataRef.current.opacity = v;
            setOpacity(v);
            drawRef.current();
          }}
          className="w-36 accent-white cursor-pointer"
        />
        <span className="text-white/80 text-xs font-mono w-8 text-center shrink-0">
          {Math.round(opacity * 100)}%
        </span>
      </div>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs font-bold px-3 py-1.5 rounded-full tracking-widest uppercase flex items-center gap-1.5">
        <Layers className="h-3 w-3" />
        {t("presentation.superimposeSlide")}
      </div>
    </div>
  );
}

/* ─── Builder ───────────────────────────────────────────────── */
export interface PresentationBuilderProps {
  images: PickerImage[];
  initialSlides?: Slide[];
  initialTitle?: string;
  contextLabel?: string;
  isSaving?: boolean;
  isSaved?: boolean;
  onSave?: (title: string, slides: Slide[]) => void;
  headerLeft?: React.ReactNode;
  groupByPatient?: boolean;
}

export function PresentationBuilder({
  images,
  initialSlides = [],
  initialTitle = "",
  contextLabel,
  isSaving,
  isSaved,
  onSave,
  headerLeft,
  groupByPatient = false,
}: PresentationBuilderProps) {
  const { t } = useTranslation();

  const [slides, setSlides] = useState<Slide[]>(initialSlides);
  const [pairingSlideIdx, setPairingSlideIdx] = useState<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [title, setTitle] = useState(initialTitle);
  const [editingTitle, setEditingTitle] = useState(false);

  useEffect(() => { setSlides(initialSlides); }, [JSON.stringify(initialSlides)]);
  useEffect(() => { setTitle(initialTitle); }, [initialTitle]);

  const imageUrl = (id: number) => `/api/images/${id}/file`;

  const usedIds = new Set(slides.flatMap((s) => {
    if (s.type === "single") return [s.imageId];
    if (s.type === "compare") return [s.beforeId, s.afterId];
    return [s.baseId, s.overlayId];
  }));

  function toggleImage(imgId: number) {
    const existingIdx = slides.findIndex((s) => s.type === "single" && s.imageId === imgId);
    if (existingIdx >= 0) {
      setSlides((prev) => prev.filter((_, i) => i !== existingIdx));
      if (pairingSlideIdx === existingIdx) setPairingSlideIdx(null);
    } else if (!usedIds.has(imgId)) {
      setSlides((prev) => [...prev, { type: "single", imageId: imgId }]);
    }
  }

  function moveSlide(idx: number, dir: -1 | 1) {
    setPairingSlideIdx(null);
    const next = idx + dir;
    if (next < 0 || next >= slides.length) return;
    setSlides((prev) => { const arr = [...prev]; [arr[idx], arr[next]] = [arr[next], arr[idx]]; return arr; });
  }

  function removeSlide(idx: number) {
    setSlides((prev) => prev.filter((_, i) => i !== idx));
    if (pairingSlideIdx === idx) setPairingSlideIdx(null);
  }

  function selectPairImage(idx: number, afterId: number) {
    setSlides((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      const beforeId = s.type === "single" ? s.imageId : s.type === "compare" ? s.beforeId : s.baseId;
      return { type: "compare", beforeId, afterId } as CompareSlide;
    }));
    setPairingSlideIdx(null);
  }

  function removeCompare(idx: number) {
    setSlides((prev) => prev.map((s, i) => {
      if (i !== idx || s.type !== "compare") return s;
      return { type: "single", imageId: s.beforeId } as SingleSlide;
    }));
  }

  const goNext = useCallback(() => setCurrentIdx((i) => Math.min(i + 1, slides.length - 1)), [slides.length]);
  const goPrev = useCallback(() => setCurrentIdx((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    if (!viewerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") setViewerOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [viewerOpen, goNext, goPrev]);

  const availableForPairing = images.filter((img) => !usedIds.has(img.id));

  // Group images by patient for cross-patient mode
  const imageGroups: { label: string; imgs: PickerImage[] }[] = groupByPatient
    ? (() => {
        const map = new Map<string, PickerImage[]>();
        for (const img of images) {
          const key = img.patientName || t("gallery.unassigned");
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(img);
        }
        return Array.from(map.entries()).map(([label, imgs]) => ({ label, imgs }));
      })()
    : [{ label: "", imgs: images }];

  /* ─── VIEWER ──────────────────────────────────────────────── */
  if (viewerOpen && slides.length > 0) {
    const slide = slides[currentIdx];
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 bg-black/80 shrink-0 border-b border-white/10">
          <span className="text-white/60 text-sm font-medium truncate max-w-xs">
            {title || contextLabel}
          </span>
          <span className="text-white/80 text-sm font-mono">
            {currentIdx + 1} / {slides.length}
            {slide.type === "compare" && (
              <span className="ml-2 text-xs text-white/40">{t("presentation.compareSlide")}</span>
            )}
            {slide.type === "superimpose" && (
              <span className="ml-2 text-xs text-white/40">{t("presentation.superimposeSlide")}</span>
            )}
          </span>
          <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10" onClick={() => setViewerOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 relative overflow-hidden">
          {slide.type === "single" ? (
            <img src={imageUrl(slide.imageId)} className="absolute inset-0 w-full h-full object-contain" />
          ) : slide.type === "compare" ? (
            <BeforeAfterSlider beforeUrl={imageUrl(slide.beforeId)} afterUrl={imageUrl(slide.afterId)} />
          ) : (
            <SuperimposeViewer
              baseUrl={imageUrl(slide.baseId)}
              overlayUrl={imageUrl(slide.overlayId)}
              initialOpacity={slide.overlayOpacity}
              offsetX={slide.overlayOffsetX}
              offsetY={slide.overlayOffsetY}
              scaleCorrection={slide.overlayScaleCorrection}
            />
          )}
        </div>

        <div className="flex items-center justify-center gap-6 py-4 bg-black/80 shrink-0 border-t border-white/10">
          <Button variant="ghost" size="icon" className="h-12 w-12 text-white hover:bg-white/10 disabled:opacity-25" onClick={goPrev} disabled={currentIdx === 0}>
            <ChevronLeft className="h-8 w-8" />
          </Button>
          <div className="flex items-center gap-2">
            {slides.map((s, i) => (
              <button key={i} onClick={() => setCurrentIdx(i)}
                title={s.type === "compare" ? t("presentation.compareSlide") : s.type === "superimpose" ? t("presentation.superimposeSlide") : ""}
                className={`rounded-full transition-all duration-200 ${
                  i === currentIdx ? "w-7 h-2.5 bg-white" :
                  s.type === "compare" ? "w-2.5 h-2.5 bg-primary/60 hover:bg-primary" :
                  s.type === "superimpose" ? "w-2.5 h-2.5 bg-violet-400/70 hover:bg-violet-400" :
                  "w-2.5 h-2.5 bg-white/30 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
          <Button variant="ghost" size="icon" className="h-12 w-12 text-white hover:bg-white/10 disabled:opacity-25" onClick={goNext} disabled={currentIdx === slides.length - 1}>
            <ChevronRight className="h-8 w-8" />
          </Button>
        </div>
      </div>
    );
  }

  /* ─── BUILDER ─────────────────────────────────────────────── */
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        {headerLeft}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-8 text-sm font-semibold w-56"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false); }}
                onBlur={() => setEditingTitle(false)}
              />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingTitle(false)}>
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-2xl font-bold text-primary tracking-tight truncate">
                {title || t("presentation.untitled")}
              </h1>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0" onClick={() => setEditingTitle(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {contextLabel && <p className="text-sm text-muted-foreground truncate">{contextLabel}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onSave && (
            <Button variant="outline" onClick={() => onSave(title || t("presentation.untitled"), slides)} disabled={isSaving || slides.length === 0}>
              <Save className="h-4 w-4 mr-2" />
              {isSaved ? t("presentation.saved") : t("presentation.save")}
            </Button>
          )}
          <Button onClick={() => { setCurrentIdx(0); setViewerOpen(true); }} disabled={slides.length === 0} className="gap-2">
            <Play className="h-4 w-4" />
            {t("presentation.present")}
            {slides.length > 0 && (
              <span className="bg-white/20 rounded-full px-1.5 text-xs font-bold">{slides.length}</span>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Image picker ── */}
        <div className="lg:col-span-3 space-y-3">
          <h2 className="font-semibold text-xs text-muted-foreground uppercase tracking-widest">
            {t("presentation.selectImages")}
          </h2>
          {images.length === 0 ? (
            <div className="border-2 border-dashed rounded-xl p-12 text-center text-muted-foreground">
              <Camera className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>{t("presentation.noImages")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {imageGroups.map(({ label, imgs }) => (
                <div key={label}>
                  {label && (
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5 pl-0.5">{label}</p>
                  )}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {imgs.map((img) => {
                      const slideIdx = slides.findIndex((s) => s.type === "single" && s.imageId === img.id);
                      const isSelected = slideIdx >= 0;
                      const isUsedElsewhere = !isSelected && usedIds.has(img.id);
                      return (
                        <button
                          key={img.id}
                          onClick={() => !isUsedElsewhere && toggleImage(img.id)}
                          disabled={isUsedElsewhere}
                          className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all duration-150 ${isSelected ? "border-primary ring-2 ring-primary/30 scale-[0.96]" : isUsedElsewhere ? "border-muted opacity-40 cursor-not-allowed" : "border-transparent hover:border-primary/50 hover:scale-[0.98]"}`}
                        >
                          <img src={imageUrl(img.id)} alt="" className="w-full h-full object-cover" loading="lazy" />
                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <span className="bg-primary text-primary-foreground text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center shadow-lg">{slideIdx + 1}</span>
                            </div>
                          )}
                          {isUsedElsewhere && (
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                              <ArrowLeftRight className="h-5 w-5 text-white" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Slide list ── */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="font-semibold text-xs text-muted-foreground uppercase tracking-widest">
            {t("presentation.slideOrder")}
          </h2>
          {slides.length === 0 ? (
            <div className="border-2 border-dashed rounded-xl p-10 text-center text-muted-foreground text-sm leading-relaxed">
              {t("presentation.noSlides")}
            </div>
          ) : (
            <div className="space-y-2">
              {slides.map((slide, idx) => {
                const mainId = slide.type === "single" ? slide.imageId : slide.type === "compare" ? slide.beforeId : slide.baseId;
                const secondId = slide.type === "compare" ? slide.afterId : slide.type === "superimpose" ? slide.overlayId : null;
                const isPairing = pairingSlideIdx === idx;
                return (
                  <div key={idx}>
                    <Card className={`border transition-colors ${isPairing ? "border-primary/50 bg-primary/5" : "border-muted-foreground/15"}`}>
                      <CardContent className="p-2 flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">{idx + 1}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <div className="w-14 h-10 rounded-md overflow-hidden bg-muted">
                            <img src={imageUrl(mainId)} className="w-full h-full object-cover" />
                          </div>
                          {secondId && (
                            <>
                              {slide.type === "compare" ? (
                                <ChevronsLeftRight className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <Layers className="h-3 w-3 text-violet-500" />
                              )}
                              <div className={`w-14 h-10 rounded-md overflow-hidden bg-muted ${slide.type === "superimpose" ? "opacity-70" : ""}`}>
                                <img src={imageUrl(secondId)} className="w-full h-full object-cover" />
                              </div>
                            </>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {slide.type === "compare" ? (
                            <Badge variant="secondary" className="text-[10px] gap-1 bg-primary/10 text-primary border-primary/20">
                              <ArrowLeftRight className="h-2.5 w-2.5" />
                              {t("presentation.compareSlide")}
                            </Badge>
                          ) : slide.type === "superimpose" ? (
                            <Badge variant="secondary" className="text-[10px] gap-1 bg-violet-500/10 text-violet-600 border-violet-500/20">
                              <Layers className="h-2.5 w-2.5" />
                              {t("presentation.superimposeSlide")}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("presentation.imageSlide")}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSlide(idx, -1)} disabled={idx === 0}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSlide(idx, 1)} disabled={idx === slides.length - 1}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          {slide.type === "single" ? (
                            <Button variant={isPairing ? "secondary" : "ghost"} size="icon" className="h-7 w-7 text-primary hover:bg-primary/10"
                              onClick={() => setPairingSlideIdx(isPairing ? null : idx)} title={t("presentation.addCompare")}>
                              <ArrowLeftRight className="h-3.5 w-3.5" />
                            </Button>
                          ) : slide.type === "compare" ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => removeCompare(idx)} title={t("presentation.removeCompare")}>
                              <X className="h-3 w-3" />
                            </Button>
                          ) : (
                            <div className="w-7" />
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => removeSlide(idx)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Inline "after" image picker */}
                    {isPairing && (
                      <div className="mt-1.5 p-3 bg-muted/60 rounded-xl border border-primary/25 space-y-2">
                        <p className="text-xs font-semibold text-primary">{t("presentation.selectAfterImage")}</p>
                        {availableForPairing.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t("presentation.noImagesForPair")}</p>
                        ) : (
                          <div className="grid grid-cols-5 gap-1.5">
                            {availableForPairing.map((img) => (
                              <button key={img.id} onClick={() => selectPairImage(idx, img.id)}
                                className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary hover:scale-105 transition-all">
                                <img src={imageUrl(img.id)} className="w-full h-full object-cover" loading="lazy" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
