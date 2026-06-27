import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  ChevronLeft,
  Trash2,
  BarChart2,
  MapPin,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Loader2,
  Calendar,
  Ruler,
} from "lucide-react";
import { format } from "date-fns";

interface TracingDetail {
  id: number;
  patientId: number;
  imageId: number | null;
  templateId: number | null;
  templateName: string | null;
  pxPerMm: string | null;
  name: string | null;
  createdAt: string;
  points: { id: number; landmarkLabel: string; x: string; y: string }[];
  results: { id: number; measurementName: string; value: string | null; unit: string }[];
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

interface LandmarkDef {
  label: string;
  name: string;
  description: string | null;
  displayOrder: number;
}

interface PlacedPoint {
  label: string;
  x: number;
  y: number;
  name?: string;
}

const LM_RADIUS = 7;
const LM_COLOR = "#818cf8";

function screenToImg(sx: number, sy: number, cw: number, ch: number, scale: number, panX: number, panY: number) {
  return { x: (sx - cw / 2 - panX) / scale, y: (sy - ch / 2 - panY) / scale };
}

function imgToScreen(ix: number, iy: number, cw: number, ch: number, scale: number, panX: number, panY: number) {
  return { x: ix * scale + cw / 2 + panX, y: iy * scale + ch / 2 + panY };
}

function drawMeasurementOverlays(
  ctx: CanvasRenderingContext2D,
  measurements: MeasurementDef[],
  placed: PlacedPoint[],
  scale: number,
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
    ctx.strokeStyle = "#f472b6";
    ctx.lineWidth = lw;
    ctx.globalAlpha = 0.55;

    if (m.type === "line" && p1 && p2) {
      ctx.setLineDash([5 / scale, 5 / scale]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    } else if (m.type === "angle" && p1 && p2 && p3) {
      ctx.setLineDash([5 / scale, 5 / scale]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const r = 22 / scale;
      const a1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
      const a2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, r, Math.min(a1, a2), Math.max(a1, a2));
      ctx.stroke();
    } else if (m.type === "line_angle" && p1 && p2 && p3 && p4) {
      ctx.setLineDash([5 / scale, 5 / scale]);
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
      ctx.setLineDash([5 / scale, 5 / scale]);
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.stroke();
      ctx.setLineDash([]);
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
  placed: PlacedPoint[],
  measurements: MeasurementDef[],
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

  drawMeasurementOverlays(ctx, measurements, placed, scale);

  for (const pt of placed) {
    const r = LM_RADIUS / scale;
    const fs = 11 / scale;
    const lw = 1.5 / scale;

    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = LM_COLOR + "cc";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = lw;
    ctx.stroke();

    ctx.font = `bold ${fs}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(pt.label, pt.x, pt.y);
    ctx.restore();
  }

  ctx.restore();
}

export default function CephalometricsTracing() {
  const { t } = useTranslation();
  const [, params] = useRoute("/cephalometrics/tracings/:id");
  const tracingId = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showDelete, setShowDelete] = useState(false);
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const { data: tracing, isLoading } = useQuery<TracingDetail>({
    queryKey: ["ceph-tracing", tracingId],
    queryFn: () => customFetch<TracingDetail>(`/api/ceph/tracings/${tracingId}`),
    enabled: !!tracingId,
  });

  const { data: templateDetail } = useQuery<{ landmarks: LandmarkDef[]; measurements: MeasurementDef[] }>({
    queryKey: ["ceph-template-detail", tracing?.templateId],
    queryFn: () => customFetch<{ landmarks: LandmarkDef[]; measurements: MeasurementDef[] }>(`/api/ceph/templates/${tracing!.templateId}`),
    enabled: !!tracing?.templateId,
  });

  const deleteTracingMutation = useMutation({
    mutationFn: () =>
      customFetch<void>(`/api/ceph/tracings/${tracingId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ceph-tracings-patient"] });
      toast({ title: t("ceph.trace.deleted") });
      setLocation(tracing?.patientId ? `/patients/${tracing.patientId}` : "/patients");
    },
    onError: () => {
      toast({ variant: "destructive", title: t("ceph.trace.deleteFailed") });
    },
  });

  const placed: PlacedPoint[] = (tracing?.points ?? []).map((p) => {
    const lmDef = templateDetail?.landmarks.find((l) => l.label === p.landmarkLabel);
    return {
      label: p.landmarkLabel,
      x: parseFloat(p.x),
      y: parseFloat(p.y),
      name: lmDef?.name,
    };
  });

  useEffect(() => {
    if (!tracing?.imageId) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `/api/images/${tracing.imageId}/file`;
    img.onload = () => {
      imgRef.current = img;
      if (canvasRef.current) {
        const cw = canvasRef.current.width;
        const ch = canvasRef.current.height;
        const s = Math.min(cw / img.naturalWidth, ch / img.naturalHeight) * 0.9;
        setScale(s);
        setPanX(0);
        setPanY(0);
      }
      doRender();
    };
  }, [tracing?.imageId]);

  const measurements = templateDetail?.measurements ?? [];

  function doRender() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderCanvas(canvas, imgRef.current, scale, panX, panY, placed, measurements);
  }

  useEffect(() => {
    doRender();
  }, [scale, panX, panY, placed.length, measurements.length]);

  useEffect(() => {
    function handleResize() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      doRender();
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

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button === 1 || e.altKey) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      setIsPanning(true);
      setPanStart({
        mx: (e.clientX - rect.left) * scaleX,
        my: (e.clientY - rect.top) * scaleY,
        ox: panX,
        oy: panY,
      });
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isPanning && panStart) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      setPanX(panStart.ox + (mx - panStart.mx));
      setPanY(panStart.oy + (my - panStart.my));
    }
  }

  function handleMouseUp() {
    setIsPanning(false);
    setPanStart(null);
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.max(0.05, Math.min(20, s * delta)));
  }

  function handleResetView() {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (img && canvas && img.naturalWidth > 0) {
      const s = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight) * 0.9;
      setScale(s);
      setPanX(0);
      setPanY(0);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!tracing) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t("ceph.trace.notFound")}
      </div>
    );
  }

  const pxPerMm = tracing.pxPerMm ? parseFloat(tracing.pxPerMm) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-2 shrink-0">
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link href={`/patients/${tracing.patientId}`}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">
            {t("ceph.trace.resultTitle")}
          </h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {tracing.templateName && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {tracing.templateName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(tracing.createdAt), "MMM d, yyyy")}
            </span>
            {pxPerMm && (
              <span className="flex items-center gap-1">
                <Ruler className="h-3 w-3" />
                {pxPerMm.toFixed(2)} px/mm
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 border rounded-md">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale((s) => Math.min(20, s * 1.2))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale((s) => Math.max(0.05, s * 0.8))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleResetView}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setShowDelete(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div ref={containerRef} className="flex-1 bg-neutral-900 relative">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />
        </div>

        {/* Side panel */}
        <div className="w-72 border-l bg-card flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Landmarks */}
            {placed.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {t("ceph.trace.landmarksLabel")} ({placed.length})
                </h3>
                <div className="space-y-0.5">
                  {placed.map((p) => (
                    <div key={p.label} className="flex items-center gap-2 text-xs px-1 py-0.5">
                      <Badge variant="outline" className="font-mono text-xs px-1 py-0">
                        {p.label}
                      </Badge>
                      <span className="text-muted-foreground truncate flex-1">{t(`ceph.lm.${p.name ?? ""}.name` as any, p.name ?? p.label)}</span>
                      <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0">
                        {Math.round(p.x)},{Math.round(p.y)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Measurements */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BarChart2 className="h-3.5 w-3.5" />
                {t("ceph.trace.measurementsLabel")} ({tracing.results.length})
              </h3>

              {tracing.results.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">{t("ceph.trace.noResults")}</p>
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
                      {tracing.results.map((r) => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-2 py-1.5">{t(`ceph.meas.${r.measurementName}` as any, r.measurementName)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {r.value !== null
                              ? `${parseFloat(r.value).toFixed(2)} ${r.unit}`
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ceph.trace.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("ceph.trace.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTracingMutation.mutate()}
              disabled={deleteTracingMutation.isPending}
            >
              {deleteTracingMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
