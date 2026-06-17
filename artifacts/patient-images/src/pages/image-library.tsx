import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload, Trash2, Check, Library, MonitorPlay, PlusCircle, X, ImagePlus, Pencil,
  Play, Tags as TagsIcon, Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useListPresentations, getListPresentationsQueryKey,
  useCreatePresentation, useUpdatePresentation,
  Presentation as ApiPresentation,
  useListPatients, getListPatientsQueryKey,
} from "@workspace/api-client-react";
import { queryClient as globalQueryClient } from "@/lib/queryClient";
import { type Slide } from "@/components/PresentationBuilder";

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

async function getUploadUrl(fileName: string, mimeType: string) {
  const res = await fetch("/api/library-assets/upload-url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, mimeType }),
  });
  if (!res.ok) throw new Error("Could not get upload URL");
  return res.json() as Promise<{ signedUrl: string; objectName: string }>;
}

async function registerAsset(objectName: string, fileName: string, mimeType: string, title: string) {
  const res = await fetch("/api/library-assets/register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectName, fileName, mimeType, title }),
  });
  if (!res.ok) throw new Error("Failed to register asset");
  return res.json() as Promise<LibraryAsset>;
}

async function deleteAsset(id: number) {
  const res = await fetch(`/api/library-assets/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) throw new Error("Delete failed");
}

async function patchAsset(id: number, title: string) {
  const res = await fetch(`/api/library-assets/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Update failed");
  return res.json() as Promise<LibraryAsset>;
}

async function addTagToAsset(assetId: number, tagId: number) {
  const res = await fetch(`/api/library-assets/${assetId}/tags`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagId }),
  });
  if (!res.ok && res.status !== 409) throw new Error("Tag assign failed");
}

async function removeTagFromAsset(assetId: number, tagId: number) {
  const res = await fetch(`/api/library-assets/${assetId}/tags/${tagId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) throw new Error("Tag remove failed");
}

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/tiff",
  "video/mp4", "video/webm", "video/quicktime", "video/ogg",
];

export default function ImageLibrary() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<LibraryAsset | null>(null);
  const [editTarget, setEditTarget] = useState<LibraryAsset | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTagIds, setEditTagIds] = useState<Set<number>>(new Set());
  const [addToPresentationOpen, setAddToPresentationOpen] = useState(false);
  const [selectedPresentation, setSelectedPresentation] = useState<string>("new");
  const [newPresentationTitle, setNewPresentationTitle] = useState("");
  const [dialogPatientId, setDialogPatientId] = useState<string>("all");
  const [isSaving, setIsSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [filterTagId, setFilterTagId] = useState<number | null>(null);
  const [videoPlayer, setVideoPlayer] = useState<LibraryAsset | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: fetchLibrary,
  });

  const { data: allTags = [] } = useQuery({
    queryKey: TAGS_QUERY_KEY,
    queryFn: fetchAllTags,
  });

  const { data: presentations = [] } = useListPresentations(
    {},
    { query: { queryKey: getListPresentationsQueryKey({}) } },
  );

  const { data: patients = [] } = useListPatients(
    {},
    { query: { queryKey: getListPatientsQueryKey({}) } },
  );

  const updatePresentation = useUpdatePresentation({
    mutation: {
      onSuccess: () => {
        globalQueryClient.invalidateQueries({ queryKey: getListPresentationsQueryKey({}) });
        toast({ title: t("library.addedSuccess", { count: selected.size }) });
        setSelected(new Set());
        setAddToPresentationOpen(false);
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
        const slides: Slide[] = [...selected].map((id) => {
          const asset = assets.find((a) => a.id === id);
          if (asset?.mediaType === "video") return { type: "video" as const, imageId: id };
          return { type: "single" as const, imageId: id };
        });
        updatePresentation.mutate({
          id: newPres.id,
          data: { slides: slides as unknown[] },
        });
      },
      onError: () => {
        toast({ variant: "destructive", title: t("common.error") });
        setIsSaving(false);
      },
    },
  });

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => ALLOWED_TYPES.includes(f.type));
    if (!arr.length) {
      toast({ variant: "destructive", title: t("library.unsupportedFile") });
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    let done = 0;
    for (const file of arr) {
      try {
        const { signedUrl, objectName } = await getUploadUrl(file.name, file.type);
        await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const title = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
        await registerAsset(objectName, file.name, file.type, title);
        done++;
        setUploadProgress(Math.round((done / arr.length) * 100));
      } catch (err) {
        console.error("Upload error:", err);
        toast({ variant: "destructive", title: `Upload failed: ${file.name}` });
      }
    }
    await qc.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
    setUploading(false);
    setUploadProgress(0);
    if (done > 0) toast({ title: t("library.uploadedCount", { count: done }) });
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      uploadFiles(e.target.files);
      e.target.value = "";
    }
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
    },
    [],
  );

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteAsset(deleteTarget.id);
      await qc.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
      setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
      toast({ title: t("library.deleted") });
    } catch {
      toast({ variant: "destructive", title: t("common.error") });
    }
    setDeleteTarget(null);
  }

  async function saveEdit() {
    if (!editTarget) return;
    try {
      await patchAsset(editTarget.id, editTitle);
      const currentTagIds = new Set(editTarget.tags.map((t) => t.id));
      const toAdd = [...editTagIds].filter((id) => !currentTagIds.has(id));
      const toRemove = [...currentTagIds].filter((id) => !editTagIds.has(id));
      await Promise.all([
        ...toAdd.map((tagId) => addTagToAsset(editTarget.id, tagId)),
        ...toRemove.map((tagId) => removeTagFromAsset(editTarget.id, tagId)),
      ]);
      await qc.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
    } catch {
      toast({ variant: "destructive", title: t("common.error") });
    }
    setEditTarget(null);
  }

  function openEdit(asset: LibraryAsset) {
    setEditTarget(asset);
    setEditTitle(asset.title);
    setEditTagIds(new Set(asset.tags.map((t) => t.id)));
  }

  function handleAddToPresentation() {
    if (!selected.size) return;
    setAddToPresentationOpen(true);
  }

  function quickAddToPresentation(asset: LibraryAsset) {
    setSelected(new Set([asset.id]));
    setAddToPresentationOpen(true);
  }

  function confirmAddToPresentation() {
    if (!selected.size) return;
    setIsSaving(true);
    const slides: Slide[] = [...selected].map((id) => {
      const asset = assets.find((a) => a.id === id);
      if (asset?.mediaType === "video") return { type: "video" as const, imageId: id };
      return { type: "single" as const, imageId: id };
    });
    if (selectedPresentation === "new") {
      const title = newPresentationTitle.trim() || t("library.defaultPresentationTitle");
      const patId = dialogPatientId !== "all" ? parseInt(dialogPatientId, 10) : undefined;
      createPresentation.mutate({ data: { title, slides: slides as unknown[], ...(patId ? { patientId: patId } : {}) } });
    } else {
      const pres = (presentations as ApiPresentation[]).find(
        (p) => String(p.id) === selectedPresentation,
      );
      if (!pres) return;
      const rawSlides = (pres as any).slides;
      const existing: Slide[] = Array.isArray(rawSlides) ? rawSlides : (() => { try { return JSON.parse(rawSlides || "[]"); } catch { return []; } })();
      updatePresentation.mutate({
        id: pres.id,
        data: { slides: [...existing, ...slides] as unknown[] },
      });
    }
  }

  const filteredAssets = filterTagId
    ? assets.filter((a) => a.tags.some((t) => t.id === filterTagId))
    : assets;

  const assetCount = filteredAssets.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            {t("library.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("library.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selected.size > 0 && (
            <>
              <Badge variant="secondary">{t("library.selectedCount", { count: selected.size })}</Badge>
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                <X className="h-4 w-4 mr-1" />
                {t("library.clearSelection")}
              </Button>
              <Button size="sm" onClick={handleAddToPresentation}>
                <MonitorPlay className="h-4 w-4 mr-1" />
                {t("library.addToPresentation")}
              </Button>
            </>
          )}
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-4 w-4 mr-1" />
            {uploading ? `${uploadProgress}%` : t("library.upload")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime,video/ogg,.mov,.mp4,.webm,.ogv"
            multiple
            className="hidden"
            onChange={onFileInputChange}
          />
        </div>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 border-b shrink-0 overflow-x-auto">
          <TagsIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <button
            onClick={() => setFilterTagId(null)}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors",
              filterTagId === null
                ? "bg-primary text-primary-foreground border-primary"
                : "border-muted-foreground/30 hover:border-muted-foreground/60",
            )}
          >
            {t("library.allAssets")}
          </button>
          {allTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setFilterTagId(filterTagId === tag.id ? null : tag.id)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors",
                filterTagId === tag.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-muted-foreground/30 hover:border-muted-foreground/60",
              )}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : assetCount === 0 && assets.length === 0 ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center h-64 rounded-xl border-2 border-dashed transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20",
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <ImagePlus className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm font-medium">{t("library.noAssets")}</p>
            <p className="text-muted-foreground/60 text-xs mt-1">{t("library.dropHint")}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-1" />
              {t("library.upload")}
            </Button>
          </div>
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {filteredAssets.map((asset) => {
              const isSelected = selected.has(asset.id);
              const isVideo = asset.mediaType === "video";
              return (
                <div
                  key={asset.id}
                  className={cn(
                    "group relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all",
                    isSelected
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-transparent hover:border-muted-foreground/30",
                  )}
                  onClick={() => toggleSelect(asset.id)}
                >
                  <div className="aspect-square bg-muted relative">
                    {isVideo ? (
                      <>
                        <video
                          src={`/api/library-assets/${asset.id}/file`}
                          className="w-full h-full object-cover"
                          preload="metadata"
                          muted
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                          <div
                            className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg pointer-events-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVideoPlayer(asset);
                            }}
                          >
                            <Play className="h-5 w-5 text-gray-800 ml-0.5" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <img
                        src={`/api/library-assets/${asset.id}/file`}
                        alt={asset.title || asset.fileName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>

                  {isSelected && (
                    <div className="absolute top-1.5 left-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}

                  {isVideo && (
                    <div className="absolute top-1.5 left-1.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                        {t("library.video")}
                      </Badge>
                    </div>
                  )}

                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="h-6 w-6 rounded bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background shadow"
                      title={t("library.addToPresentation")}
                      onClick={(e) => { e.stopPropagation(); quickAddToPresentation(asset); }}
                    >
                      <MonitorPlay className="h-3 w-3" />
                    </button>
                    <button
                      className="h-6 w-6 rounded bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background shadow"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(asset);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      className="h-6 w-6 rounded bg-background/80 backdrop-blur flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground shadow"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(asset); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                    {asset.title && (
                      <p className="text-white text-xs truncate leading-tight">{asset.title}</p>
                    )}
                    {asset.tags.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {asset.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag.id}
                            className="text-[9px] bg-white/20 text-white rounded px-1 leading-4"
                          >
                            {tag.name}
                          </span>
                        ))}
                        {asset.tags.length > 2 && (
                          <span className="text-[9px] text-white/70">+{asset.tags.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {!filterTagId && (
              <button
                className={cn(
                  "aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/40",
                )}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-6 w-6 text-muted-foreground/60" />
                <span className="text-xs text-muted-foreground/60">
                  {uploading ? `${uploadProgress}%` : t("library.upload")}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("library.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("library.deleteDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog (title + tags) */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("library.editTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder={t("library.titlePlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
            />
            {allTags.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  {t("library.assignTags")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => {
                    const assigned = editTagIds.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => setEditTagIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(tag.id)) next.delete(tag.id);
                          else next.add(tag.id);
                          return next;
                        })}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                          assigned
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-muted-foreground/30 hover:border-muted-foreground/60",
                        )}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={saveEdit}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to presentation dialog */}
      <Dialog open={addToPresentationOpen} onOpenChange={setAddToPresentationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("library.selectPresentation")}</DialogTitle>
            <DialogDescription>{t("library.selectPresentationDesc")}</DialogDescription>
          </DialogHeader>
          {/* Patient filter */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Patient</p>
            <Select value={dialogPatientId} onValueChange={(v) => { setDialogPatientId(v); setSelectedPresentation("new"); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All patients</SelectItem>
                {(patients as any[]).map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Presentation picker */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Presentation</p>
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
                  .filter((p) =>
                    dialogPatientId === "all" ||
                    String((p as any).patientId) === dialogPatientId,
                  )
                  .map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.title}
                    </SelectItem>
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
            <Button variant="outline" onClick={() => setAddToPresentationOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmAddToPresentation} disabled={isSaving}>
              <MonitorPlay className="h-4 w-4 mr-1" />
              {t("library.addToPresentation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video player dialog */}
      <Dialog open={!!videoPlayer} onOpenChange={(o) => !o && setVideoPlayer(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{videoPlayer?.title || videoPlayer?.fileName}</DialogTitle>
          </DialogHeader>
          {videoPlayer && (
            <>
              <video
                key={videoPlayer.id}
                src={`/api/library-assets/${videoPlayer.id}/file`}
                controls
                autoPlay
                className="w-full rounded-lg max-h-[60vh]"
              />
              {/\.mov$/i.test(videoPlayer.fileName) && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-3 py-2">
                  ⚠ .mov (QuickTime) files only play in Safari. Use the download link to convert, or re-upload as .mp4.
                </p>
              )}
              <DialogFooter>
                <a
                  href={`/api/library-assets/${videoPlayer.id}/file`}
                  download={videoPlayer.fileName}
                  className="mr-auto"
                >
                  <Button variant="outline" size="sm">Download</Button>
                </a>
                <Button size="sm" onClick={() => { quickAddToPresentation(videoPlayer); setVideoPlayer(null); }}>
                  <MonitorPlay className="h-4 w-4 mr-1" />
                  {t("library.addToPresentation")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
