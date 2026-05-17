import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import {
  useGetPatient,
  getGetPatientQueryKey,
  useListPatientImages,
  getListPatientImagesQueryKey,
  Image as ApiImage,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  ChevronsLeftRight,
  Camera,
} from "lucide-react";

type SingleSlide = { type: "single"; imageId: number };
type CompareSlide = { type: "compare"; beforeId: number; afterId: number };
type Slide = SingleSlide | CompareSlide;

function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
}: {
  beforeUrl: string;
  afterUrl: string;
}) {
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
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none overflow-hidden cursor-col-resize bg-black"
      onMouseMove={(e) => { if (dragging.current) updatePosition(e.clientX); }}
      onTouchMove={(e) => { if (dragging.current) updatePosition(e.touches[0].clientX); }}
    >
      {/* Before image — full */}
      <img src={beforeUrl} className="absolute inset-0 w-full h-full object-contain" />

      {/* After image — clipped from left to reveal right of divider */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
      >
        <img src={afterUrl} className="absolute inset-0 w-full h-full object-contain" />
      </div>

      {/* Labels */}
      <div className="absolute top-4 left-4 bg-black/70 text-white text-xs font-bold px-3 py-1.5 rounded-full tracking-widest uppercase">
        {t("presentation.before")}
      </div>
      <div className="absolute top-4 right-4 bg-black/70 text-white text-xs font-bold px-3 py-1.5 rounded-full tracking-widest uppercase">
        {t("presentation.after")}
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.4)]"
        style={{ left: `${position}%` }}
      >
        {/* Drag handle */}
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

export default function Presentation() {
  const { t } = useTranslation();
  const [, params] = useRoute("/presentation/:id");
  const patientId = parseInt(params?.id || "0", 10);

  const { data: patient, isLoading: patientLoading } = useGetPatient(patientId, {
    query: { enabled: !!patientId, queryKey: getGetPatientQueryKey(patientId) },
  });
  const { data: images = [], isLoading: imagesLoading } = useListPatientImages(patientId, {
    query: { enabled: !!patientId, queryKey: getListPatientImagesQueryKey(patientId) },
  });

  const [slides, setSlides] = useState<Slide[]>([]);
  const [pairingSlideIdx, setPairingSlideIdx] = useState<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  const imageUrl = (id: number) => `/api/images/${id}/file`;

  const usedIds = new Set(
    slides.flatMap((s) =>
      s.type === "single" ? [s.imageId] : [s.beforeId, s.afterId],
    ),
  );

  function toggleImage(imgId: number) {
    const existingIdx = slides.findIndex(
      (s) => s.type === "single" && s.imageId === imgId,
    );
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
    setSlides((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  function removeSlide(idx: number) {
    setSlides((prev) => prev.filter((_, i) => i !== idx));
    if (pairingSlideIdx === idx) setPairingSlideIdx(null);
  }

  function selectPairImage(idx: number, afterId: number) {
    setSlides((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const beforeId = s.type === "single" ? s.imageId : s.beforeId;
        return { type: "compare", beforeId, afterId } as CompareSlide;
      }),
    );
    setPairingSlideIdx(null);
  }

  function removeCompare(idx: number) {
    setSlides((prev) =>
      prev.map((s, i) => {
        if (i !== idx || s.type !== "compare") return s;
        return { type: "single", imageId: s.beforeId } as SingleSlide;
      }),
    );
  }

  const goNext = useCallback(
    () => setCurrentIdx((i) => Math.min(i + 1, slides.length - 1)),
    [slides.length],
  );
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

  /* ─── VIEWER ──────────────────────────────────────────────── */
  if (viewerOpen && slides.length > 0) {
    const slide = slides[currentIdx];
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-black/80 shrink-0 border-b border-white/10">
          <span className="text-white/60 text-sm font-medium truncate max-w-xs">
            {patient?.name}
          </span>
          <span className="text-white/80 text-sm font-mono">
            {currentIdx + 1} / {slides.length}
            {slide.type === "compare" && (
              <span className="ml-2 text-xs text-white/40">
                {t("presentation.compareSlide")}
              </span>
            )}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => setViewerOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Slide area */}
        <div className="flex-1 relative overflow-hidden">
          {slide.type === "single" ? (
            <img
              src={imageUrl(slide.imageId)}
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : (
            <BeforeAfterSlider
              beforeUrl={imageUrl(slide.beforeId)}
              afterUrl={imageUrl(slide.afterId)}
            />
          )}
        </div>

        {/* Navigation bar */}
        <div className="flex items-center justify-center gap-6 py-4 bg-black/80 shrink-0 border-t border-white/10">
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 text-white hover:bg-white/10 disabled:opacity-25"
            onClick={goPrev}
            disabled={currentIdx === 0}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>

          {/* Slide dots */}
          <div className="flex items-center gap-2">
            {slides.map((s, i) => (
              <button
                key={i}
                onClick={() => setCurrentIdx(i)}
                title={s.type === "compare" ? t("presentation.compareSlide") : ""}
                className={`rounded-full transition-all duration-200 ${
                  i === currentIdx
                    ? "w-7 h-2.5 bg-white"
                    : s.type === "compare"
                    ? "w-2.5 h-2.5 bg-primary/60 hover:bg-primary"
                    : "w-2.5 h-2.5 bg-white/30 hover:bg-white/60"
                }`}
              />
            ))}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 text-white hover:bg-white/10 disabled:opacity-25"
            onClick={goNext}
            disabled={currentIdx === slides.length - 1}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        </div>
      </div>
    );
  }

  /* ─── BUILDER ─────────────────────────────────────────────── */
  if (patientLoading || imagesLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const allImages = images as ApiImage[];
  const availableForPairing = allImages.filter((img) => !usedIds.has(img.id));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild className="h-8 w-8 shrink-0">
          <Link href={`/patients/${patientId}`}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-primary tracking-tight">
            {t("presentation.title")}
          </h1>
          <p className="text-sm text-muted-foreground truncate">{patient?.name}</p>
        </div>
        <Button
          onClick={() => { setCurrentIdx(0); setViewerOpen(true); }}
          disabled={slides.length === 0}
          className="gap-2 shrink-0"
        >
          <Play className="h-4 w-4" />
          {t("presentation.present")}
          {slides.length > 0 && (
            <span className="bg-white/20 rounded-full px-1.5 text-xs font-bold">
              {slides.length}
            </span>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Image picker ── */}
        <div className="lg:col-span-3 space-y-3">
          <h2 className="font-semibold text-xs text-muted-foreground uppercase tracking-widest">
            {t("presentation.selectImages")}
          </h2>

          {allImages.length === 0 ? (
            <div className="border-2 border-dashed rounded-xl p-12 text-center text-muted-foreground">
              <Camera className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>{t("presentation.noImages")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {allImages.map((img) => {
                const slideIdx = slides.findIndex(
                  (s) => s.type === "single" && s.imageId === img.id,
                );
                const isSelected = slideIdx >= 0;
                const isUsedElsewhere = !isSelected && usedIds.has(img.id);
                return (
                  <button
                    key={img.id}
                    onClick={() => !isUsedElsewhere && toggleImage(img.id)}
                    disabled={isUsedElsewhere}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all duration-150 ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/30 scale-[0.96]"
                        : isUsedElsewhere
                        ? "border-muted opacity-40 cursor-not-allowed"
                        : "border-transparent hover:border-primary/50 hover:scale-[0.98]"
                    }`}
                  >
                    <img
                      src={imageUrl(img.id)}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <span className="bg-primary text-primary-foreground text-sm font-bold rounded-full h-7 w-7 flex items-center justify-center shadow-lg">
                          {slideIdx + 1}
                        </span>
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
                const mainId =
                  slide.type === "single" ? slide.imageId : slide.beforeId;
                const afterId =
                  slide.type === "compare" ? slide.afterId : null;
                const isPairing = pairingSlideIdx === idx;

                return (
                  <div key={idx}>
                    <Card
                      className={`border transition-colors ${
                        isPairing
                          ? "border-primary/50 bg-primary/5"
                          : "border-muted-foreground/15"
                      }`}
                    >
                      <CardContent className="p-2 flex items-center gap-2">
                        {/* Number */}
                        <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">
                          {idx + 1}
                        </span>

                        {/* Thumbnail(s) */}
                        <div className="flex items-center gap-1 shrink-0">
                          <div className="w-14 h-10 rounded-md overflow-hidden bg-muted">
                            <img
                              src={imageUrl(mainId)}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          {afterId && (
                            <>
                              <ChevronsLeftRight className="h-3 w-3 text-muted-foreground" />
                              <div className="w-14 h-10 rounded-md overflow-hidden bg-muted">
                                <img
                                  src={imageUrl(afterId)}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            </>
                          )}
                        </div>

                        {/* Label */}
                        <div className="flex-1 min-w-0">
                          {slide.type === "compare" ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] gap-1 bg-primary/10 text-primary border-primary/20"
                            >
                              <ArrowLeftRight className="h-2.5 w-2.5" />
                              {t("presentation.compareSlide")}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t("presentation.imageSlide")}
                            </span>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveSlide(idx, -1)}
                            disabled={idx === 0}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveSlide(idx, 1)}
                            disabled={idx === slides.length - 1}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          {/* Compare toggle */}
                          {slide.type === "single" ? (
                            <Button
                              variant={isPairing ? "secondary" : "ghost"}
                              size="icon"
                              className="h-7 w-7 text-primary hover:bg-primary/10"
                              onClick={() =>
                                setPairingSlideIdx(isPairing ? null : idx)
                              }
                              title={t("presentation.addCompare")}
                            >
                              <ArrowLeftRight className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => removeCompare(idx)}
                              title={t("presentation.removeCompare")}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => removeSlide(idx)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Inline "after" image picker */}
                    {isPairing && (
                      <div className="mt-1.5 p-3 bg-muted/60 rounded-xl border border-primary/25 space-y-2">
                        <p className="text-xs font-semibold text-primary">
                          {t("presentation.selectAfterImage")}
                        </p>
                        {availableForPairing.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {t("presentation.noImagesForPair")}
                          </p>
                        ) : (
                          <div className="grid grid-cols-5 gap-1.5">
                            {availableForPairing.map((img) => (
                              <button
                                key={img.id}
                                onClick={() => selectPairImage(idx, img.id)}
                                className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary hover:scale-105 transition-all"
                              >
                                <img
                                  src={imageUrl(img.id)}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
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
