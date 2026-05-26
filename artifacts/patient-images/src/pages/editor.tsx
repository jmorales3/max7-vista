import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { uploadPatientImage } from "@/lib/upload";
import {
  useGetImage,
  getGetImageQueryKey,
  useUpdateImage,
  useDeleteImage,
  useReplaceImageFile,
  useListPatients,
  useListPatientImages,
  getListImagesQueryKey,
  getListPatientImagesQueryKey,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Save,
  Copy,
  MousePointer2,
  PenTool,
  Type as TypeIcon,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  Eraser,
  Crop,
  Check,
  MoveRight,
  Circle as CircleIcon,
  Minus,
  Scissors,
  Clipboard,
  X,
  Pipette,
  Hand,
  Wand2,
  RectangleHorizontal,
  Lasso,
  Ruler,
  Compass,
  Layers,
  Minimize2,
  Move,
  Bookmark,
} from "lucide-react";
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

type Tool = "pointer" | "pen" | "text" | "eraser" | "crop" | "arrow" | "circle" | "straightline" | "select" | "eyedropper" | "hand" | "smooth" | "ruler" | "angle" | "overlay";

interface DrawLine {
  type: "line";
  points: number[];
  color: string;
  width: number;
}

interface DrawText {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  id: string;
}

interface DrawArrow {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  id: string;
}

interface DrawCircle {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
  color: string;
  width: number;
  id: string;
}

interface DrawStraightLine {
  type: "straightline";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  id: string;
}

interface DrawRuler {
  type: "ruler";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  pxPerMm: number | null;
  id: string;
}

interface DrawAngle {
  type: "angle";
  vx: number;
  vy: number;
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
  color: string;
  id: string;
}

type Annotation = DrawLine | DrawText | DrawArrow | DrawCircle | DrawStraightLine | DrawRuler | DrawAngle;

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  color: string,
  width: number,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(14, width * 5);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

function drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation, scale: number = 1) {
  if (ann.type === "line") {
    if (ann.points.length < 4) return;
    ctx.beginPath();
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = ann.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(ann.points[0], ann.points[1]);
    for (let i = 2; i < ann.points.length; i += 2) {
      ctx.lineTo(ann.points[i], ann.points[i + 1]);
    }
    ctx.stroke();
  } else if (ann.type === "text") {
    ctx.font = `bold ${ann.size}px sans-serif`;
    ctx.fillStyle = ann.color;
    ctx.fillText(ann.text, ann.x, ann.y);
  } else if (ann.type === "arrow") {
    drawArrow(ctx, ann.x1, ann.y1, ann.x2, ann.y2, ann.color, ann.width);
  } else if (ann.type === "circle") {
    ctx.beginPath();
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = ann.width;
    ctx.arc(ann.cx, ann.cy, ann.r, 0, 2 * Math.PI);
    ctx.stroke();
  } else if (ann.type === "straightline") {
    ctx.beginPath();
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = ann.width;
    ctx.lineCap = "round";
    ctx.moveTo(ann.x1, ann.y1);
    ctx.lineTo(ann.x2, ann.y2);
    ctx.stroke();
  } else if (ann.type === "ruler") {
    const { x1, y1, x2, y2, color, pxPerMm: annPxPerMm } = ann;
    const lineAngle = Math.atan2(y2 - y1, x2 - x1);
    const perpAngle = lineAngle + Math.PI / 2;
    const tickLen = 8 / scale;
    const lw = 1.5 / scale;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    for (const [px, py] of [[x1, y1], [x2, y2]] as [number, number][]) {
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(perpAngle) * tickLen, py + Math.sin(perpAngle) * tickLen);
      ctx.lineTo(px - Math.cos(perpAngle) * tickLen, py - Math.sin(perpAngle) * tickLen);
      ctx.stroke();
    }
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const label = annPxPerMm != null ? `${(dist / annPxPerMm).toFixed(1)} mm` : `${Math.round(dist)} px`;
    const fontSize = 12 / scale;
    const offsetDist = tickLen + fontSize * 0.9;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const lx = midX + Math.cos(perpAngle) * offsetDist;
    const ly = midY + Math.sin(perpAngle) * offsetDist;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(label).width;
    const pad = 2 / scale;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(lx - tw / 2 - pad, ly - fontSize / 2 - pad, tw + pad * 2, fontSize + pad * 2);
    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  } else if (ann.type === "angle") {
    const { vx, vy, p1x, p1y, p2x, p2y, color } = ann;
    const arm1Len = Math.hypot(p1x - vx, p1y - vy);
    const arm2Len = Math.hypot(p2x - vx, p2y - vy);
    if (arm1Len < 0.5 || arm2Len < 0.5) return;
    const lw = 1.5 / scale;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(p1x, p1y);
    ctx.moveTo(vx, vy);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(vx, vy, 3 / scale, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    const a1 = Math.atan2(p1y - vy, p1x - vx);
    const a2 = Math.atan2(p2y - vy, p2x - vx);
    const arcR = Math.min(24 / scale, arm1Len * 0.38, arm2Len * 0.38);
    let span = ((a2 - a1) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const anticlockwise = span > Math.PI;
    const angleDeg = anticlockwise ? (2 * Math.PI - span) * 180 / Math.PI : span * 180 / Math.PI;
    ctx.beginPath();
    ctx.arc(vx, vy, arcR, a1, a2, anticlockwise);
    ctx.stroke();
    const midAngle = anticlockwise ? a1 - (2 * Math.PI - span) / 2 : a1 + span / 2;
    const labelDist = arcR + 14 / scale;
    const lx = vx + Math.cos(midAngle) * labelDist;
    const ly = vy + Math.sin(midAngle) * labelDist;
    const label = `${angleDeg.toFixed(1)}°`;
    const fontSize = 12 / scale;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(label).width;
    const pad = 2 / scale;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(lx - tw / 2 - pad, ly - fontSize / 2 - pad, tw + pad * 2, fontSize + pad * 2);
    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
}

function renderCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement | null,
  annotations: Annotation[],
  scale: number,
  rotation: number,
  cropRect?: CropRect | null,
  previewAnn?: Annotation | null,
  cutRect?: CropRect | null,
  selectionOverlay?: CropRect | null,
  panOffset?: { x: number; y: number },
  cutPath?: [number, number][] | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const px = panOffset?.x ?? 0;
  const py = panOffset?.y ?? 0;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2 + px, canvas.height / 2 + py);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scale, scale);

  if (img) {
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  }

  const allAnns: Annotation[] = previewAnn ? [...annotations, previewAnn] : annotations;
  for (const ann of allAnns) {
    drawAnnotation(ctx, ann, scale);
  }

  ctx.restore();

  // White "hole" where a selection was cut from
  if (cutPath && cutPath.length > 2) {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(cutPath[0][0], cutPath[0][1]);
    for (let i = 1; i < cutPath.length; i++) ctx.lineTo(cutPath[i][0], cutPath[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (cutRect && cutRect.w > 0 && cutRect.h > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cutRect.x, cutRect.y, cutRect.w, cutRect.h);
  }

  if (cropRect && cropRect.w > 0 && cropRect.h > 0) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    ctx.clip();
    ctx.translate(canvas.width / 2 + px, canvas.height / 2 + py);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    if (img) ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    for (const ann of allAnns) drawAnnotation(ctx, ann, scale);
    ctx.restore();
    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    ctx.setLineDash([]);
    ctx.fillStyle = "#0ea5e9";
    const hs = 7;
    const corners: [number, number][] = [
      [cropRect.x, cropRect.y],
      [cropRect.x + cropRect.w, cropRect.y],
      [cropRect.x, cropRect.y + cropRect.h],
      [cropRect.x + cropRect.w, cropRect.y + cropRect.h],
    ];
    for (const [cx, cy] of corners) {
      ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
    }
    ctx.restore();
  }

  // Dashed selection border (select tool, drawing phase)
  if (selectionOverlay && selectionOverlay.w > 0 && selectionOverlay.h > 0) {
    ctx.save();
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(selectionOverlay.x, selectionOverlay.y, selectionOverlay.w, selectionOverlay.h);
    ctx.setLineDash([]);
    ctx.restore();
  }
}

export default function Editor() {
  const { t } = useTranslation();
  const [, params] = useRoute("/editor/:id");
  const id = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSavingCopy, setIsSavingCopy] = useState(false);
  const [notes, setNotes] = useState("");
  const [tool, setTool] = useState<Tool>("pointer");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const panDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [penColor, setPenColor] = useState("#ff0000");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [textSize, setTextSize] = useState(36);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [selectionRect, setSelectionRect] = useState<CropRect | null>(null);
  const [cutRect, setCutRect] = useState<CropRect | null>(null);
  const [floater, setFloater] = useState<{
    dataUrl: string; x: number; y: number; w: number; h: number;
  } | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState("");
  const [smoothBlur, setSmoothBlur] = useState(8);
  const [pendingSmoothPath, setPendingSmoothPath] = useState<[number, number][] | null>(null);
  const smoothDrawingRef = useRef(false);
  const smoothPathRef = useRef<[number, number][]>([]);
  const [selectMode, setSelectMode] = useState<"rect" | "freehand">("rect");
  const selectPathRef = useRef<[number, number][]>([]);
  const selectDrawingRef = useRef(false);
  const [cutPath, setCutPath] = useState<[number, number][] | null>(null);
  const [pxPerMm, setPxPerMm] = useState<number | null>(() => {
    const v = localStorage.getItem("max7_pxPerMm");
    return v ? parseFloat(v) : null;
  });
  const [calibrating, setCalibrating] = useState(false);
  const [calibratingPx, setCalibratingPx] = useState<number | null>(null);
  const [calibratingMmInput, setCalibratingMmInput] = useState("");
  const rulerStartRef = useRef<[number, number] | null>(null);
  const [angleStep, setAngleStep] = useState(0);
  const anglePointsRef = useRef<[number, number][]>([]);
  const [overlayImageId, setOverlayImageId] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [overlayOffsetX, setOverlayOffsetX] = useState(0);
  const [overlayOffsetY, setOverlayOffsetY] = useState(0);
  const overlayOffsetXRef = useRef(0);
  const overlayOffsetYRef = useRef(0);
  const [overlayScaleCorrection, setOverlayScaleCorrection] = useState(1.0);
  const overlayScaleCorrectionRef = useRef(1.0);
  const overlayImgRef = useRef<HTMLImageElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayScrollRef = useRef<HTMLDivElement | null>(null);
  const overlayDragStartRef = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const [showResizePanel, setShowResizePanel] = useState(false);
  const [resizeRefInput, setResizeRefInput] = useState("");
  const [resizeMode, setResizeMode] = useState(false);
  const [referenceLinePx, setReferenceLinePx] = useState<number | null>(() => {
    const s = localStorage.getItem("max7_refLinePx");
    return s ? parseFloat(s) : null;
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const isDrawingRef = useRef(false);
  const currentLineRef = useRef<number[]>([]);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);

  const arrowStartRef = useRef<[number, number] | null>(null);
  const circleStartRef = useRef<[number, number] | null>(null);
  const straightLineStartRef = useRef<[number, number] | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const preCutStateRef = useRef<{
    imgSrc: string;
    annotations: Annotation[];
    scale: number;
    rotation: number;
  } | null>(null);
  const floaterDragRef = useRef<{
    startX: number; startY: number; origX: number; origY: number;
  } | null>(null);

  const draggingTextRef = useRef<{
    id: string;
    origX: number;
    origY: number;
    mouseStartX: number;
    mouseStartY: number;
  } | null>(null);

  const annotationsRef = useRef<Annotation[]>([]);
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);

  const { data: image, isLoading } = useGetImage(id, {
    query: { enabled: !!id, queryKey: getGetImageQueryKey(id) },
  });

  const { data: patients } = useListPatients({}, {
    query: { queryKey: getListPatientsQueryKey() },
  });

  const { data: patientImages = [] } = useListPatientImages(
    image?.patientId ?? 0,
    { query: { enabled: !!image?.patientId, queryKey: getListPatientImagesQueryKey(image?.patientId ?? 0) } },
  );

  useEffect(() => {
    if (!id) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `/api/images/${id}/file`;
    img.onload = () => {
      imgRef.current = img;
      resizeCanvas();
    };
  }, [id]);

  useEffect(() => {
    if (image?.notes) setNotes(image.notes);
    if (image?.annotation) {
      try {
        const parsed = JSON.parse(image.annotation);
        if (Array.isArray(parsed)) setAnnotations(parsed);
      } catch {
        /* ignore */
      }
    }
  }, [image]);

  const redrawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = overlayImgRef.current;
    if (!img) return;
    const { x: px, y: py } = panOffsetRef.current;
    ctx.save();
    ctx.globalAlpha = overlayOpacity;
    ctx.translate(canvas.width / 2 + px + overlayOffsetXRef.current, canvas.height / 2 + py + overlayOffsetYRef.current);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale * overlayScaleCorrectionRef.current, scale * overlayScaleCorrectionRef.current);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
  }, [overlayOpacity, rotation, scale]);

  const handleOverlayPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    overlayDragStartRef.current = {
      mx: e.clientX,
      my: e.clientY,
      ox: overlayOffsetXRef.current,
      oy: overlayOffsetYRef.current,
    };
  }, []);

  const handleOverlayPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!overlayDragStartRef.current) return;
    const dx = e.clientX - overlayDragStartRef.current.mx;
    const dy = e.clientY - overlayDragStartRef.current.my;
    const newX = overlayDragStartRef.current.ox + Math.round(dx);
    const newY = overlayDragStartRef.current.oy + Math.round(dy);
    overlayOffsetXRef.current = newX;
    overlayOffsetYRef.current = newY;
    setOverlayOffsetX(newX);
    setOverlayOffsetY(newY);
    redrawOverlay();
  }, [redrawOverlay]);

  const handleOverlayPointerUp = useCallback(() => {
    overlayDragStartRef.current = null;
  }, []);

  useEffect(() => {
    overlayOffsetXRef.current = 0;
    overlayOffsetYRef.current = 0;
    overlayScaleCorrectionRef.current = 1.0;
    setOverlayOffsetX(0);
    setOverlayOffsetY(0);
    setOverlayScaleCorrection(1.0);
    if (!overlayImageId) {
      overlayImgRef.current = null;
      redrawOverlay();
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `/api/images/${overlayImageId}/file`;
    img.onload = () => {
      overlayImgRef.current = img;
      redrawOverlay();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayImageId]); // redrawOverlay intentionally excluded — offset reset must only trigger on image change

  useEffect(() => {
    redrawOverlay();
  }, [redrawOverlay]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    if (cursorCanvasRef.current) {
      cursorCanvasRef.current.width = container.offsetWidth;
      cursorCanvasRef.current.height = container.offsetHeight;
    }
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = container.offsetWidth;
      overlayCanvasRef.current.height = container.offsetHeight;
    }
    renderCanvas(canvas, imgRef.current, annotationsRef.current, scale, rotation, cropRect, null, cutRect, selectionRect ?? undefined, panOffsetRef.current, cutPath);
    redrawOverlay();
  }, [scale, rotation, cropRect, cutRect, selectionRect, cutPath, redrawOverlay]);

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderCanvas(canvas, imgRef.current, annotations, scale, rotation, cropRect, null, cutRect, selectionRect ?? undefined, panOffset, cutPath);
    redrawOverlay();
  }, [annotations, scale, rotation, cropRect, cutRect, selectionRect, panOffset, cutPath, redrawOverlay]);

  useEffect(() => {
    const observer = new ResizeObserver(resizeCanvas);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  function getCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left - canvas.width / 2 - panOffsetRef.current.x) / scale;
    const cy = (e.clientY - rect.top - canvas.height / 2 - panOffsetRef.current.y) / scale;
    const rad = (-rotation * Math.PI) / 180;
    return [
      cx * Math.cos(rad) - cy * Math.sin(rad),
      cx * Math.sin(rad) + cy * Math.cos(rad),
    ];
  }

  function getScreenPoint(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function findTextAt(x: number, y: number): DrawText | null {
    const anns = annotationsRef.current;
    for (let i = anns.length - 1; i >= 0; i--) {
      const ann = anns[i];
      if (ann.type !== "text") continue;
      const approxWidth = ann.size * 0.55 * ann.text.length;
      const pad = 8;
      if (
        x >= ann.x - pad &&
        x <= ann.x + approxWidth + pad &&
        y >= ann.y - ann.size - pad &&
        y <= ann.y + pad
      ) {
        return ann;
      }
    }
    return null;
  }

  function drawSmoothOverlay(path: [number, number][], closed = false) {
    const cc = cursorCanvasRef.current;
    if (!cc || path.length < 2) return;
    const ctx = cc.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cc.width, cc.height);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
    if (closed) ctx.closePath();
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function applySmooth() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const path = pendingSmoothPath;
    if (!canvas || !img || !path || path.length < 3) return;

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const panX = panOffsetRef.current.x;
    const panY = panOffsetRef.current.y;
    // Inverse of the renderCanvas transform: screen-space → image-space
    const rad = (-rotation * Math.PI) / 180;

    // 1. Transform lasso path from screen-space into full-resolution image-space
    const imagePath: [number, number][] = path.map(([sx, sy]) => {
      const dx = (sx - canvas.width / 2 - panX) / scale;
      const dy = (sy - canvas.height / 2 - panY) / scale;
      return [
        dx * Math.cos(rad) - dy * Math.sin(rad) + iw / 2,
        dx * Math.sin(rad) + dy * Math.cos(rad) + ih / 2,
      ];
    });

    // 2. Offscreen canvas at the original image's full resolution
    const offscreen = document.createElement("canvas");
    offscreen.width = iw;
    offscreen.height = ih;
    const ctx2 = offscreen.getContext("2d")!;
    ctx2.drawImage(img, 0, 0);

    // 3. Blurred copy — radius scaled to image pixels so it looks the same at any zoom
    const blurred = document.createElement("canvas");
    blurred.width = iw;
    blurred.height = ih;
    const ctx3 = blurred.getContext("2d")!;
    const blurPx = Math.max(1, smoothBlur / scale);
    ctx3.filter = `blur(${blurPx}px)`;
    ctx3.drawImage(offscreen, 0, 0);
    ctx3.filter = "none";

    // 4. Clip to image-space lasso and paint blurred pixels over the original
    ctx2.save();
    ctx2.beginPath();
    ctx2.moveTo(imagePath[0][0], imagePath[0][1]);
    for (let i = 1; i < imagePath.length; i++) ctx2.lineTo(imagePath[i][0], imagePath[i][1]);
    ctx2.closePath();
    ctx2.clip();
    ctx2.drawImage(blurred, 0, 0);
    ctx2.restore();

    // 5. Install updated full-res image; stay at current zoom/pan/rotation
    const newImg = new Image();
    newImg.onload = () => {
      imgRef.current = newImg;
      setPendingSmoothPath(null);
      smoothPathRef.current = [];
      smoothDrawingRef.current = false;
      clearBrushCursor();
      // Re-render at exactly the same view the user was in — nothing is lost
      renderCanvas(canvas, newImg, annotationsRef.current, scale, rotation, cropRect, null, cutRect, selectionRect ?? undefined, panOffsetRef.current);
    };
    newImg.src = offscreen.toDataURL("image/png");
  }

  function cancelSmooth() {
    setPendingSmoothPath(null);
    smoothPathRef.current = [];
    smoothDrawingRef.current = false;
    clearBrushCursor();
  }

  function applyCalibration() {
    const mm = parseFloat(calibratingMmInput);
    if (!calibratingPx || isNaN(mm) || mm <= 0) return;
    const newPxPerMm = calibratingPx / mm;
    setPxPerMm(newPxPerMm);
    localStorage.setItem("max7_pxPerMm", String(newPxPerMm));
    setAnnotations((prev) =>
      prev.map((ann) => (ann.type === "ruler" ? { ...ann, pxPerMm: newPxPerMm } : ann)),
    );
    setCalibratingPx(null);
    setCalibratingMmInput("");
    setCalibrating(false);
    toast({ title: t("editor.calibrationSet"), description: `1 mm = ${(1 / newPxPerMm).toFixed(3)} px` });
  }

  function saveAsReference(px: number) {
    const rounded = Math.round(px);
    setReferenceLinePx(rounded);
    localStorage.setItem("max7_refLinePx", String(rounded));
    // Persist the ruler annotation to DB so it survives navigation away from Image A
    if (id) {
      updateImage.mutate({ id, data: { notes, annotation: JSON.stringify(annotations) } });
    }
    toast({ title: t("editor.resizeSaveRef"), description: `${rounded} px ${t("editor.resizeSavedDesc")}` });
  }

  function handleResizeToReference(targetPx?: number) {
    const refPx = targetPx ?? parseFloat(resizeRefInput);
    if (isNaN(refPx) || refPx <= 0) return;
    const rulers = annotations.filter((a): a is DrawRuler => a.type === "ruler");
    if (rulers.length === 0) return;
    const ref = rulers[rulers.length - 1];
    const currentPx = Math.hypot(ref.x2 - ref.x1, ref.y2 - ref.y1);
    if (currentPx < 1) return;
    const factor = refPx / currentPx;
    const img = imgRef.current;
    if (!img || !id) return;
    // Render the flat canvas WITHOUT rulers so they stay as live annotations
    const nonRulerAnnotations = annotations.filter(a => a.type !== "ruler");
    const flatCanvas = document.createElement("canvas");
    flatCanvas.width = img.naturalWidth;
    flatCanvas.height = img.naturalHeight;
    renderCanvas(flatCanvas, img, nonRulerAnnotations, 1, 0, null, null, null, undefined, { x: 0, y: 0 });
    const newW = Math.max(1, Math.round(img.naturalWidth * factor));
    const newH = Math.max(1, Math.round(img.naturalHeight * factor));
    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = newW;
    scaledCanvas.height = newH;
    const sctx = scaledCanvas.getContext("2d")!;
    sctx.drawImage(flatCanvas, 0, 0, newW, newH);
    scaledCanvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "image.png", { type: "image/png" });
      replaceFile.mutate(
        { id, data: { file } },
        {
          onSuccess: () => {
            // Scale ruler coordinates by the same factor so they stay accurate on the resized image
            const scaledRulers = rulers.map(r => ({
              ...r,
              x1: r.x1 * factor,
              y1: r.y1 * factor,
              x2: r.x2 * factor,
              y2: r.y2 * factor,
            }));
            setAnnotations(scaledRulers);
            // Persist the scaled rulers to DB
            updateImage.mutate({ id, data: { notes, annotation: JSON.stringify(scaledRulers) } });
            setShowResizePanel(false);
            setResizeRefInput("");
            toast({
              title: t("editor.resizeApplied"),
              description: `${newW}×${newH} px  (×${factor.toFixed(3)})`,
            });
          },
        },
      );
    }, "image/png");
  }

  function drawBrushCursor(sx: number, sy: number) {
    const cc = cursorCanvasRef.current;
    if (!cc) return;
    const ctx = cc.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cc.width, cc.height);
    const radius = (tool === "eraser" ? 10 : strokeWidth / 2) * scale;
    const r = Math.max(2, radius);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.strokeStyle = tool === "eraser" ? "rgba(80,80,80,0.9)" : penColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // thin white halo so circle is visible on dark backgrounds too
    ctx.beginPath();
    ctx.arc(sx, sy, r + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // crosshair centre dot
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = tool === "eraser" ? "rgba(80,80,80,0.9)" : penColor;
    ctx.fill();
    ctx.restore();
  }

  function clearBrushCursor() {
    const cc = cursorCanvasRef.current;
    if (!cc) return;
    const ctx = cc.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, cc.width, cc.height);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "smooth" && !pendingSmoothPath) {
      const [sx, sy] = getScreenPoint(e);
      smoothPathRef.current = [[sx, sy]];
      smoothDrawingRef.current = true;
      return;
    }
    if (tool === "hand") {
      panDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: panOffsetRef.current.x,
        origY: panOffsetRef.current.y,
      };
      return;
    }
    if (tool === "pen" || tool === "eraser") {
      isDrawingRef.current = true;
      const [x, y] = getCanvasPoint(e);
      currentLineRef.current = [x, y];
    } else if (tool === "text") {
      const [x, y] = getCanvasPoint(e);
      setPendingText({ x, y });
    } else if (tool === "crop") {
      const [sx, sy] = getScreenPoint(e);
      cropStartRef.current = { x: sx, y: sy };
      setCropRect({ x: sx, y: sy, w: 0, h: 0 });
    } else if (tool === "arrow") {
      arrowStartRef.current = getCanvasPoint(e);
    } else if (tool === "circle") {
      circleStartRef.current = getCanvasPoint(e);
    } else if (tool === "straightline") {
      straightLineStartRef.current = getCanvasPoint(e);
    } else if (tool === "ruler") {
      rulerStartRef.current = getCanvasPoint(e);
    } else if (tool === "angle") {
      const pt = getCanvasPoint(e);
      const newPts = [...anglePointsRef.current, pt];
      anglePointsRef.current = newPts;
      if (newPts.length === 1) {
        setAngleStep(1);
      } else if (newPts.length === 2) {
        setAngleStep(2);
      } else {
        const [[vx, vy], [p1x, p1y], [p2x, p2y]] = newPts as [[number,number],[number,number],[number,number]];
        if (Math.hypot(p1x - vx, p1y - vy) > 3 && Math.hypot(p2x - vx, p2y - vy) > 3) {
          const newAngleAnn: DrawAngle = { type: "angle", vx, vy, p1x, p1y, p2x, p2y, color: penColor, id: Date.now().toString() };
          setAnnotations((prev) => [...prev, newAngleAnn]);
        }
        anglePointsRef.current = [];
        setAngleStep(0);
      }
      return;
    } else if (tool === "eyedropper") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const [sx, sy] = getScreenPoint(e);
      const ctx = canvas.getContext("2d")!;
      const pixel = ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
      if (pixel[3] === 0) return; // transparent — ignore
      const hex =
        "#" +
        [pixel[0], pixel[1], pixel[2]]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
      setPenColor(hex);
      setTool("pen");
      toast({ title: t("editor.colorSampled"), description: hex.toUpperCase() });
    } else if (tool === "select" && !floater) {
      const [sx, sy] = getScreenPoint(e);
      if (selectMode === "rect") {
        selectionStartRef.current = { x: sx, y: sy };
        setSelectionRect({ x: sx, y: sy, w: 0, h: 0 });
      } else {
        selectPathRef.current = [[sx, sy]];
        selectDrawingRef.current = true;
      }
    } else if (tool === "pointer") {
      const [x, y] = getCanvasPoint(e);
      const hit = findTextAt(x, y);
      if (hit) {
        draggingTextRef.current = {
          id: hit.id,
          origX: hit.x,
          origY: hit.y,
          mouseStartX: x,
          mouseStartY: y,
        };
      }
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (tool === "pen" || tool === "eraser") {
      const [sx, sy] = getScreenPoint(e);
      drawBrushCursor(sx, sy);
    } else if (tool === "smooth" && smoothDrawingRef.current) {
      const [sx, sy] = getScreenPoint(e);
      smoothPathRef.current.push([sx, sy]);
      drawSmoothOverlay(smoothPathRef.current);
    } else if (tool === "select" && selectMode === "freehand" && selectDrawingRef.current) {
      const [sx, sy] = getScreenPoint(e);
      selectPathRef.current.push([sx, sy]);
      drawSmoothOverlay(selectPathRef.current);
    } else {
      clearBrushCursor();
    }

    if (tool === "crop" && cropStartRef.current) {
      const [sx, sy] = getScreenPoint(e);
      const x = Math.min(cropStartRef.current.x, sx);
      const y = Math.min(cropStartRef.current.y, sy);
      const w = Math.abs(sx - cropStartRef.current.x);
      const h = Math.abs(sy - cropStartRef.current.y);
      setCropRect({ x, y, w, h });
      return;
    }

    if (tool === "hand" && panDragRef.current) {
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      const newPan = { x: panDragRef.current.origX + dx, y: panDragRef.current.origY + dy };
      panOffsetRef.current = newPan;
      renderCanvas(canvas, imgRef.current, annotationsRef.current, scale, rotation, cropRect, null, cutRect, selectionRect ?? undefined, newPan, cutPath);
      return;
    }

    if (tool === "arrow" && arrowStartRef.current) {
      const [x2, y2] = getCanvasPoint(e);
      const [x1, y1] = arrowStartRef.current;
      const preview: DrawArrow = { type: "arrow", x1, y1, x2, y2, color: penColor, width: strokeWidth, id: "__preview__" };
      renderCanvas(canvas, imgRef.current, annotations, scale, rotation, null, preview, null, undefined, panOffsetRef.current);
      return;
    }

    if (tool === "circle" && circleStartRef.current) {
      const [cx, cy] = circleStartRef.current;
      const [mx, my] = getCanvasPoint(e);
      const r = Math.hypot(mx - cx, my - cy);
      const preview: DrawCircle = { type: "circle", cx, cy, r, color: penColor, width: strokeWidth, id: "__preview__" };
      renderCanvas(canvas, imgRef.current, annotations, scale, rotation, null, preview, null, undefined, panOffsetRef.current);
      return;
    }

    if (tool === "straightline" && straightLineStartRef.current) {
      const [x2, y2] = getCanvasPoint(e);
      const [x1, y1] = straightLineStartRef.current;
      const preview: DrawStraightLine = { type: "straightline", x1, y1, x2, y2, color: penColor, width: strokeWidth, id: "__preview__" };
      renderCanvas(canvas, imgRef.current, annotations, scale, rotation, null, preview, null, undefined, panOffsetRef.current);
      return;
    }

    if (tool === "ruler" && rulerStartRef.current) {
      const [x2, y2] = getCanvasPoint(e);
      const [x1, y1] = rulerStartRef.current;
      const preview: DrawRuler = { type: "ruler", x1, y1, x2, y2, color: penColor, pxPerMm: calibrating ? null : pxPerMm, id: "__preview__" };
      renderCanvas(canvas, imgRef.current, annotations, scale, rotation, null, preview, null, undefined, panOffsetRef.current);
      return;
    }

    if (tool === "angle" && anglePointsRef.current.length > 0) {
      const [mx, my] = getCanvasPoint(e);
      const [vx, vy] = anglePointsRef.current[0];
      if (anglePointsRef.current.length >= 2) {
        const [p1x, p1y] = anglePointsRef.current[1];
        const preview: DrawAngle = { type: "angle", vx, vy, p1x, p1y, p2x: mx, p2y: my, color: penColor, id: "__preview__" };
        renderCanvas(canvas, imgRef.current, annotations, scale, rotation, null, preview, null, undefined, panOffsetRef.current);
      } else {
        const preview: DrawStraightLine = { type: "straightline", x1: vx, y1: vy, x2: mx, y2: my, color: penColor, width: 1.5, id: "__preview__" };
        renderCanvas(canvas, imgRef.current, annotations, scale, rotation, null, preview, null, undefined, panOffsetRef.current);
      }
      return;
    }

    if (tool === "select" && selectionStartRef.current && !floater) {
      const [sx, sy] = getScreenPoint(e);
      const x = Math.min(selectionStartRef.current.x, sx);
      const y = Math.min(selectionStartRef.current.y, sy);
      const w = Math.abs(sx - selectionStartRef.current.x);
      const h = Math.abs(sy - selectionStartRef.current.y);
      setSelectionRect({ x, y, w, h });
      return;
    }

    if (tool === "pointer" && draggingTextRef.current) {
      const [mx, my] = getCanvasPoint(e);
      const { id, origX, origY, mouseStartX, mouseStartY } = draggingTextRef.current;
      const dx = mx - mouseStartX;
      const dy = my - mouseStartY;
      const updated = annotationsRef.current.map((ann) =>
        ann.type === "text" && ann.id === id
          ? { ...ann, x: origX + dx, y: origY + dy }
          : ann,
      );
      renderCanvas(canvas, imgRef.current, updated, scale, rotation, null, null, null, undefined, panOffsetRef.current);
      return;
    }

    if (!isDrawingRef.current) return;
    const [x, y] = getCanvasPoint(e);
    currentLineRef.current = [...currentLineRef.current, x, y];

    renderCanvas(canvas, imgRef.current, annotations, scale, rotation, null, null, null, undefined, panOffsetRef.current);
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.translate(canvas.width / 2 + panOffsetRef.current.x, canvas.height / 2 + panOffsetRef.current.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    const pts = currentLineRef.current;
    if (pts.length >= 4) {
      ctx.beginPath();
      ctx.strokeStyle = tool === "eraser" ? "#ffffff" : penColor;
      ctx.lineWidth = tool === "eraser" ? 20 : strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "smooth" && smoothDrawingRef.current) {
      smoothDrawingRef.current = false;
      const path = smoothPathRef.current;
      if (path.length >= 3) {
        const closed = path.slice();
        setPendingSmoothPath(closed);
        drawSmoothOverlay(closed, true);
      } else {
        smoothPathRef.current = [];
        clearBrushCursor();
      }
      return;
    }
    if (tool === "hand") {
      if (panDragRef.current) {
        setPanOffset(panOffsetRef.current);
        panDragRef.current = null;
      }
      return;
    }
    if (tool === "crop") {
      cropStartRef.current = null;
      return;
    }

    if (tool === "arrow" && arrowStartRef.current) {
      const [x2, y2] = getCanvasPoint(e);
      const [x1, y1] = arrowStartRef.current;
      arrowStartRef.current = null;
      if (Math.hypot(x2 - x1, y2 - y1) > 5) {
        const newArrow: DrawArrow = {
          type: "arrow",
          x1, y1, x2, y2,
          color: penColor,
          width: strokeWidth,
          id: Date.now().toString(),
        };
        setAnnotations((prev) => [...prev, newArrow]);
      }
      return;
    }

    if (tool === "circle" && circleStartRef.current) {
      const [cx, cy] = circleStartRef.current;
      const [mx, my] = getCanvasPoint(e);
      circleStartRef.current = null;
      const r = Math.hypot(mx - cx, my - cy);
      if (r > 5) {
        const newCircle: DrawCircle = {
          type: "circle",
          cx, cy, r,
          color: penColor,
          width: strokeWidth,
          id: Date.now().toString(),
        };
        setAnnotations((prev) => [...prev, newCircle]);
      }
      return;
    }

    if (tool === "straightline" && straightLineStartRef.current) {
      const [x2, y2] = getCanvasPoint(e);
      const [x1, y1] = straightLineStartRef.current;
      straightLineStartRef.current = null;
      if (Math.hypot(x2 - x1, y2 - y1) > 3) {
        const newLine: DrawStraightLine = {
          type: "straightline",
          x1, y1, x2, y2,
          color: penColor,
          width: strokeWidth,
          id: Date.now().toString(),
        };
        setAnnotations((prev) => [...prev, newLine]);
      }
      return;
    }

    if (tool === "ruler" && rulerStartRef.current) {
      const [x2, y2] = getCanvasPoint(e);
      const [x1, y1] = rulerStartRef.current;
      rulerStartRef.current = null;
      const dist = Math.hypot(x2 - x1, y2 - y1);
      if (dist < 5) {
        const canvas2 = canvasRef.current;
        if (canvas2) renderCanvas(canvas2, imgRef.current, annotationsRef.current, scale, rotation, cropRect, null, cutRect, selectionRect ?? undefined, panOffsetRef.current, cutPath);
        return;
      }
      if (calibrating) {
        setCalibratingPx(dist);
      } else {
        const newRuler: DrawRuler = { type: "ruler", x1, y1, x2, y2, color: penColor, pxPerMm, id: Date.now().toString() };
        setAnnotations((prev) => [...prev, newRuler]);
        if (resizeMode) {
          setShowResizePanel(true);
          setResizeMode(false);
        }
      }
      return;
    }

    if (tool === "select" && selectMode === "freehand" && selectDrawingRef.current && !floater) {
      selectDrawingRef.current = false;
      const path = selectPathRef.current;
      selectPathRef.current = [];
      clearBrushCursor();
      if (path.length < 3 || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const xs = path.map((p) => p[0]);
      const ys = path.map((p) => p[1]);
      const bx = Math.min(...xs), by = Math.min(...ys);
      const bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
      if (bw < 4 || bh < 4) return;
      preCutStateRef.current = {
        imgSrc: imgRef.current?.src ?? "",
        annotations: annotationsRef.current.slice(),
        scale,
        rotation,
      };
      // Extract the freehand region — clip to path, copy from canvas
      const offscreen = document.createElement("canvas");
      offscreen.width = bw;
      offscreen.height = bh;
      const octx = offscreen.getContext("2d")!;
      octx.beginPath();
      octx.moveTo(path[0][0] - bx, path[0][1] - by);
      for (let i = 1; i < path.length; i++) octx.lineTo(path[i][0] - bx, path[i][1] - by);
      octx.closePath();
      octx.clip();
      octx.drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);
      const dataUrl = offscreen.toDataURL("image/png");
      // Fill the freehand shape with white on the canvas
      const ctx = canvas.getContext("2d")!;
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      setCutPath(path);
      setCutRect({ x: bx, y: by, w: bw, h: bh });
      setFloater({ dataUrl, x: bx, y: by, w: bw, h: bh });
      return;
    }

    if (tool === "select" && selectionStartRef.current && !floater) {
      selectionStartRef.current = null;
      const sel = selectionRect;
      if (!sel || sel.w < 4 || sel.h < 4 || !canvasRef.current) {
        setSelectionRect(null);
        return;
      }
      const canvas = canvasRef.current;
      // Save the pre-cut state so Cancel can fully restore it
      preCutStateRef.current = {
        imgSrc: imgRef.current?.src ?? "",
        annotations: annotationsRef.current.slice(),
        scale,
        rotation,
      };
      // Extract the selected region into a floater
      const offscreen = document.createElement("canvas");
      offscreen.width = sel.w;
      offscreen.height = sel.h;
      const octx = offscreen.getContext("2d")!;
      octx.drawImage(canvas, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
      const dataUrl = offscreen.toDataURL("image/png");
      // Cut: white hole at selection site
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
      setCutRect(sel);
      setFloater({ dataUrl, x: sel.x, y: sel.y, w: sel.w, h: sel.h });
      setSelectionRect(null);
      return;
    }

    if (tool === "pointer" && draggingTextRef.current) {
      const [mx, my] = getCanvasPoint(e);
      const { id, origX, origY, mouseStartX, mouseStartY } = draggingTextRef.current;
      draggingTextRef.current = null;
      const dx = mx - mouseStartX;
      const dy = my - mouseStartY;
      setAnnotations((prev) =>
        prev.map((ann) =>
          ann.type === "text" && ann.id === id
            ? { ...ann, x: origX + dx, y: origY + dy }
            : ann,
        ),
      );
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const pts = currentLineRef.current;
    if (pts.length >= 4) {
      const newLine: DrawLine = {
        type: "line",
        points: pts,
        color: tool === "eraser" ? "#ffffff" : penColor,
        width: tool === "eraser" ? 20 : strokeWidth,
      };
      setAnnotations((prev) => [...prev, newLine]);
    }
    currentLineRef.current = [];
  }

  function applyCrop() {
    if (!cropRect || cropRect.w < 4 || cropRect.h < 4 || !canvasRef.current) return;
    const offscreen = document.createElement("canvas");
    offscreen.width = cropRect.w;
    offscreen.height = cropRect.h;
    const ctx2 = offscreen.getContext("2d")!;
    ctx2.drawImage(canvasRef.current, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);

    const newImg = new Image();
    newImg.onload = () => {
      imgRef.current = newImg;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const fitScale =
        canvas && container && newImg.naturalWidth > 0 && newImg.naturalHeight > 0
          ? Math.min(
              container.offsetWidth / newImg.naturalWidth,
              container.offsetHeight / newImg.naturalHeight,
            )
          : 1;
      setAnnotations([]);
      setScale(fitScale);
      setRotation(0);
      setCropRect(null);
      cropStartRef.current = null;
      setPanOffset({ x: 0, y: 0 });
      panOffsetRef.current = { x: 0, y: 0 };
      setTool("pointer");
      if (canvas && container) {
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
        renderCanvas(canvas, newImg, [], fitScale, 0, null);
      }
    };
    newImg.src = offscreen.toDataURL("image/png");
  }

  function confirmText() {
    if (!pendingText || !textInput.trim()) {
      setPendingText(null);
      setTextInput("");
      return;
    }
    const newText: DrawText = {
      type: "text",
      x: pendingText.x,
      y: pendingText.y,
      text: textInput,
      color: penColor,
      size: textSize,
      id: Date.now().toString(),
    };
    setAnnotations((prev) => [...prev, newText]);
    setPendingText(null);
    setTextInput("");
    // Stay in text mode so the user can keep adding more text annotations
  }

  function startFloaterDrag(e: React.MouseEvent<HTMLDivElement>) {
    if (!floater) return;
    e.preventDefault();
    floaterDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: floater.x,
      origY: floater.y,
    };
    function onMove(ev: MouseEvent) {
      if (!floaterDragRef.current) return;
      const dx = ev.clientX - floaterDragRef.current.startX;
      const dy = ev.clientY - floaterDragRef.current.startY;
      setFloater((prev) =>
        prev ? { ...prev, x: floaterDragRef.current!.origX + dx, y: floaterDragRef.current!.origY + dy } : null,
      );
    }
    function onUp() {
      floaterDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function applyFloater() {
    if (!floater || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = new Image();
    img.onload = () => {
      // Render current state (image + annotations + white hole), then burn in floater
      renderCanvas(canvas, imgRef.current, annotationsRef.current, scale, rotation, null, null, cutRect, undefined, undefined, cutPath);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, floater.x, floater.y, floater.w, floater.h);
      // Flatten to a new image
      const flatUrl = canvas.toDataURL("image/png");
      const newImg = new Image();
      newImg.onload = () => {
        imgRef.current = newImg;
        const fitScale =
          container && newImg.naturalWidth > 0
            ? Math.min(container.offsetWidth / newImg.naturalWidth, container.offsetHeight / newImg.naturalHeight)
            : 1;
        setAnnotations([]);
        setScale(fitScale);
        setRotation(0);
        setCutRect(null);
        setCutPath(null);
        setFloater(null);
        setPanOffset({ x: 0, y: 0 });
        panOffsetRef.current = { x: 0, y: 0 };
        setTool("pointer");
        preCutStateRef.current = null;
        if (container) {
          canvas.width = container.offsetWidth;
          canvas.height = container.offsetHeight;
        }
        renderCanvas(canvas, newImg, [], fitScale, 0, null);
      };
      newImg.src = flatUrl;
    };
    img.src = floater.dataUrl;
  }

  async function copyFloaterToClipboard() {
    if (!floater) return;
    try {
      const res = await fetch(floater.dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast({ title: t("editor.copiedToClipboard") });
    } catch {
      toast({ variant: "destructive", title: t("editor.clipboardFailed") });
    }
  }

  function cancelSelection() {
    const prev = preCutStateRef.current;
    if (!prev || !canvasRef.current) {
      setCutRect(null);
      setCutPath(null);
      setFloater(null);
      setSelectionRect(null);
      return;
    }
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setAnnotations(prev.annotations);
      setScale(prev.scale);
      setRotation(prev.rotation);
      setCutRect(null);
      setCutPath(null);
      setFloater(null);
      setSelectionRect(null);
      setPanOffset({ x: 0, y: 0 });
      panOffsetRef.current = { x: 0, y: 0 };
      preCutStateRef.current = null;
      if (container) {
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
      }
      renderCanvas(canvas, img, prev.annotations, prev.scale, prev.rotation, null);
    };
    img.src = prev.imgSrc;
  }

  const replaceFile = useReplaceImageFile({
    mutation: {
      onError: (e) => {
        toast({ variant: "destructive", title: t("editor.imageFileSaveFailed"), description: String(e) });
      },
    },
  });

  const updateImage = useUpdateImage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetImageQueryKey(id) });
        if (image?.patientId) {
          queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(image.patientId) });
        }
        toast({ title: t("editor.imageSaved") });
      },
      onError: (e) => {
        toast({ variant: "destructive", title: t("editor.saveFailed"), description: String(e) });
      },
    },
  });

  const deleteImage = useDeleteImage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListImagesQueryKey() });
        if (image?.patientId) {
          queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(image.patientId) });
        }
        toast({ title: t("editor.imageDeleted") });
        setLocation(image?.patientId ? `/patients/${image.patientId}` : "/gallery");
      },
      onError: (e) => {
        toast({ variant: "destructive", title: t("editor.deleteFailed"), description: String(e) });
      },
    },
  });

  /**
   * Renders the image + annotations into an off-screen canvas at the image's
   * natural resolution (scale=1, no pan), accounting for the current rotation.
   * This ensures Save / Save as Copy always produce the full-resolution image
   * regardless of the zoom level the user had on screen.
   */
  function renderFlatBlob(): Promise<Blob | null> {
    const img = imgRef.current;
    if (!img) return Promise.resolve(null);
    // For 90°/270° rotations swap dimensions so the whole image fits
    const angle = ((rotation % 360) + 360) % 360;
    const isOrthogonal = angle === 90 || angle === 270;
    const outW = isOrthogonal ? img.naturalHeight : img.naturalWidth;
    const outH = isOrthogonal ? img.naturalWidth : img.naturalHeight;
    const flat = document.createElement("canvas");
    flat.width = outW;
    flat.height = outH;
    renderCanvas(flat, img, annotations, 1, rotation, null, null, null, undefined, { x: 0, y: 0 });
    return new Promise<Blob | null>((resolve) => flat.toBlob(resolve, "image/png"));
  }

  async function handleSave() {
    const img = imgRef.current;
    if (!img) {
      toast({ variant: "destructive", title: t("editor.canvasNotReady") });
      return;
    }

    const blob = await renderFlatBlob();

    if (blob) {
      const file = new File([blob], "edited.png", { type: "image/png" });
      replaceFile.mutate({ id, data: { file } });
    }

    updateImage.mutate({ id, data: { notes, annotation: JSON.stringify(annotations) } });
  }

  async function handleSaveAsCopy() {
    const img = imgRef.current;
    if (!img || !image?.patientId) {
      toast({ variant: "destructive", title: t("editor.canvasNotReady") });
      return;
    }

    setIsSavingCopy(true);
    try {
      const blob = await renderFlatBlob();
      if (!blob) throw new Error("Failed to export canvas");

      const file = new File([blob], "copy.png", { type: "image/png" });
      const result = await uploadPatientImage(file, image.patientId, notes || undefined);

      toast({
        title: t("editor.savedAsCopy"),
        description: t("editor.savedAsCopyDesc"),
      });
      setLocation(`/editor/${result.id}`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("editor.saveFailed"),
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSavingCopy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 h-full flex flex-col">
        <Skeleton className="h-12 w-full mb-4" />
        <Skeleton className="flex-1 w-full rounded-xl" />
      </div>
    );
  }

  if (!image) {
    return <div className="p-12 text-center text-muted-foreground">{t("editor.notFound")}</div>;
  }

  const isSaving = replaceFile.isPending || updateImage.isPending;

  const cursorClass =
    tool === "pen" || tool === "eraser"
      ? "cursor-none"
      : tool === "arrow" || tool === "circle" || tool === "straightline" || tool === "ruler" || tool === "angle"
      ? "cursor-crosshair"
      : tool === "text"
      ? "cursor-text"
      : tool === "crop" || (tool === "select" && !floater) || tool === "eyedropper"
      ? "cursor-crosshair"
      : tool === "smooth" && !pendingSmoothPath
      ? "cursor-crosshair"
      : tool === "hand"
      ? (panDragRef.current ? "cursor-grabbing" : "cursor-grab")
      : "cursor-default";

  function handlePointerLeave(e: React.PointerEvent<HTMLCanvasElement>) {
    clearBrushCursor();
    handlePointerUp(e);
  }

  const tools: { id: Tool; Icon: React.ElementType; label: string }[] = [
    { id: "pointer",     Icon: MousePointer2, label: t("editor.pointer") },
    { id: "hand",        Icon: Hand,          label: t("editor.pan") },
    { id: "pen",         Icon: PenTool,       label: t("editor.draw") },
    { id: "eyedropper",  Icon: Pipette,       label: t("editor.eyedropper") },
    { id: "straightline",Icon: Minus,         label: t("editor.straightLine") },
    { id: "arrow",       Icon: MoveRight,     label: t("editor.arrow") },
    { id: "circle",      Icon: CircleIcon,    label: t("editor.circle") },
    { id: "text",        Icon: TypeIcon,      label: t("editor.text") },
    { id: "eraser",      Icon: Eraser,        label: t("editor.erase") },
    { id: "crop",        Icon: Crop,          label: t("editor.crop") },
    { id: "select",      Icon: Scissors,      label: t("editor.select") },
    { id: "smooth",      Icon: Wand2,         label: t("editor.smooth") },
    { id: "ruler",       Icon: Ruler,         label: t("editor.ruler") },
    { id: "angle",       Icon: Compass,       label: t("editor.angle") },
    { id: "overlay",     Icon: Layers,        label: t("editor.overlayImage") },
  ];

  const resizePanelLastRuler = annotations.filter(a => a.type === "ruler").at(-1) as DrawRuler | undefined;
  const resizePanelLinePx = resizePanelLastRuler
    ? Math.round(Math.hypot(resizePanelLastRuler.x2 - resizePanelLastRuler.x1, resizePanelLastRuler.y2 - resizePanelLastRuler.y1))
    : 0;

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.14))] -m-4 md:-m-6 lg:-m-8">
      {/* Toolbar */}
      <div className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="icon" asChild>
            <Link href={image.patientId ? `/patients/${image.patientId}` : "/gallery"}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>

          <div className="h-4 w-px bg-border mx-1" />

          <div className="flex bg-muted/50 p-1 rounded-md gap-0.5">
            {tools.map(({ id, Icon, label }) => (
              <Button
                key={id}
                variant={tool === id ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => { setTool(id); if (id !== "crop") setCropRect(null); }}
                title={label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>

          {tool === "crop" && cropRect && cropRect.w > 4 && (
            <Button size="sm" className="h-8 gap-1" onClick={applyCrop}>
              <Check className="h-3.5 w-3.5" />
              {t("editor.applyCrop")}
            </Button>
          )}

          {tool === "select" && !floater && (
            <div className="flex items-center gap-0.5 border rounded-md p-0.5 bg-muted/30">
              <Button
                size="icon"
                variant={selectMode === "rect" ? "secondary" : "ghost"}
                className="h-7 w-7"
                title={t("editor.selectModeRect")}
                onClick={() => {
                  setSelectMode("rect");
                  selectDrawingRef.current = false;
                  selectPathRef.current = [];
                  clearBrushCursor();
                }}
              >
                <RectangleHorizontal className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant={selectMode === "freehand" ? "secondary" : "ghost"}
                className="h-7 w-7"
                title={t("editor.selectModeFreehand")}
                onClick={() => {
                  setSelectMode("freehand");
                  selectionStartRef.current = null;
                  setSelectionRect(null);
                }}
              >
                <Lasso className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {tool === "select" && floater && (
            <div className="flex items-center gap-1">
              <Button size="sm" className="h-8 gap-1" onClick={applyFloater}>
                <Check className="h-3.5 w-3.5" />
                {t("editor.applySelection")}
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={copyFloaterToClipboard}>
                <Clipboard className="h-3.5 w-3.5" />
                {t("editor.copyToClipboard")}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={cancelSelection}>
                <X className="h-3.5 w-3.5" />
                {t("editor.cancelSelection")}
              </Button>
            </div>
          )}

          {tool === "ruler" && (
            <div className="flex items-center gap-2 flex-wrap">
              {calibratingPx !== null ? (
                // Step 2 of Measure path: line drawn, enter its real length in mm
                <>
                  <span className="text-xs text-muted-foreground">{t("editor.calibratingLine")}</span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    autoFocus
                    placeholder="mm"
                    value={calibratingMmInput}
                    onChange={(e) => setCalibratingMmInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyCalibration();
                      if (e.key === "Escape") { setCalibratingPx(null); setCalibratingMmInput(""); setCalibrating(false); }
                    }}
                    className="w-20 h-7 text-xs border rounded px-2 bg-background"
                  />
                  <span className="text-xs text-muted-foreground">mm</span>
                  <Button
                    size="sm"
                    className="h-7 gap-1"
                    onClick={applyCalibration}
                    disabled={!calibratingMmInput || isNaN(parseFloat(calibratingMmInput))}
                  >
                    <Check className="h-3 w-3" />
                    {t("editor.setScale")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setCalibratingPx(null); setCalibratingMmInput(""); setCalibrating(false); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </>
              ) : showResizePanel && resizePanelLinePx > 0 ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">{t("editor.resizeLandmark")}:</span>
                    <span className="text-xs font-mono font-semibold">{resizePanelLinePx} px</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => saveAsReference(resizePanelLinePx)}
                    >
                      <Bookmark className="h-3 w-3" />
                      {t("editor.resizeSaveRef")}
                    </Button>
                    {referenceLinePx && referenceLinePx !== resizePanelLinePx && (
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleResizeToReference(referenceLinePx)}
                        disabled={replaceFile.isPending}
                      >
                        <Check className="h-3 w-3" />
                        {t("editor.resizeMatchRef")} ({referenceLinePx} px)
                      </Button>
                    )}
                    <div className="h-4 w-px bg-border mx-0.5" />
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="px"
                      value={resizeRefInput}
                      onChange={(e) => setResizeRefInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleResizeToReference();
                        if (e.key === "Escape") { setShowResizePanel(false); setResizeRefInput(""); }
                      }}
                      className="w-20 h-7 text-xs border rounded px-2 bg-background"
                    />
                    <span className="text-xs text-muted-foreground">px</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1"
                      onClick={() => handleResizeToReference()}
                      disabled={!resizeRefInput || isNaN(parseFloat(resizeRefInput)) || replaceFile.isPending}
                    >
                      <Check className="h-3 w-3" />
                      {t("editor.resizeApply")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setShowResizePanel(false); setResizeRefInput(""); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
              ) : calibrating || resizeMode ? (
                // Step 1 (either path): mode chosen, waiting for the user to draw
                <>
                  <span className="text-xs text-muted-foreground">{t("editor.rulerDrawHint")}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    onClick={() => { setCalibrating(false); setResizeMode(false); }}
                  >
                    <X className="h-3 w-3" />
                    {t("common.cancel")}
                  </Button>
                </>
              ) : (
                // Default: two explicit mode buttons
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => { setCalibrating(true); setResizeMode(false); }}
                  >
                    <Ruler className="h-3 w-3" />
                    {t("editor.rulerMeasure")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => { setResizeMode(true); setCalibrating(false); }}
                  >
                    <Minimize2 className="h-3 w-3" />
                    {t("editor.rulerResize")}
                  </Button>
                  {pxPerMm != null && (
                    <span className="text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">
                      {(1 / pxPerMm).toFixed(4)} mm/px
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {tool === "overlay" && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">{t("editor.overlayPickHint")}:</span>
              {overlayImageId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={() => { setOverlayImageId(null); overlayImgRef.current = null; redrawOverlay(); }}
                >
                  <X className="h-3 w-3" />
                  {t("editor.overlayNone")}
                </Button>
              )}
              {patientImages.filter((pi) => String(pi.id) !== String(id)).length === 0 ? (
                <span className="text-xs text-muted-foreground italic">{t("editor.overlayNoImages")}</span>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    className="shrink-0 h-7 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground"
                    onClick={() => overlayScrollRef.current?.scrollBy({ left: -160, behavior: "smooth" })}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <div
                    ref={overlayScrollRef}
                    className="flex gap-1 overflow-x-auto w-[320px] scroll-smooth"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {patientImages
                      .filter((pi) => String(pi.id) !== String(id))
                      .map((pi) => (
                        <button
                          key={pi.id}
                          title={pi.notes ?? String(pi.id)}
                          className={`shrink-0 w-9 h-9 rounded border-2 overflow-hidden transition-colors ${
                            overlayImageId === String(pi.id) ? "border-primary" : "border-transparent hover:border-muted-foreground/40"
                          }`}
                          onClick={() => setOverlayImageId(overlayImageId === String(pi.id) ? null : String(pi.id))}
                        >
                          <img
                            src={`/api/images/${pi.id}/file`}
                            alt=""
                            className="w-full h-full object-cover"
                            crossOrigin="anonymous"
                          />
                        </button>
                      ))}
                  </div>
                  <button
                    className="shrink-0 h-7 w-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground"
                    onClick={() => overlayScrollRef.current?.scrollBy({ left: 160, behavior: "smooth" })}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              )}
              {overlayImageId && (
                <>
                  <div className="h-4 w-px bg-border mx-0.5" />
                  <span className="text-xs text-muted-foreground">{t("editor.overlayOpacity")}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                    className="w-24 h-1.5 accent-primary"
                  />
                  <span className="text-xs font-mono w-8 text-center">{Math.round(overlayOpacity * 100)}%</span>
                  <div className="h-4 w-px bg-border mx-0.5" />
                  <span className="text-xs text-muted-foreground">{t("editor.overlayScale")}</span>
                  <input
                    type="range"
                    min={0.1}
                    max={3.0}
                    step={0.01}
                    value={overlayScaleCorrection}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      overlayScaleCorrectionRef.current = v;
                      setOverlayScaleCorrection(v);
                      redrawOverlay();
                    }}
                    className="w-24 h-1.5 accent-primary"
                  />
                  <span className="text-xs font-mono w-10 text-center">{Math.round(overlayScaleCorrection * 100)}%</span>
                  {overlayScaleCorrection !== 1.0 && (
                    <button
                      className="text-xs text-primary hover:underline shrink-0"
                      onClick={() => {
                        overlayScaleCorrectionRef.current = 1.0;
                        setOverlayScaleCorrection(1.0);
                        redrawOverlay();
                      }}
                    >
                      {t("editor.overlayOffsetReset")}
                    </button>
                  )}
                  <div className="h-4 w-px bg-border mx-0.5" />
                  <Move className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">{t("editor.overlayPosition")}</span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {overlayOffsetX},{overlayOffsetY}
                  </span>
                  {(overlayOffsetX !== 0 || overlayOffsetY !== 0) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs px-2"
                      onClick={() => {
                        overlayOffsetXRef.current = 0;
                        overlayOffsetYRef.current = 0;
                        setOverlayOffsetX(0);
                        setOverlayOffsetY(0);
                        redrawOverlay();
                      }}
                    >
                      {t("editor.overlayOffsetReset")}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {tool === "angle" && (
            <div className="flex items-center gap-2">
              {angleStep > 0 ? (
                <>
                  <span className="text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">
                    {angleStep === 1 ? t("editor.angleClickArm1") : t("editor.angleClickArm2")}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1"
                    onClick={() => { setAngleStep(0); anglePointsRef.current = []; }}
                  >
                    <X className="h-3 w-3" />
                    {t("common.cancel")}
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{t("editor.angleHint")}</span>
              )}
            </div>
          )}

          {tool === "smooth" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("editor.smoothStrength")}</span>
              <input
                type="range"
                min={1}
                max={20}
                value={smoothBlur}
                onChange={(e) => setSmoothBlur(+e.target.value)}
                className="w-20 h-1.5 accent-primary"
              />
              <span className="text-xs font-mono w-4 text-center">{smoothBlur}</span>
              {pendingSmoothPath && (
                <>
                  <Button size="sm" className="h-8 gap-1" onClick={applySmooth}>
                    <Check className="h-3.5 w-3.5" />
                    {t("editor.applySmooth")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={cancelSmooth}>
                    <X className="h-3.5 w-3.5" />
                    {t("common.cancel")}
                  </Button>
                </>
              )}
            </div>
          )}

          {tool !== "crop" && tool !== "pointer" && tool !== "select" && tool !== "eyedropper" && tool !== "hand" && tool !== "smooth" && (
            <div className="relative flex items-center gap-1.5" title={t("editor.annotationColor")}>
              <div
                className="w-5 h-5 rounded-full border-2 border-muted-foreground/40 shadow cursor-pointer"
                style={{ background: penColor }}
              />
              <input
                type="color"
                value={penColor}
                onChange={(e) => setPenColor(e.target.value)}
                className="absolute inset-0 opacity-0 w-full cursor-pointer"
                title={t("editor.pickColor")}
              />
            </div>
          )}

          {(tool === "pen" || tool === "arrow" || tool === "circle" || tool === "eraser" || tool === "straightline") && (
            <div className="flex items-center gap-1" title={t("editor.strokeWidth")}>
              <span className="text-xs text-muted-foreground">{t("editor.strokeWidth")}</span>
              <Button
                variant="ghost" size="icon" className="h-6 w-6 text-base"
                onClick={() => setStrokeWidth((w) => Math.max(1, w - 1))}
              >−</Button>
              <span className="text-xs font-mono w-5 text-center">{strokeWidth}</span>
              <Button
                variant="ghost" size="icon" className="h-6 w-6 text-base"
                onClick={() => setStrokeWidth((w) => Math.min(30, w + 1))}
              >+</Button>
            </div>
          )}

          {tool === "text" && (
            <div className="flex items-center gap-1" title={t("editor.textSize")}>
              <span className="text-xs text-muted-foreground">{t("editor.textSize")}</span>
              <Button
                variant="ghost" size="icon" className="h-6 w-6 text-base"
                onClick={() => setTextSize((s) => Math.max(10, s - 4))}
              >−</Button>
              <span className="text-xs font-mono w-7 text-center">{textSize}px</span>
              <Button
                variant="ghost" size="icon" className="h-6 w-6 text-base"
                onClick={() => setTextSize((s) => Math.min(120, s + 4))}
              >+</Button>
            </div>
          )}

          <div className="h-4 w-px bg-border mx-1" />

          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScale((s) => Math.max(0.1, +(s - 0.1).toFixed(1)))}
              title={t("editor.zoomOut")}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-mono w-10 text-center">{Math.round(scale * 100)}%</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScale((s) => Math.min(5, +(s + 0.1).toFixed(1)))}
              title={t("editor.zoomIn")}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title={t("editor.rotate")}
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          <div className="h-4 w-px bg-border mx-1" />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setAnnotations([])}
            title={t("editor.clearAnnotations")}
          >
            {t("editor.clearAnnotations")}
          </Button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveAsCopy}
            disabled={isSaving || isSavingCopy || !image?.patientId}
            size="sm"
            className="h-8"
            title={t("editor.saveAsCopy")}
          >
            {isSavingCopy ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {t("editor.saveAsCopy")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isSavingCopy}
            size="sm"
            className="h-8"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t("common.save")}
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-muted/30 relative overflow-hidden" ref={containerRef}>
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full touch-none ${cursorClass}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
          />
          <canvas
            ref={overlayCanvasRef}
            className={`absolute inset-0 w-full h-full ${
              tool === "overlay" && overlayImageId
                ? "cursor-move"
                : "pointer-events-none"
            }`}
            onPointerDown={tool === "overlay" && overlayImageId ? handleOverlayPointerDown : undefined}
            onPointerMove={tool === "overlay" && overlayImageId ? handleOverlayPointerMove : undefined}
            onPointerUp={tool === "overlay" && overlayImageId ? handleOverlayPointerUp : undefined}
            onPointerLeave={tool === "overlay" && overlayImageId ? handleOverlayPointerUp : undefined}
          />
          <canvas
            ref={cursorCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
          {tool === "overlay" && overlayImageId && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-background/90 border rounded-full px-3 py-1 shadow-md text-xs select-none pointer-events-none">
              <Move className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">{t("editor.overlayPosition")}</span>
              <span className="font-mono">{overlayOffsetX},{overlayOffsetY}</span>
              {(overlayOffsetX !== 0 || overlayOffsetY !== 0) && (
                <button
                  className="ml-0.5 text-primary hover:underline pointer-events-auto"
                  onClick={() => {
                    overlayOffsetXRef.current = 0;
                    overlayOffsetYRef.current = 0;
                    setOverlayOffsetX(0);
                    setOverlayOffsetY(0);
                    redrawOverlay();
                  }}
                >
                  {t("editor.overlayOffsetReset")}
                </button>
              )}
            </div>
          )}

          {pendingText && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
              <div className="bg-card rounded-xl shadow-2xl p-6 w-80 space-y-4">
                <Label className="font-semibold">{t("editor.addText")}</Label>
                <Input
                  autoFocus
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmText();
                    if (e.key === "Escape") { setPendingText(null); setTextInput(""); }
                  }}
                  placeholder={t("editor.typeAnnotation")}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setPendingText(null); setTextInput(""); }}>
                    {t("common.cancel")}
                  </Button>
                  <Button size="sm" onClick={confirmText}>
                    {t("common.add")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {tool === "pointer" && annotations.some((a) => a.type === "text") && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
              <span className="bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                {t("editor.pointerHint")}
              </span>
            </div>
          )}

          {tool === "select" && !floater && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
              <span className="bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                {selectMode === "rect" ? t("editor.selectHint") : t("editor.selectFreehandHint")}
              </span>
            </div>
          )}

          {tool === "smooth" && !pendingSmoothPath && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
              <span className="bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                {t("editor.smoothHint")}
              </span>
            </div>
          )}

          {/* Floating selection — draggable cut region */}
          {floater && (
            <div
              className="absolute select-none"
              style={{
                left: floater.x,
                top: floater.y,
                width: floater.w,
                height: floater.h,
                cursor: "move",
                zIndex: 20,
              }}
              onMouseDown={startFloaterDrag}
            >
              <img
                src={floater.dataUrl}
                draggable={false}
                style={{ width: floater.w, height: floater.h, display: "block" }}
                alt=""
              />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-72 border-l bg-card flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 border-b space-y-3">
            <h3 className="font-semibold text-sm">{t("editor.imageDetails")}</h3>
            {image.capturedAt && (
              <p className="text-xs text-muted-foreground">
                {new Date(image.capturedAt).toLocaleDateString()}
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {image.isUnassigned ? (
                  <span className="text-amber-600 font-medium">{t("editor.unassigned")}</span>
                ) : (
                  t("editor.patient")
                )}
              </Label>
              <Select
                value={image.patientId != null ? String(image.patientId) : ""}
                onValueChange={(val) => {
                  const patientId = parseInt(val, 10);
                  updateImage.mutate(
                    { id, data: { patientId } },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: getGetImageQueryKey(id) });
                        queryClient.invalidateQueries({ queryKey: getListImagesQueryKey() });
                        queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(patientId) });
                        toast({ title: t("editor.imageAssigned") });
                      },
                    },
                  );
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={t("editor.selectPatient")} />
                </SelectTrigger>
                <SelectContent>
                  {patients?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                      <span className="ml-1.5 text-muted-foreground text-xs">({p.patientCode})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Free rotation slider */}
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t("editor.freeRotation")}</Label>
              <span className="text-xs font-mono text-muted-foreground">{rotation}°</span>
            </div>
            <Slider
              min={0}
              max={359}
              step={1}
              value={[rotation]}
              onValueChange={([v]) => setRotation(v)}
              className="w-full"
            />
            <div className="flex gap-1">
              {[0, 90, 180, 270].map((deg) => (
                <Button
                  key={deg}
                  variant={rotation === deg ? "secondary" : "outline"}
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() => setRotation(deg)}
                >
                  {deg}°
                </Button>
              ))}
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col gap-3">
            <Label className="text-sm font-medium">{t("editor.clinicalNotes")}</Label>
            <Textarea
              className="min-h-[160px] resize-none text-sm"
              placeholder={t("editor.notesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("editor.annotations", { count: annotations.length })}
            </p>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("editor.deleteImage")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("editor.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteImage.mutate({ id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
