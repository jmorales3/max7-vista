import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useRoute, useLocation } from "wouter";
import {
  useGetImage,
  getGetImageQueryKey,
  useUpdateImage,
  useDeleteImage,
  getListImagesQueryKey,
  getListPatientImagesQueryKey,
} from "@workspace/api-client-react";
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

type Tool = "pointer" | "pen" | "text" | "eraser" | "crop";

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

type Annotation = DrawLine | DrawText;

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function renderCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement | null,
  annotations: Annotation[],
  scale: number,
  rotation: number,
  cropRect?: CropRect | null,
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

  for (const ann of annotations) {
    if (ann.type === "line") {
      if (ann.points.length < 4) continue;
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
      ctx.font = `${ann.size}px sans-serif`;
      ctx.fillStyle = ann.color;
      ctx.fillText(ann.text, ann.x, ann.y);
    }
  }

  ctx.restore();

  // Draw crop overlay on top (in screen coordinates, not transformed)
  if (cropRect && cropRect.w > 0 && cropRect.h > 0) {
    ctx.save();
    // Dim everything outside the crop
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Cut out the selection
    ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    // Re-draw the original inside the crop area (no dim)
    ctx.save();
    ctx.beginPath();
    ctx.rect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    ctx.clip();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    if (img) ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    for (const ann of annotations) {
      if (ann.type === "line") {
        if (ann.points.length < 4) continue;
        ctx.beginPath();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(ann.points[0], ann.points[1]);
        for (let i = 2; i < ann.points.length; i += 2) ctx.lineTo(ann.points[i], ann.points[i + 1]);
        ctx.stroke();
      } else if (ann.type === "text") {
        ctx.font = `${ann.size}px sans-serif`;
        ctx.fillStyle = ann.color;
        ctx.fillText(ann.text, ann.x, ann.y);
      }
    }
    ctx.restore();
    // Draw border
    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
    // Corner handles
    ctx.setLineDash([]);
    ctx.fillStyle = "#0ea5e9";
    const hs = 7;
    const corners = [
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
  const [, params] = useRoute("/editor/:id");
  const id = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [notes, setNotes] = useState("");
  const [tool, setTool] = useState<Tool>("pointer");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [penColor, setPenColor] = useState("#ff0000");
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const isDrawingRef = useRef(false);
  const currentLineRef = useRef<number[]>([]);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);

  const { data: image, isLoading } = useGetImage(id, {
    query: { enabled: !!id, queryKey: getGetImageQueryKey(id) },
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
    renderCanvas(canvas, imgRef.current, annotations, scale, rotation, cropRect);
  }, [annotations, scale, rotation, cropRect]);

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
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tool === "crop" && cropStartRef.current) {
      const [sx, sy] = getScreenPoint(e);
      const x = Math.min(cropStartRef.current.x, sx);
      const y = Math.min(cropStartRef.current.y, sy);
      const w = Math.abs(sx - cropStartRef.current.x);
      const h = Math.abs(sy - cropStartRef.current.y);
      setCropRect({ x, y, w, h });
      return;
    }

    if (!isDrawingRef.current) return;
    const [x, y] = getCanvasPoint(e);
    currentLineRef.current = [...currentLineRef.current, x, y];

    // Live preview
    const canvas = canvasRef.current;
    if (!canvas) return;
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
      ctx.lineWidth = tool === "eraser" ? 20 : 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  function handleMouseUp() {
    if (tool === "crop") {
      cropStartRef.current = null;
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
        width: tool === "eraser" ? 20 : 4,
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

    // Draw from the current canvas (which shows the image + annotations at current scale/rotation)
    const srcCanvas = canvasRef.current;
    ctx2.drawImage(srcCanvas, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);

    const newImg = new Image();
    newImg.onload = () => {
      imgRef.current = newImg;
      setAnnotations([]);
      setScale(1);
      setRotation(0);
      setCropRect(null);
      cropStartRef.current = null;
      setTool("pointer");
      resizeCanvas();
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
      size: 24,
      id: Date.now().toString(),
    };
    setAnnotations((prev) => [...prev, newText]);
    setPendingText(null);
    setTextInput("");
    setTool("pointer");
  }

  const updateImage = useUpdateImage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetImageQueryKey(id) });
        if (image?.patientId) {
          queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(image.patientId) });
        }
        toast({ title: "Image saved successfully" });
      },
      onError: (e) => {
        toast({ variant: "destructive", title: "Save failed", description: String(e) });
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
        toast({ title: "Image deleted" });
        setLocation(image?.patientId ? `/patients/${image.patientId}` : "/gallery");
      },
      onError: (e) => {
        toast({ variant: "destructive", title: "Delete failed", description: String(e) });
      },
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 h-full flex flex-col">
        <Skeleton className="h-12 w-full mb-4" />
        <Skeleton className="flex-1 w-full rounded-xl" />
      </div>
    );
  }

  if (!image) {
    return <div className="p-12 text-center text-muted-foreground">Image not found</div>;
  }

  const cursorClass =
    tool === "pen" || tool === "eraser"
      ? "cursor-crosshair"
      : tool === "text"
      ? "cursor-text"
      : tool === "crop"
      ? "cursor-crosshair"
      : "cursor-default";

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

          {/* Drawing tools */}
          <div className="flex bg-muted/50 p-1 rounded-md gap-0.5">
            {(
              [
                { t: "pointer", Icon: MousePointer2, label: "Pointer" },
                { t: "pen", Icon: PenTool, label: "Draw" },
                { t: "text", Icon: TypeIcon, label: "Text" },
                { t: "eraser", Icon: Eraser, label: "Erase" },
                { t: "crop", Icon: Crop, label: "Crop" },
              ] as const
            ).map(({ t, Icon, label }) => (
              <Button
                key={t}
                variant={tool === t ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => { setTool(t); if (t !== "crop") setCropRect(null); }}
                title={label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>

          {tool === "crop" && cropRect && cropRect.w > 4 && (
            <Button size="sm" className="h-8 gap-1" onClick={applyCrop} title="Apply crop">
              <Check className="h-3.5 w-3.5" />
              Apply Crop
            </Button>
          )}

          {/* Color picker */}
          {tool !== "crop" && tool !== "pointer" && (
            <div className="relative flex items-center gap-1.5" title="Annotation color">
              <div
                className="w-5 h-5 rounded-full border-2 border-muted-foreground/40 shadow cursor-pointer"
                style={{ background: penColor }}
              />
              <input
                type="color"
                value={penColor}
                onChange={(e) => setPenColor(e.target.value)}
                className="absolute inset-0 opacity-0 w-full cursor-pointer"
                title="Pick color"
              />
            </div>
          )}

          <div className="h-4 w-px bg-border mx-1" />

          {/* Zoom */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScale((s) => Math.max(0.1, +(s - 0.1).toFixed(1)))}
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-mono w-10 text-center">{Math.round(scale * 100)}%</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setScale((s) => Math.min(5, +(s + 0.1).toFixed(1)))}
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* Rotate 90° step */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title="Rotate 90°"
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          <div className="h-4 w-px bg-border mx-1" />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setAnnotations([])}
          >
            Clear
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
            onClick={() =>
              updateImage.mutate({ id, data: { notes, annotation: JSON.stringify(annotations) } })
            }
            disabled={updateImage.isPending}
            size="sm"
            className="h-8"
          >
            {updateImage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 bg-muted/30 relative overflow-hidden" ref={containerRef}>
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full ${cursorClass}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />

          {/* Text input overlay */}
          {pendingText && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
              <div className="bg-card rounded-xl shadow-2xl p-6 w-80 space-y-4">
                <Label className="font-semibold">Add annotation text</Label>
                <Input
                  autoFocus
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmText();
                    if (e.key === "Escape") { setPendingText(null); setTextInput(""); }
                  }}
                  placeholder="Type annotation..."
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setPendingText(null); setTextInput(""); }}>Cancel</Button>
                  <Button size="sm" onClick={confirmText}>Add</Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-72 border-l bg-card flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-sm">Image Details</h3>
            {image.patientName && (
              <p className="text-sm text-muted-foreground mt-0.5">{image.patientName}</p>
            )}
            {image.capturedAt && (
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(image.capturedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Free rotation slider */}
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Free Rotation</Label>
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
            <Label className="text-sm font-medium">Clinical Notes</Label>
            <Textarea
              className="min-h-[160px] resize-none text-sm"
              placeholder="Add notes for this image..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {annotations.length} annotation{annotations.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Image</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this image? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteImage.mutate({ id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
