import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  Image,
  useUpdateImage,
  useReorderImages,
  getGetImageQueryKey,
  getListPatientImagesQueryKey,
  getListImagesQueryKey,
} from "@workspace/api-client-react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar, User, FileText, Pencil, Loader2, Star, GripVertical } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ImageGridProps {
  images: Image[];
  columns: 1 | 2 | 4 | 8;
  showPatientName?: boolean;
  profileImageId?: number | null;
  onSetProfile?: (imageId: number) => void;
  reorderablePatientId?: number;
}

function SortableImageCard({
  image,
  children,
  suppressClickRef,
}: {
  image: Image;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
  suppressClickRef: React.MutableRefObject<boolean>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const dragHandle = (
    <button
      {...attributes}
      {...listeners}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      title="Drag to reorder"
      className="absolute top-1.5 left-1.5 p-1 rounded-full bg-black/40 text-white opacity-60 hover:opacity-100 hover:bg-black/70 cursor-grab active:cursor-grabbing touch-none z-10"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClickCapture={(e) => {
        // A drag that ends on top of another card fires a native click on that
        // card's <Link>, not the one where the drag started — guard globally.
        if (suppressClickRef.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <Link href={`/editor/${image.id}`}>{children(dragHandle)}</Link>
    </div>
  );
}

export function ImageGrid({ images, columns, showPatientName = false, profileImageId, onSetProfile, reorderablePatientId }: ImageGridProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editingImage, setEditingImage] = useState<Image | null>(null);
  const [draftNotes, setDraftNotes] = useState("");
  const [orderedImages, setOrderedImages] = useState(images);

  useEffect(() => {
    setOrderedImages(images);
  }, [images]);

  const { mutate: updateImage, isPending } = useUpdateImage();
  const { mutate: reorderImages, isPending: isReordering } = useReorderImages();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const canReorder = typeof reorderablePatientId === "number";
  const suppressClickRef = useRef(false);

  const getGridClass = () => {
    switch (columns) {
      case 1: return "grid-cols-1";
      case 2: return "grid-cols-1 sm:grid-cols-2";
      case 4: return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";
      case 8: return "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8";
      default: return "grid-cols-4";
    }
  };

  const openEdit = (e: React.MouseEvent, image: Image) => {
    e.preventDefault();
    e.stopPropagation();
    setDraftNotes(image.notes ?? "");
    setEditingImage(image);
  };

  const handleSave = () => {
    if (!editingImage) return;
    updateImage(
      { id: editingImage.id, data: { notes: draftNotes } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getGetImageQueryKey(editingImage.id) });
          void queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(editingImage.patientId ?? 0) });
          void queryClient.invalidateQueries({ queryKey: getListImagesQueryKey() });
          setEditingImage(null);
          toast({ title: "Description saved" });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to save description" });
        },
      },
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    // The mouseup/click that ends a drag lands on whichever card is under the
    // cursor (the drop target), not the card the drag started on. Suppress
    // that trailing click on every card so it doesn't trigger navigation.
    suppressClickRef.current = true;
    setTimeout(() => { suppressClickRef.current = false; }, 0);

    const { active, over } = event;
    if (!over || active.id === over.id || !canReorder) return;

    const oldIndex = orderedImages.findIndex((img) => img.id === active.id);
    const newIndex = orderedImages.findIndex((img) => img.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = arrayMove(orderedImages, oldIndex, newIndex);
    setOrderedImages(next);

    reorderImages(
      { data: { patientId: reorderablePatientId!, orderedIds: next.map((img) => img.id) } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(reorderablePatientId!) });
          void queryClient.invalidateQueries({ queryKey: getListImagesQueryKey() });
        },
        onError: () => {
          setOrderedImages(images);
          toast({ variant: "destructive", title: "Failed to save new order" });
        },
      },
    );
  };

  const renderCard = (image: Image, dragHandle?: React.ReactNode) => (
    <Card className="group overflow-hidden cursor-pointer hover-elevate transition-all border-muted-foreground/20 hover:border-primary/50 relative">
      <div className="aspect-square overflow-hidden relative">
        <img
          src={`/api/images/${image.id}/file`}
          alt={image.notes || "Clinical image"}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          draggable={false}
        />
        {dragHandle}
        {onSetProfile && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSetProfile(image.id); }}
            title={t("patients.setAsProfile")}
            className={`absolute top-1.5 right-1.5 p-1 rounded-full transition-all shadow-sm ${
              profileImageId === image.id
                ? "bg-primary text-primary-foreground opacity-100"
                : "bg-black/40 text-white opacity-60 hover:opacity-100 hover:bg-black/70"
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${profileImageId === image.id ? "fill-current" : ""}`} />
          </button>
        )}
        {profileImageId === image.id && (
          <div className="absolute bottom-1.5 left-1.5 bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1">
            <Star className="h-2.5 w-2.5 fill-current" />
            {t("patients.profilePhoto")}
          </div>
        )}
      </div>

      <div className={`p-2.5 sm:p-3 border-t bg-card text-xs transition-colors ${columns === 8 ? "hidden" : "block"}`}>
        <div className="flex justify-between items-start mb-1">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium truncate max-w-[80%]">
            <Calendar className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {format(new Date(image.capturedAt), "MMM d, yyyy")}
            </span>
          </div>
          <button
            onClick={(e) => openEdit(e, image)}
            title="Edit description"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>

        {showPatientName && image.patientName && (
          <div className="flex items-center gap-1.5 text-foreground mt-1.5 truncate">
            <User className="h-3 w-3 shrink-0 text-primary/70" />
            <span className="truncate">{image.patientName}</span>
          </div>
        )}

        {image.notes ? (
          <div className="flex items-start gap-1.5 text-muted-foreground mt-1.5 line-clamp-1">
            <FileText className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="truncate" title={image.notes}>{image.notes}</span>
          </div>
        ) : (
          <button
            onClick={(e) => openEdit(e, image)}
            className="flex items-center gap-1 mt-1.5 text-muted-foreground/60 hover:text-primary transition-colors text-[11px]"
          >
            <Pencil className="h-2.5 w-2.5" />
            Add description
          </button>
        )}
      </div>

      {columns === 8 && (
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-white text-[10px]">
          <div className="truncate font-medium">
            {format(new Date(image.capturedAt), "MMM d, yy")}
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <>
      {canReorder ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedImages.map((img) => img.id)} strategy={rectSortingStrategy}>
            <div className={`grid ${getGridClass()} gap-4 transition-all duration-300`}>
              {orderedImages.map((image) => (
                <SortableImageCard key={image.id} image={image} suppressClickRef={suppressClickRef}>
                  {(dragHandle) => renderCard(image, dragHandle)}
                </SortableImageCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className={`grid ${getGridClass()} gap-4 transition-all duration-300`}>
          {images.map((image) => (
            <Link key={image.id} href={`/editor/${image.id}`}>
              {renderCard(image)}
            </Link>
          ))}
        </div>
      )}

      <Dialog open={!!editingImage} onOpenChange={(open) => { if (!open) setEditingImage(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Image Description</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="img-notes">
              Describe what this image shows
            </Label>
            <Textarea
              id="img-notes"
              placeholder="e.g. Pre-op lateral view, left knee, showing medial compartment narrowing"
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              className="resize-none h-28"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingImage(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
