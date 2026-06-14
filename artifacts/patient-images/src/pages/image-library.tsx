import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListImages, getListImagesQueryKey,
  useListPatients, getListPatientsQueryKey,
  useListPresentations, getListPresentationsQueryKey,
  useCreatePresentation, useUpdatePresentation,
  Presentation as ApiPresentation,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Check, Library, MonitorPlay, PlusCircle, X } from "lucide-react";
import { type Slide } from "@/components/PresentationBuilder";

export default function ImageLibrary() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [patientFilter, setPatientFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: allImages = [], isLoading: imagesLoading } = useListImages(
    {},
    { query: { queryKey: getListImagesQueryKey({}) } },
  );
  const { data: patients = [] } = useListPatients(
    {},
    { query: { queryKey: getListPatientsQueryKey({}) } },
  );
  const { data: presentations = [] } = useListPresentations(
    {},
    { query: { queryKey: getListPresentationsQueryKey({}) } },
  );

  const patientMap = new Map(
    (patients as any[]).map((p: any) => [p.id, p.name as string]),
  );

  const filteredImages = (allImages as any[]).filter((img: any) => {
    if (patientFilter === "all") return true;
    if (patientFilter === "unassigned") return img.isUnassigned;
    return img.patientId === parseInt(patientFilter, 10);
  });

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const updatePresentation = useUpdatePresentation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPresentationsQueryKey({}) });
        toast({ title: t("library.addedSuccess", { count: selected.size }) });
        clearSelection();
        setDialogOpen(false);
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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPresentationsQueryKey({}) });
        toast({ title: t("library.addedSuccess", { count: selected.size }) });
        clearSelection();
        setDialogOpen(false);
        setIsSaving(false);
      },
      onError: () => {
        toast({ variant: "destructive", title: t("common.error") });
        setIsSaving(false);
      },
    },
  });

  function addToPresentation(pres: ApiPresentation) {
    setIsSaving(true);
    const newSlides = Array.from(selected).map((id) => ({
      type: "single" as const,
      imageId: id,
    }));
    const existingSlides = ((pres.slides as Slide[]) ?? []);
    const existingIds = new Set(
      existingSlides
        .filter((s: any) => s.type === "single")
        .map((s: any) => s.imageId as number),
    );
    const merged: Slide[] = [
      ...existingSlides,
      ...newSlides.filter((ns) => !existingIds.has(ns.imageId)),
    ];
    updatePresentation.mutate({ id: pres.id, data: { title: pres.title, slides: merged } });
  }

  function createAndAdd() {
    setIsSaving(true);
    const newSlides: Slide[] = Array.from(selected).map((id) => ({
      type: "single" as const,
      imageId: id,
    }));
    createPresentation.mutate({ data: { title: t("presentation.untitled"), slides: newSlides } });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{t("library.title")}</h1>
          <p className="text-muted-foreground">{t("library.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {selected.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground shrink-0">
                {t("library.selectedCount", { count: selected.size })}
              </span>
              <Button variant="ghost" size="sm" onClick={clearSelection} className="gap-1.5 shrink-0">
                <X className="h-3.5 w-3.5" />
                {t("library.clearSelection")}
              </Button>
              <Button onClick={() => setDialogOpen(true)} className="gap-2 shrink-0">
                <MonitorPlay className="h-4 w-4" />
                {t("library.addToPresentation")}
              </Button>
            </>
          )}
          <Select value={patientFilter} onValueChange={setPatientFilter}>
            <SelectTrigger className="w-[200px] bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("gallery.allPatients")}</SelectItem>
              <SelectItem value="unassigned">{t("gallery.unassigned")}</SelectItem>
              {(patients as any[]).map((p: any) => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      {imagesLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {Array.from({ length: 18 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-16 text-center text-muted-foreground">
          <Library className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{t("library.noImages")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {filteredImages.map((img: any) => {
            const isSelected = selected.has(img.id);
            const patientName = img.patientId ? patientMap.get(img.patientId) : null;
            return (
              <button
                key={img.id}
                onClick={() => toggleSelect(img.id)}
                className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all duration-150 text-left group ${
                  isSelected
                    ? "border-primary ring-2 ring-primary/30 scale-[0.96]"
                    : "border-transparent hover:border-primary/50 hover:scale-[0.98]"
                }`}
              >
                <img
                  src={`/api/images/${img.id}/file`}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {isSelected && (
                  <div className="absolute inset-0 bg-primary/20 flex items-start justify-end p-1.5">
                    <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center shadow-lg">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  </div>
                )}
                {patientFilter === "all" && patientName && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] truncate px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {patientName}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Add to Presentation dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("library.selectPresentation")}</DialogTitle>
            <DialogDescription>{t("library.selectPresentationDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 border-dashed"
              onClick={createAndAdd}
              disabled={isSaving}
            >
              <PlusCircle className="h-4 w-4 text-primary" />
              {t("library.newPresentation")}
            </Button>
            {(presentations as ApiPresentation[]).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("library.noPresentations")}
              </p>
            ) : (
              (presentations as ApiPresentation[]).map((p) => (
                <Button
                  key={p.id}
                  variant="ghost"
                  className="w-full justify-start gap-2 h-auto py-2"
                  onClick={() => addToPresentation(p)}
                  disabled={isSaving}
                >
                  <MonitorPlay className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1 text-left">
                    {p.title || t("presentation.untitled")}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {((p.slides as any[]) ?? []).length} {t("presentation.slides")}
                  </span>
                </Button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
