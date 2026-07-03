import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch, useGetImage, getGetImageQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  Ruler,
  MapPin,
  BarChart2,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Loader2,
} from "lucide-react";

interface CephTemplate {
  id: number;
  name: string;
  description: string | null;
  landmarkCount: number;
  measurementCount: number;
}

interface LandmarkDef {
  id: number;
  label: string;
  name: string;
  description: string | null;
  displayOrder: number;
}

interface MeasurementDef {
  id: number;
  name: string;
  type: "line" | "angle" | "perpendicular" | "line_angle";
  p1Label: string | null;
  p2Label: string | null;
  p3Label: string | null;
  p4Label: string | null;
  quadrant: number | null;
  displayOrder: number;
}

interface CephTemplateDetail {
  id: number;
  name: string;
  landmarks: LandmarkDef[];
  measurements: MeasurementDef[];
}

interface PlacedPoint {
  label: string;
  x: number;
  y: number;
}

interface MeasurementResult {
  id: number;
  measurementName: string;
  value: string | null;
  unit: string;
}

type Step = "setup" | "calibrate" | "landmarks" | "results";

const LM_RADIUS = 4;
const HIT_RADIUS = 18;
const CAL_COLOR = "#f59e0b";
const LM_COLOR = "#3b82f6";
const LM_ACTIVE_COLOR = "#22c55e";
const LM_PLACED_COLOR = "#818cf8";

const PHASE_COLORS: Record<string, string> = {
  initial:   "#3b82f6",
  progress:  "#f59e0b",
  final:     "#22c55e",
  retention: "#a855f7",
};

function screenToImg(sx: number, sy: number, cw: number, ch: number, scale: number, panX: number, panY: number) {
  return {
    x: (sx - cw / 2 - panX) / scale,
    y: (sy - ch / 2 - panY) / scale,
  };
}

function imgToScreen(ix: number, iy: number, cw: number, ch: number, scale: number, panX: number, panY: number) {
  return {
    x: ix * scale + cw / 2 + panX,
    y: iy * scale + ch / 2 + panY,
  };
}

function drawCalibration(
  ctx: CanvasRenderingContext2D,
  calPoints: { x: number; y: number }[],
  scale: number,
) {
  if (calPoints.length === 0) return;
  const lw = 2 / scale;
  const r = 6 / scale;

  ctx.save();
  ctx.strokeStyle = CAL_COLOR;
  ctx.fillStyle = CAL_COLOR;
  ctx.lineWidth = lw;

  if (calPoints.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(calPoints[0].x, calPoints[0].y);
    ctx.lineTo(calPoints[1].x, calPoints[1].y);
    ctx.stroke();
  }

  for (const pt of calPoints) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  placed: PlacedPoint[],
  activeLabel: string | null,
  scale: number,
  dragIdx: number | null,
  dotColor: string,
) {
  for (let i = 0; i < placed.length; i++) {
    const pt = placed[i];
    const isDrag = i === dragIdx;
    const color = isDrag ? LM_ACTIVE_COLOR : dotColor;

    const r = LM_RADIUS / scale;
    const lw = 1.5 / scale;

    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = isDrag ? LM_ACTIVE_COLOR : "#fff";
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.restore();
  }
}

function drawMeasurementOverlays(
  ctx: CanvasRenderingContext2D,
  measurements: MeasurementDef[],
  placed: PlacedPoint[],
  scale: number,
  lineColor: string,
) {
  if (measurements.length === 0 || placed.length === 0) return;
  const ptMap = new Map(placed.map((p) => [p.label, p]));
  const lw = 1.5 / scale;

  for (const m of measurements) {
    const p1 = m.p1Label ? ptMap.get(m.p1Label) : null;
    const p2 = m.p2Label ? ptMap.get(m.p2Label) : null;
    const p3 = m.p3Label ? ptMap.get(m.p3Label) : null;
    const p4 = m.p4Label ? ptMap.get(m.p4Label) : null;

    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lw;
    ctx.globalAlpha = 0.7;

    if (m.type === "line" && p1 && p2) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    } else if (m.type === "angle" && p1 && p2 && p3) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.stroke();
      const r = 22 / scale;
      const a1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
      const a2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, r, Math.min(a1, a2), Math.max(a1, a2));
      ctx.stroke();
    } else if (m.type === "line_angle" && p1 && p2 && p3 && p4) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.stroke();
    } else if (m.type === "perpendicular" && p1 && p2 && p3) {
      const dx = p3.x - p2.x;
      const dy = p3.y - p2.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? ((p1.x - p2.x) * dx + (p1.y - p2.y) * dy) / len2 : 0;
      const foot = { x: p2.x + t * dx, y: p2.y + t * dy };
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(foot.x, foot.y);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function renderCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement | null,
  scale: number,
  panX: number,
  panY: number,
  step: Step,
  calPoints: { x: number; y: number }[],
  placed: PlacedPoint[],
  activeLabel: string | null,
  dragIdx: number | null,
  measurements: MeasurementDef[],
  phaseColor: string,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cw = canvas.width;
  const ch = canvas.height;

  ctx.clearRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(cw / 2 + panX, ch / 2 + panY);
  ctx.scale(scale, scale);

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  }

  if (step === "calibrate" || step === "landmarks" || step === "results") {
    drawCalibration(ctx, calPoints, scale);
  }

  if (step === "results") {
    drawMeasurementOverlays(ctx, measurements, placed, scale, phaseColor);
  }

  if (step === "landmarks" || step === "results") {
    drawLandmarks(ctx, placed, activeLabel, scale, dragIdx, phaseColor);
  }

  ctx.restore();
}

export default function CephalometricsTrace() {
  const { t } = useTranslation();
  const [, params] = useRoute("/cephalometrics/trace/:imageId");
  const imageId = parseInt(params?.imageId || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("setup");
  const [tracingId, setTracingId] = useState<number | null>(null);
  const [recordPhase, setRecordPhase] = useState("initial");
  const [templateDetail, setTemplateDetail] = useState<CephTemplateDetail | null>(null);
  const [calPoints, setCalPoints] = useState<{ x: number; y: number }[]>([]);
  const [mmInput, setMmInput] = useState("");
  const [pxPerMm, setPxPerMm] = useState<number | null>(null);
  const [placed, setPlaced] = useState<PlacedPoint[]>([]);
  const savedPlacedRef = useRef<string>("[]");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragStartMouse, setDragStartMouse] = useState<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const [results, setResults] = useState<MeasurementResult[]>([]);
  const [computing, setComputing] = useState(false);
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const { data: imageData, isLoading: imageLoading } = useGetImage(imageId, {
    query: { enabled: !!imageId, queryKey: getGetImageQueryKey(imageId) },
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<CephTemplate[]>({
    queryKey: ["ceph-templates-list"],
    queryFn: () => customFetch<CephTemplate[]>("/api/ceph/templates"),
  });

  const createTracingMutation = useMutation({
    mutationFn: (data: {
      patientId: number;
      imageId: number;
      templateId: number;
      templateName: string;
      recordPhase: string;
    }) => customFetch<{ id: number }>("/api/ceph/tracings", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: (tracing) => {
      setTracingId(tracing.id);
      setStep("calibrate");
    },
    onError: () => {
      toast({ variant: "destructive", title: t("ceph.trace.createFailed") });
    },
  });

  const patchTracingMutation = useMutation({
    mutationFn: (data: { pxPerMm: number }) =>
      customFetch<void>(`/api/ceph/tracings/${tracingId}`, {
        method: "PATCH",
        body: JSON.stringify({ pxPerMm: data.pxPerMm }),
      }),
  });

  const putPointsMutation = useMutation({
    mutationFn: (points: PlacedPoint[]) =>
      customFetch<void>(`/api/ceph/tracings/${tracingId}/points`, {
        method: "PUT",
        body: JSON.stringify({
          points: points.map((p) => ({ landmarkLabel: p.label, x: p.x, y: p.y })),
        }),
      }),
    onSuccess: (_data, points) => {
      savedPlacedRef.current = JSON.stringify(points);
    },
  });

  const hasUnsavedWork = step === "landmarks" && JSON.stringify(placed) !== savedPlacedRef.current;

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!hasUnsavedWork) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedWork]);

  function confirmLeaveIfDirty(e: React.MouseEvent) {
    if (hasUnsavedWork && !window.confirm(t("ceph.trace.unsavedConfirm"))) {
      e.preventDefault();
    }
  }

  const computeMutation = useMutation({
    mutationFn: () =>
      customFetch<MeasurementResult[]>(`/api/ceph/tracings/${tracingId}/compute`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: (data) => {
      setResults(data);
      setStep("results");
      setComputing(false);
    },
    onError: () => {
      setComputing(false);
      toast({ variant: "destructive", title: t("ceph.trace.computeFailed") });
    },
  });

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `/api/images/${imageId}/file`;
    img.onload = () => {
      imgRef.current = img;
      if (containerRef.current && canvasRef.current) {
        fitImage(img, canvasRef.current.width, canvasRef.current.height);
      }
      scheduleRender();
    };
  }, [imageId]);

  function fitImage(img: HTMLImageElement, cw: number, ch: number) {
    const scaleX = cw / img.naturalWidth;
    const scaleY = ch / img.naturalHeight;
    const s = Math.min(scaleX, scaleY) * 0.9;
    setScale(s);
    setPanX(0);
    setPanY(0);
  }

  function scheduleRender() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(doRender);
  }

  const landmarks = templateDetail?.landmarks ?? [];
  const nextLandmark = landmarks.find((lm) => !placed.some((p) => p.label === lm.label)) ?? null;
  const allPlaced = landmarks.length > 0 && placed.length >= landmarks.length;

  const measurements = templateDetail?.measurements ?? [];

  const doRender = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const phaseColor = PHASE_COLORS[recordPhase] ?? PHASE_COLORS.initial;
    renderCanvas(
      canvas,
      imgRef.current,
      scale,
      panX,
      panY,
      step,
      calPoints,
      placed,
      nextLandmark?.label ?? null,
      dragIdx,
      measurements,
      phaseColor,
    );
  }, [scale, panX, panY, step, calPoints, placed, dragIdx, nextLandmark, measurements, recordPhase]);

  useEffect(() => {
    scheduleRender();
  }, [scale, panX, panY, step, calPoints, placed, dragIdx, nextLandmark, measurements, recordPhase]);

  useEffect(() => {
    function handleResize() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      scheduleRender();
    }
    handleResize();
    const ro = new ResizeObserver(handleResize);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", handleResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Re-fit the image whenever the step changes (side panel appears/disappears)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      fitImage(img, canvas.width, canvas.height);
    } else {
      scheduleRender();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function hitTestLandmark(ix: number, iy: number): number {
    const cw = canvasRef.current?.width ?? 0;
    const ch = canvasRef.current?.height ?? 0;
    for (let i = placed.length - 1; i >= 0; i--) {
      const { sx, sy } = { sx: imgToScreen(placed[i].x, placed[i].y, cw, ch, scale, panX, panY).x, sy: imgToScreen(placed[i].x, placed[i].y, cw, ch, scale, panX, panY).y };
      const ssX = imgToScreen(placed[i].x, placed[i].y, cw, ch, scale, panX, panY).x;
      const ssY = imgToScreen(placed[i].x, placed[i].y, cw, ch, scale, panX, panY).y;
      const d = Math.hypot(ix - ssX, iy - ssY);
      if (d <= HIT_RADIUS) return i;
    }
    return -1;
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const cw = canvas.width;
    const ch = canvas.height;

    if (e.button === 1 || e.altKey) {
      setIsPanning(true);
      setPanStart({ mx, my, ox: panX, oy: panY });
      return;
    }

    if (step === "calibrate") {
      const imgPt = screenToImg(mx, my, cw, ch, scale, panX, panY);
      if (calPoints.length < 2) {
        setCalPoints((prev) => [...prev, imgPt]);
      } else {
        setCalPoints([imgPt]);
        setMmInput("");
      }
      return;
    }

    if (step === "landmarks") {
      const hitIdx = hitTestLandmark(mx, my);
      if (hitIdx >= 0) {
        setDragIdx(hitIdx);
        const imgPt = screenToImg(mx, my, cw, ch, scale, panX, panY);
        setDragStartMouse({ mx, my, ox: placed[hitIdx].x, oy: placed[hitIdx].y });
      } else if (nextLandmark) {
        const imgPt = screenToImg(mx, my, cw, ch, scale, panX, panY);
        setPlaced((prev) => [...prev, { label: nextLandmark.label, x: imgPt.x, y: imgPt.y }]);
      }
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    if (isPanning && panStart) {
      setPanX(panStart.ox + (mx - panStart.mx));
      setPanY(panStart.oy + (my - panStart.my));
      return;
    }

    if (dragIdx !== null && dragStartMouse) {
      const cw = canvasRef.current!.width;
      const ch = canvasRef.current!.height;
      const imgPt = screenToImg(mx, my, cw, ch, scale, panX, panY);
      setPlaced((prev) => prev.map((p, i) => i === dragIdx ? { ...p, x: imgPt.x, y: imgPt.y } : p));
    }
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
    }
    if (dragIdx !== null) {
      setDragIdx(null);
      setDragStartMouse(null);
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.max(0.05, Math.min(20, s * delta)));
  }

  function handleResetView() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (canvas && img && img.naturalWidth > 0) {
      fitImage(img, canvas.width, canvas.height);
    }
  }

  function handleApplyCalibration() {
    if (calPoints.length < 2) return;
    const mm = parseFloat(mmInput);
    if (!mm || mm <= 0) {
      toast({ variant: "destructive", title: t("ceph.trace.invalidMm") });
      return;
    }
    const dist = Math.hypot(calPoints[1].x - calPoints[0].x, calPoints[1].y - calPoints[0].y);
    const px = dist / mm;
    setPxPerMm(px);
    patchTracingMutation.mutate({ pxPerMm: px });
    toast({ title: t("ceph.trace.calibratedOk", { value: px.toFixed(2) }) });
    setStep("landmarks");
  }

  async function handleCompute() {
    if (!tracingId) return;
    setComputing(true);
    try {
      await putPointsMutation.mutateAsync(placed);
      computeMutation.mutate();
    } catch {
      toast({ title: t("ceph.trace.computeFailed"), variant: "destructive" });
    } finally {
      setComputing(false);
    }
  }

  function handleSelectTemplate(tmpl: CephTemplate) {
    if (!imageData) return;
    customFetch<CephTemplateDetail>(`/api/ceph/templates/${tmpl.id}`).then((detail) => {
      setTemplateDetail(detail);
      createTracingMutation.mutate({
        patientId: (imageData as any).patientId,
        imageId,
        templateId: tmpl.id,
        templateName: tmpl.name,
        recordPhase,
      });
    });
  }

  function handleDone() {
    if (tracingId) {
      setLocation(`/cephalometrics/tracings/${tracingId}`);
    } else {
      setLocation(`/patients/${(imageData as any)?.patientId ?? ""}`);
    }
  }

  const calDist = calPoints.length === 2
    ? Math.hypot(calPoints[1].x - calPoints[0].x, calPoints[1].y - calPoints[0].y)
    : null;

  const steps = [
    { key: "calibrate", label: t("ceph.trace.stepCalibrate"), icon: Ruler },
    { key: "landmarks", label: t("ceph.trace.stepLandmarks"), icon: MapPin },
    { key: "results", label: t("ceph.trace.stepResults"), icon: BarChart2 },
  ] as const;

  const patientId = (imageData as any)?.patientId;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-2 shrink-0">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          asChild
        >
          <Link href={patientId ? `/patients/${patientId}` : "/patients"} onClick={confirmLeaveIfDirty}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">
            {t("ceph.trace.title")}
            {templateDetail && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {templateDetail.name}
              </span>
            )}
          </h1>
        </div>

        {/* Step indicator */}
        {step !== "setup" && (
          <div className="flex items-center gap-1">
            {steps.map((s, i) => {
              const stepOrder = ["calibrate", "landmarks", "results"];
              const currentIdx = stepOrder.indexOf(step);
              const thisIdx = stepOrder.indexOf(s.key);
              const done = currentIdx > thisIdx;
              const active = currentIdx === thisIdx;
              return (
                <div key={s.key} className="flex items-center gap-1">
                  <div
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
                      active && "bg-primary text-primary-foreground",
                      done && "bg-primary/20 text-primary",
                      !active && !done && "text-muted-foreground",
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <s.icon className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-3 h-px bg-border" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Zoom controls */}
        {step !== "setup" && (
          <div className="flex items-center gap-1 border rounded-md">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScale((s) => Math.min(20, s * 1.2))}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScale((s) => Math.max(0.05, s * 0.8))}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleResetView}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas area */}
        <div ref={containerRef} className="flex-1 bg-neutral-900 relative">
          {(step === "setup" || imageLoading) && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              {imageLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : (
                <p>{t("ceph.trace.selectTemplateHint")}</p>
              )}
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{
              cursor:
                step === "calibrate" ? "crosshair"
                : step === "landmarks" ? (dragIdx !== null ? "grabbing" : "crosshair")
                : "default",
              display: step === "setup" ? "none" : "block",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />

          {step !== "setup" && (
            <div className="absolute bottom-3 left-3 text-xs text-white/50 pointer-events-none select-none">
              {t("ceph.trace.zoomHint")}
            </div>
          )}
        </div>

        {/* Side panel */}
        {step !== "setup" && (
          <div className="w-72 border-l bg-card flex flex-col shrink-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* CALIBRATE STEP */}
              {step === "calibrate" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Ruler className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold text-sm">{t("ceph.trace.stepCalibrate")}</h2>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t("ceph.trace.calibrateHint")}
                  </p>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("ceph.trace.calPoint")} 1</span>
                      <span className={calPoints.length >= 1 ? "text-amber-500 font-medium" : "text-muted-foreground/50"}>
                        {calPoints.length >= 1 ? "✓ placed" : "click on image"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("ceph.trace.calPoint")} 2</span>
                      <span className={calPoints.length >= 2 ? "text-amber-500 font-medium" : "text-muted-foreground/50"}>
                        {calPoints.length >= 2 ? "✓ placed" : "click on image"}
                      </span>
                    </div>
                    {calDist !== null && (
                      <div className="flex justify-between pt-1 border-t border-amber-500/20">
                        <span className="text-muted-foreground">{t("ceph.trace.lineLength")}</span>
                        <span className="font-mono text-amber-500">{Math.round(calDist)} px</span>
                      </div>
                    )}
                  </div>

                  {calPoints.length === 2 && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">{t("ceph.trace.enterMm")}</label>
                      <Input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={mmInput}
                        onChange={(e) => setMmInput(e.target.value)}
                        placeholder="e.g. 10.0"
                        className="h-8 text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter") handleApplyCalibration(); }}
                        autoFocus
                      />
                      <Button
                        className="w-full h-8 text-sm"
                        onClick={handleApplyCalibration}
                        disabled={!mmInput || parseFloat(mmInput) <= 0}
                      >
                        {t("ceph.trace.applyCalibration")}
                      </Button>
                    </div>
                  )}

                  {calPoints.length < 2 && (
                    <p className="text-xs text-muted-foreground/60 italic">
                      {calPoints.length === 0 ? t("ceph.trace.clickFirstPoint") : t("ceph.trace.clickSecondPoint")}
                    </p>
                  )}
                </div>
              )}

              {/* LANDMARKS STEP */}
              {step === "landmarks" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold text-sm">{t("ceph.trace.stepLandmarks")}</h2>
                  </div>

                  {pxPerMm && (
                    <div className="rounded bg-primary/10 px-2 py-1 text-xs text-primary">
                      {t("ceph.trace.scale")}: {pxPerMm.toFixed(2)} px/mm
                    </div>
                  )}

                  {nextLandmark ? (
                    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-1">
                      <div className="text-xs text-muted-foreground">{t("ceph.trace.placeNext")}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs px-1.5">
                          {nextLandmark.label}
                        </Badge>
                        <span className="font-medium text-sm">{t(`ceph.lm.${nextLandmark.name}.name` as any, nextLandmark.name)}</span>
                      </div>
                      {nextLandmark.description && (
                        <p className="text-xs text-muted-foreground mt-1">{t(`ceph.lm.${nextLandmark.name}.desc` as any, nextLandmark.description)}</p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-3 flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      {t("ceph.trace.allPlaced")}
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      {t("ceph.trace.progress")}: {placed.length} / {landmarks.length}
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${landmarks.length > 0 ? (placed.length / landmarks.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {landmarks.map((lm) => {
                      const placedPt = placed.find((p) => p.label === lm.label);
                      const isPlaced = !!placedPt;
                      const isCurrent = nextLandmark?.label === lm.label;
                      return (
                        <div
                          key={lm.label}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1 rounded text-xs",
                            isCurrent && "bg-primary/10 text-primary font-medium",
                            isPlaced && !isCurrent && "text-muted-foreground",
                            !isPlaced && !isCurrent && "text-muted-foreground/40",
                          )}
                        >
                          <span className="font-mono w-6 shrink-0">{lm.label}</span>
                          <span className="truncate flex-1">{t(`ceph.lm.${lm.name}.name` as any, lm.name)}</span>
                          {isPlaced && placedPt && (
                            <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0">
                              {Math.round(placedPt.x)},{Math.round(placedPt.y)}
                            </span>
                          )}
                          {isPlaced && <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />}
                          {isCurrent && <div className="h-1.5 w-1.5 rounded-full bg-primary ml-auto shrink-0" />}
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-xs text-muted-foreground/60 italic">
                    {t("ceph.trace.dragHint")}
                  </p>

                  {placed.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => setPlaced((prev) => prev.slice(0, -1))}
                    >
                      ↩ {t("ceph.trace.undoLandmark")}
                    </Button>
                  )}
                </div>
              )}

              {/* RESULTS STEP */}
              {step === "results" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold text-sm">{t("ceph.trace.stepResults")}</h2>
                  </div>

                  {results.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("ceph.trace.noResults")}</p>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">{t("ceph.trace.measurement")}</th>
                            <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">{t("ceph.trace.value")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((r) => (
                            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="px-2 py-1.5">{t(`ceph.meas.${r.measurementName}` as any, r.measurementName)}</td>
                              <td className="px-2 py-1.5 text-right font-mono">
                                {r.value !== null
                                  ? `${parseFloat(r.value).toFixed(2)} ${r.unit === "degrees" || r.unit === "degree" ? "°" : r.unit}`
                                  : <span className="text-muted-foreground">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Panel footer actions */}
            <div className="border-t p-4 space-y-2 shrink-0">
              {step === "landmarks" && allPlaced && (
                <Button
                  className="w-full"
                  onClick={handleCompute}
                  disabled={computing || computeMutation.isPending || putPointsMutation.isPending}
                >
                  {(computing || computeMutation.isPending) ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("ceph.trace.computing")}
                    </>
                  ) : (
                    <>
                      <BarChart2 className="mr-2 h-4 w-4" />
                      {t("ceph.trace.compute")}
                    </>
                  )}
                </Button>
              )}

              {step === "landmarks" && !allPlaced && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    if (!tracingId || placed.length === 0) return;
                    await putPointsMutation.mutateAsync(placed);
                    toast({ title: t("ceph.trace.progressSaved") });
                  }}
                  disabled={putPointsMutation.isPending || placed.length === 0}
                >
                  {putPointsMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t("ceph.trace.saveProgress")}
                </Button>
              )}

              {step === "results" && (
                <Button className="w-full" onClick={handleDone}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t("ceph.trace.done")}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Template selection dialog */}
      <Dialog open={step === "setup" && !imageLoading} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {t("ceph.trace.selectTemplate")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("ceph.phaseLabel")}</label>
            <div className="grid grid-cols-2 gap-2">
              {(["initial", "progress", "final", "retention"] as const).map((phase) => (
                <button
                  key={phase}
                  type="button"
                  onClick={() => setRecordPhase(phase)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
                    recordPhase === phase
                      ? "border-primary bg-primary/10 font-medium"
                      : "hover:bg-accent",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: PHASE_COLORS[phase] }}
                  />
                  {t(`ceph.phase.${phase}` as any)}
                </button>
              ))}
            </div>
          </div>

          {templatesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("ceph.trace.noTemplates")}
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  className="w-full flex items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm hover:bg-accent hover:border-primary/40 transition-colors"
                  onClick={() => handleSelectTemplate(tmpl)}
                  disabled={createTracingMutation.isPending}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{tmpl.name}</div>
                    {tmpl.description && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{t(`ceph.tmpl.${tmpl.name.split(" ")[0].toLowerCase()}.desc` as any, tmpl.description)}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {t("ceph.landmarkCountLabel", { count: tmpl.landmarkCount })}
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-xs text-muted-foreground">
                        {t("ceph.measurementCountLabel", { count: tmpl.measurementCount })}
                      </span>
                    </div>
                  </div>
                  {createTracingMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              asChild
            >
              <Link href={patientId ? `/patients/${patientId}` : "/patients"} onClick={confirmLeaveIfDirty}>
                {t("common.cancel")}
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
