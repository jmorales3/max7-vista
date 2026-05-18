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

type Tool = "pointer" | "pen" | "text" | "eraser" | "crop" | "arrow" | "circle";

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

type Annotation = DrawLine | DrawText | DrawArrow | DrawCircle;

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

function drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation) {
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
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scale, scale);

  if (img) {
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  }

  const allAnns: Annotation[] = previewAnn ? [...annotations, previewAnn] : annotations;
  for (const ann of allAnns) {
    drawAnnotation(ctx, ann);
  }

  ctx.restore();

  if (cropRect && cropRect.w > 0 && cropRect.h > 0) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    ctx.clip();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    if (img) ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    for (const ann of allAnns) drawAnnotation(ctx, ann);
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
  const [penColor, setPenColor] = useState("#ff0000");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [textSize, setTextSize] = useState(36);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const isDrawingRef = useRef(false);
  const currentLineRef = useRef<number[]>([]);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);

  const arrowStartRef = useRef<[number, number] | null>(null);
  const circleStartRef = useRef<[number, number] | null>(null);

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

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    renderCanvas(canvas, imgRef.current, annotationsRef.current, scale, rotation, cropRect);
  }, [scale, rotation, cropRect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderCanvas(canvas, imgRef.current, annotations, scale, rotation, cropRect);
  }, [annotations, scale, rotation, cropRect]);

  useEffect(() => {
    const observer = new ResizeObserver(resizeCanvas);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  function getCanvasPoint(e: React.MouseEvent<HTMLCanvasElement>): [number, number] {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left - canvas.width / 2) / scale;
    const cy = (e.clientY - rect.top - canvas.height / 2) / scale;
    const rad = (-rotation * Math.PI) / 180;
    return [
      cx * Math.cos(rad) - cy * Math.sin(rad),
      cx * Math.sin(rad) + cy * Math.cos(rad),
    ];
  }

  function getScreenPoint(e: React.MouseEvent<HTMLCanvasElement>): [number, number] {
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

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
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

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (tool === "crop" && cropStartRef.current) {
      const [sx, sy] = getScreenPoint(e);
      const x = Math.min(cropStartRef.current.x, sx);
      const y = Math.min(cropStartRef.current.y, sy);
      const w = Math.abs(sx - cropStartRef.current.x);
      const h = Math.abs(sy - cropStartRef.current.y);
      setCropRect({ x, y, w, h });
      return;
    }

    if (tool === "arrow" && arrowStartRef.current) {
      const [x2, y2] = getCanvasPoint(e);
      const [x1, y1] = arrowStartRef.current;
      const preview: DrawArrow = { type: "arrow", x1, y1, x2, y2, color: penColor, width: strokeWidth, id: "__preview__" };
      renderCanvas(canvas, imgRef.current, annotations, scale, rotation, null, preview);
      return;
    }

    if (tool === "circle" && circleStartRef.current) {
      const [cx, cy] = circleStartRef.current;
      const [mx, my] = getCanvasPoint(e);
      const r = Math.hypot(mx - cx, my - cy);
      const preview: DrawCircle = { type: "circle", cx, cy, r, color: penColor, width: strokeWidth, id: "__preview__" };
      renderCanvas(canvas, imgRef.current, annotations, scale, rotation, null, preview);
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
      renderCanvas(canvas, imgRef.current, updated, scale, rotation, null);
      return;
    }

    if (!isDrawingRef.current) return;
    const [x, y] = getCanvasPoint(e);
    currentLineRef.current = [...currentLineRef.current, x, y];

    renderCanvas(canvas, imgRef.current, annotations, scale, rotation);
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
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

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
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

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) {
      toast({ variant: "destructive", title: t("editor.canvasNotReady") });
      return;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });

    if (blob) {
      const file = new File([blob], "edited.png", { type: "image/png" });
      replaceFile.mutate({ id, data: { file } });
    }

    updateImage.mutate({ id, data: { notes, annotation: JSON.stringify(annotations) } });
  }

  async function handleSaveAsCopy() {
    const canvas = canvasRef.current;
    if (!canvas || !image?.patientId) {
      toast({ variant: "destructive", title: t("editor.canvasNotReady") });
      return;
    }

    setIsSavingCopy(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
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
    tool === "pen" || tool === "eraser" || tool === "arrow" || tool === "circle"
      ? "cursor-crosshair"
      : tool === "text"
      ? "cursor-text"
      : tool === "crop"
      ? "cursor-crosshair"
      : "cursor-default";

  const tools: { id: Tool; Icon: React.ElementType; label: string }[] = [
    { id: "pointer", Icon: MousePointer2, label: t("editor.pointer") },
    { id: "pen",     Icon: PenTool,       label: t("editor.draw") },
    { id: "arrow",   Icon: MoveRight,     label: t("editor.arrow") },
    { id: "circle",  Icon: CircleIcon,    label: t("editor.circle") },
    { id: "text",    Icon: TypeIcon,      label: t("editor.text") },
    { id: "eraser",  Icon: Eraser,        label: t("editor.erase") },
    { id: "crop",    Icon: Crop,          label: t("editor.crop") },
  ];

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

          {tool !== "crop" && tool !== "pointer" && (
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

          {(tool === "pen" || tool === "arrow" || tool === "circle" || tool === "eraser") && (
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
            className={`absolute inset-0 w-full h-full ${cursorClass}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />

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

          {tool === "pointer" && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
              <span className="bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                {t("editor.pointerHint")}
              </span>
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
