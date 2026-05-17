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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tool = "pointer" | "pen" | "text" | "eraser";

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

function renderCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement | null,
  annotations: Annotation[],
  scale: number,
  rotation: number
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
  const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const isDrawingRef = useRef(false);
  const currentLineRef = useRef<number[]>([]);

  const { data: image, isLoading } = useGetImage(id, {
    query: { enabled: !!id, queryKey: getGetImageQueryKey(id) },
  });

  // Load image
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

  // Load saved data
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
    renderCanvas(canvas, imgRef.current, annotations, scale, rotation);
  }, [annotations, scale, rotation]);

  // Re-render whenever state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderCanvas(canvas, imgRef.current, annotations, scale, rotation);
  }, [annotations, scale, rotation]);

  // Resize observer
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
    const rx = cx * Math.cos(rad) - cy * Math.sin(rad);
    const ry = cx * Math.sin(rad) + cy * Math.cos(rad);
    return [rx, ry];
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tool === "pen" || tool === "eraser") {
      isDrawingRef.current = true;
      const [x, y] = getCanvasPoint(e);
      currentLineRef.current = [x, y];
    } else if (tool === "text") {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const [x, y] = getCanvasPoint(e);
      setPendingText({ x, y });
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
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
      : "cursor-default";

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.14))] -m-4 md:-m-6 lg:-m-8">
      {/* Toolbar */}
      <div className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
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
              ] as const
            ).map(({ t, Icon, label }) => (
              <Button
                key={t}
                variant={tool === t ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setTool(t)}
                title={label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>

          {/* Color picker */}
          <div className="flex items-center gap-1.5 ml-1" title="Annotation color">
            <div
              className="w-5 h-5 rounded-full border-2 border-white shadow"
              style={{ background: penColor }}
            />
            <input
              type="color"
              value={penColor}
              onChange={(e) => setPenColor(e.target.value)}
              className="w-6 h-6 opacity-0 absolute cursor-pointer"
              title="Pick color"
            />
          </div>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Zoom / rotate */}
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              title="Rotate 90°"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          </div>

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

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
            onClick={() => setShowDeleteDialog(true)}
            title="Delete image"
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

          {/* Inline text input overlay */}
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
                    if (e.key === "Escape") {
                      setPendingText(null);
                      setTextInput("");
                    }
                  }}
                  placeholder="Type annotation..."
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPendingText(null);
                      setTextInput("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={confirmText}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-72 border-l bg-card flex flex-col shrink-0">
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
          <div className="p-4 flex-1 flex flex-col gap-3">
            <Label className="text-sm font-medium">Clinical Notes</Label>
            <Textarea
              className="min-h-[180px] resize-none text-sm"
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
