import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListImages,
  getListImagesQueryKey,
  useListPatients,
  getListPatientsQueryKey,
  useListPresentations,
  getListPresentationsQueryKey,
  useCreatePresentation,
  useUpdatePresentation,
  Presentation as ApiPresentation,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { queryClient as globalQueryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { downloadImagesZip, downloadImagesIndividually } from "@/lib/imageExport";
import { type Slide } from "@/components/PresentationBuilder";
import {
  LayoutGrid, ImageIcon, Camera, Tags as TagsIcon, Check, X, MonitorPlay,
  Download, ChevronDown, PlusCircle, Play, FileArchive, Files, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface LibraryTag {
  id: number;
  name: string;
}

interface LibraryAsset {
  id: number;
  title: string;
  filePath: string;
  fileName: string;
  mediaType: "image" | "video";
  uploadedAt: string;
  createdAt: string;
  tags: LibraryTag[];
}

const LIBRARY_QUERY_KEY = ["library-assets"];
const TAGS_QUERY_KEY = ["admin-tags"];

async function fetchLibrary(): Promise<LibraryAsset[]> {
  const res = await fetch("/api/library-assets", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load library");
  return res.json();
}

async function fetchAllTags(): Promise<LibraryTag[]> {
  const res = await fetch("/api/tags", { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

interface GalleryItem {
  key: string;
  id: number;
  kind: "patient" | "library";
  fileUrl: string;
  fileName: string;
  mediaType: "image" | "video";
  capturedAt: string;
  patientName?: string | null;
  title?: string;
  tags: LibraryTag[];
}

export default function Gallery() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [gridColumns, setGridColumns] = useState<1 | 2 | 4 | 8>(4);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<GalleryItem | null>(null);
  const [createPresentationOpen, setCreatePresentationOpen] = useState(false);
  const [selectedPresentation, setSelectedPresentation] = useState<string>("new");
  const [newPresentationTitle, setNewPresentationTitle] = useState("");
  const [dialogPatientId, setDialogPatientId] = useState<string>("all");
  const [isSaving, setIsSaving] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [exportingIndividually, setExportingIndividually] = useState(false);

  const { data: patients } = useListPatients({}, {
    query: { queryKey: getListPatientsQueryKey() }
  });

  const { data: allTags = [] } = useQuery({
    queryKey: TAGS_QUERY_KEY,
    queryFn: fetchAllTags,
  });

  const { data: libraryAssets = [], isLoading: libraryLoading } = useQuery({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: fetchLibrary,
  });

  const { data: presentations = [] } = useListPresentations(
    {},
    { query: { queryKey: getListPresentationsQueryKey({}) } },
  );

  const tagIdsParam = selectedTagIds.size > 0
    ? [...selectedTagIds].join(",")
    : undefined;

  const { data: allImages, isLoading: imagesLoading } = useListImages(
    { tagIds: tagIdsParam },
    { query: { queryKey: getListImagesQueryKey({ tagIds: tagIdsParam }) } }
  );

  const filteredLibraryAssets = selectedTagIds.size > 0
    ? libraryAssets.filter((a) => a.tags.some((tag) => selectedTagIds.has(tag.id)))
    : libraryAssets;

  const items: GalleryItem[] = useMemo(() => {
    const patientItems: GalleryItem[] = (allImages ?? []).map((img) => ({
      key: `p-${img.id}`,
      id: img.id,
      kind: "patient",
      fileUrl: `/api/images/${img.id}/file`,
      fileName: img.fileName ?? `image_${img.id}.jpg`,
      mediaType: "image",
      capturedAt: img.capturedAt,
      patientName: img.patientName,
      tags: [],
    }));
    const libraryItems: GalleryItem[] = filteredLibraryAssets.map((asset) => ({
      key: `l-${asset.id}`,
      id: asset.id,
      kind: "library",
      fileUrl: `/api/images/${asset.id}/file`,
      fileName: asset.fileName,
      mediaType: asset.mediaType,
      capturedAt: asset.uploadedAt,
      title: asset.title,
      tags: asset.tags,
    }));
    return [...patientItems, ...libraryItems].sort(
      (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
    );
  }, [allImages, filteredLibraryAssets]);

  const isLoading = imagesLoading || libraryLoading;

  const itemsByKey = new Map(items.map((it) => [it.key, it]));
  const selectedItems = [...selected].map((k) => itemsByKey.get(k)).filter(Boolean) as GalleryItem[];

  function toggleTag(tagId: number) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelected(new Set());
  }

  const updatePresentation = useUpdatePresentation({
    mutation: {
      onSuccess: () => {
        globalQueryClient.invalidateQueries({ queryKey: getListPresentationsQueryKey({}) });
        toast({ title: t("gallery.presentationCreated") });
        exitSelectionMode();
        setCreatePresentationOpen(false);
        setIsSaving(false);
      },
      onError: () => {
        toast({ variant: "destructive", title: t("common.error") });
        setIsSaving(false);
      },
    },
  });

  const createPresentation = useCreatePresentation({
    mutation: {
      onSuccess: (newPres: ApiPresentation) => {
        globalQueryClient.invalidateQueries({ queryKey: getListPresentationsQueryKey({}) });
        const slides: Slide[] = selectedItems.map((item) =>
          item.mediaType === "video"
            ? { type: "video" as const, imageId: item.id }
            : { type: "single" as const, imageId: item.id },
        );
        updatePresentation.mutate({ id: newPres.id, data: { slides: slides as unknown[] } });
      },
      onError: () => {
        toast({ variant: "destructive", title: t("common.error") });
        setIsSaving(false);
      },
    },
  });

  function confirmCreatePresentation() {
    if (!selectedItems.length) return;
    setIsSaving(true);
    const slides: Slide[] = selectedItems.map((item) =>
      item.mediaType === "video"
        ? { type: "video" as const, imageId: item.id }
        : { type: "single" as const, imageId: item.id },
    );
    if (selectedPresentation === "new") {
      const title = newPresentationTitle.trim() || t("library.defaultPresentationTitle");
      const patId = dialogPatientId !== "all" ? parseInt(dialogPatientId, 10) : undefined;
      createPresentation.mutate({ data: { title, slides: slides as unknown[], ...(patId ? { patientId: patId } : {}) } });
    } else {
      const pres = (presentations as ApiPresentation[]).find((p) => String(p.id) === selectedPresentation);
      if (!pres) return;
      const rawSlides = (pres as any).slides;
      const existing: Slide[] = Array.isArray(rawSlides) ? rawSlides : (() => { try { return JSON.parse(rawSlides || "[]"); } catch { return []; } })();
      updatePresentation.mutate({ id: pres.id, data: { slides: [...existing, ...slides] as unknown[] } });
    }
  }

  async function handleExportZip() {
    if (!selectedItems.length) return;
    setExportingZip(true);
    try {
      await downloadImagesZip(selectedItems.map((item) => item.id));
    } catch {
      toast({ variant: "destructive", title: t("gallery.exportFailed") });
    } finally {
      setExportingZip(false);
    }
  }

  async function handleExportIndividually() {
    if (!selectedItems.length) return;
    setExportingIndividually(true);
    try {
      await downloadImagesIndividually(
        selectedItems.map((item) => ({ url: item.fileUrl, fileName: item.fileName })),
      );
    } catch {
      toast({ variant: "destructive", title: t("gallery.exportFailed") });
    } finally {
      setExportingIndividually(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{t("gallery.title")}</h1>
          <p className="text-muted-foreground">{t("gallery.subtitle")}</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border shrink-0">
            {[1, 2, 4, 8].map((cols) => (
              <Button
                key={cols}
                variant={gridColumns === cols ? "secondary" : "ghost"}
                size="sm"
                className="h-8 w-9 px-0"
                onClick={() => setGridColumns(cols as 1 | 2 | 4 | 8)}
                title={`${cols} column${cols > 1 ? 's' : ''}`}
              >
                <LayoutGrid className="h-4 w-4" style={{
                  opacity: gridColumns === cols ? 1 : 0.5,
                  transform: `scale(${cols === 1 ? 1.2 : cols === 2 ? 1 : cols === 4 ? 0.8 : 0.6})`
                }} />
              </Button>
            ))}
          </div>

          <Button
            variant={selectionMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
          >
            {selectionMode ? <X className="h-4 w-4 mr-1" /> : <Check className="h-4 w-4 mr-1" />}
            {selectionMode ? t("common.cancel") : t("gallery.select")}
          </Button>
        </div>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <TagsIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <button
            onClick={() => setSelectedTagIds(new Set())}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors",
              selectedTagIds.size === 0
                ? "bg-primary text-primary-foreground border-primary"
                : "border-muted-foreground/30 hover:border-muted-foreground/60",
            )}
          >
            {t("gallery.showAll")}
          </button>
          {allTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors",
                selectedTagIds.has(tag.id)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-muted-foreground/30 hover:border-muted-foreground/60",
              )}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {/* Selection toolbar */}
      {selectionMode && selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-muted/50 border rounded-lg px-3 py-2">
          <Badge variant="secondary">{t("gallery.selectedCount", { count: selected.size })}</Badge>
          <Button size="sm" onClick={() => setCreatePresentationOpen(true)}>
            <MonitorPlay className="h-4 w-4 mr-1" />
            {t("gallery.createPresentation")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={exportingZip || exportingIndividually}>
                {(exportingZip || exportingIndividually) ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                {t("gallery.export")}
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleExportZip} disabled={exportingZip}>
                <FileArchive className="h-4 w-4 mr-2" />
                {t("gallery.exportZip")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportIndividually} disabled={exportingIndividually}>
                <Files className="h-4 w-4 mr-2" />
                {t("gallery.exportIndividually")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t("library.clearSelection")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="aspect-square rounded-xl" />)}
        </div>
      ) : items.length > 0 ? (
        <GalleryGrid
          items={items}
          columns={gridColumns}
          selectionMode={selectionMode}
          selected={selected}
          onToggleSelect={toggleSelect}
          onPreview={setPreviewItem}
        />
      ) : (
        <div className="flex flex-col items-center justify-center p-16 text-center border rounded-xl bg-card border-dashed">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ImageIcon className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-medium text-foreground">{t("gallery.noImages")}</h3>
          <p className="text-muted-foreground max-w-sm mt-2 mb-6">
            {selectedTagIds.size > 0
              ? t("gallery.noImagesTags")
              : t("gallery.noImagesEmpty")}
          </p>
          <Button asChild>
            <Link href="/capture">
              <Camera className="mr-2 h-4 w-4" />
              {t("gallery.captureImage")}
            </Link>
          </Button>
        </div>
      )}

      {/* Preview dialog for items that can't be navigated to (library assets) */}
      <Dialog open={!!previewItem} onOpenChange={(o) => !o && setPreviewItem(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewItem?.title || previewItem?.fileName}</DialogTitle>
          </DialogHeader>
          {previewItem && (
            previewItem.mediaType === "video" ? (
              <video
                key={previewItem.key}
                src={previewItem.fileUrl}
                controls
                autoPlay
                className="w-full rounded-lg max-h-[60vh]"
              />
            ) : (
              <img
                src={previewItem.fileUrl}
                alt={previewItem.title || previewItem.fileName}
                className="w-full rounded-lg max-h-[60vh] object-contain"
              />
            )
          )}
        </DialogContent>
      </Dialog>

      {/* Create/add-to presentation dialog */}
      <Dialog open={createPresentationOpen} onOpenChange={setCreatePresentationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("library.selectPresentation")}</DialogTitle>
            <DialogDescription>{t("library.selectPresentationDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("patients.title")}</p>
            <Select value={dialogPatientId} onValueChange={(v) => { setDialogPatientId(v); setSelectedPresentation("new"); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("gallery.allPatients")}</SelectItem>
                {(patients as any[])?.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("presentation.hubTitle")}</p>
            <Select value={selectedPresentation} onValueChange={setSelectedPresentation}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">
                  <span className="flex items-center gap-1.5">
                    <PlusCircle className="h-4 w-4" />
                    {t("library.newPresentation")}
                  </span>
                </SelectItem>
                {(presentations as ApiPresentation[])
                  .filter((p) => dialogPatientId === "all" || String((p as any).patientId) === dialogPatientId)
                  .map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {selectedPresentation === "new" && (
            <Input
              placeholder={t("library.newPresentationPlaceholder")}
              value={newPresentationTitle}
              onChange={(e) => setNewPresentationTitle(e.target.value)}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePresentationOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmCreatePresentation} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MonitorPlay className="h-4 w-4 mr-1" />}
              {t("gallery.createPresentation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface GalleryGridProps {
  items: GalleryItem[];
  columns: 1 | 2 | 4 | 8;
  selectionMode: boolean;
  selected: Set<string>;
  onToggleSelect: (key: string) => void;
  onPreview: (item: GalleryItem) => void;
}

function GalleryGrid({ items, columns, selectionMode, selected, onToggleSelect, onPreview }: GalleryGridProps) {
  const { t } = useTranslation();

  const getGridClass = () => {
    switch (columns) {
      case 1: return "grid-cols-1";
      case 2: return "grid-cols-1 sm:grid-cols-2";
      case 4: return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";
      case 8: return "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8";
      default: return "grid-cols-4";
    }
  };

  return (
    <div className={`grid ${getGridClass()} gap-4 transition-all duration-300`}>
      {items.map((item) => {
        const isSelected = selected.has(item.key);
        const tile = (
          <div
            className={cn(
              "group relative rounded-xl overflow-hidden border-2 bg-card transition-all",
              isSelected ? "border-primary ring-2 ring-primary/30" : "border-muted-foreground/20 hover:border-primary/50",
            )}
          >
            <div className="aspect-square overflow-hidden relative bg-muted">
              {item.mediaType === "video" ? (
                <>
                  <video src={item.fileUrl} className="w-full h-full object-cover" preload="metadata" muted />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                    <div className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                      <Play className="h-5 w-5 text-gray-800 ml-0.5" />
                    </div>
                  </div>
                </>
              ) : (
                <img
                  src={item.fileUrl}
                  alt={item.title || item.fileName}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
              )}

              {item.kind === "library" && (
                <div className="absolute top-1.5 left-1.5">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                    {t("gallery.libraryBadge")}
                  </Badge>
                </div>
              )}

              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(item.key); }}
                className={cn(
                  "absolute top-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center shadow transition-all",
                  isSelected
                    ? "bg-primary text-primary-foreground opacity-100"
                    : "bg-black/40 text-white opacity-0 group-hover:opacity-100",
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>

            {columns !== 8 && (
              <div className="p-2 text-xs border-t truncate">
                <span className="truncate block">
                  {item.kind === "patient"
                    ? (item.patientName ?? t("gallery.unassigned"))
                    : (item.title || item.fileName)}
                </span>
                <span className="text-muted-foreground/70 text-[10px]">
                  {format(new Date(item.capturedAt), "MMM d, yyyy")}
                </span>
              </div>
            )}
          </div>
        );

        const handleTileClick = (e: React.MouseEvent) => {
          if (selectionMode) {
            e.preventDefault();
            onToggleSelect(item.key);
          } else if (item.kind === "library") {
            e.preventDefault();
            onPreview(item);
          }
        };

        if (item.kind === "patient" && !selectionMode) {
          return (
            <Link key={item.key} href={`/editor/${item.id}`}>
              <div onClick={handleTileClick} className="cursor-pointer">{tile}</div>
            </Link>
          );
        }
        return (
          <div key={item.key} onClick={handleTileClick} className="cursor-pointer">
            {tile}
          </div>
        );
      })}
    </div>
  );
}
