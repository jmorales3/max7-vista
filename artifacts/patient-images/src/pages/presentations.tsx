import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListPresentations, getListPresentationsQueryKey,
  useListImages, getListImagesQueryKey,
  useListPatients, getListPatientsQueryKey,
  useListTags, getListTagsQueryKey,
  useCreatePresentation, useUpdatePresentation, useDeletePresentation,
  Presentation as ApiPresentation,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PlusCircle, Play, Pencil, Trash2, Images, ArrowLeft, Download, Loader2,
  FileText, Presentation as PresentationIcon, ChevronDown, ChevronRight,
  Tags as TagsIcon, Check, ImageIcon, Users,
} from "lucide-react";
import { format } from "date-fns";
import { PresentationBuilder, type Slide, type PickerImage } from "@/components/PresentationBuilder";
import { exportPresentationToPdf, exportPresentationToPptx } from "@/lib/presentationExport";
import { cn } from "@/lib/utils";

type Mode = "list" | "select-tags" | "select-patients" | "builder";

export default function Presentations() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("list");
  const [editingPresentation, setEditingPresentation] = useState<ApiPresentation | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiPresentation | null>(null);
  const [openViewer, setOpenViewer] = useState<ApiPresentation | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [wizardTagIds, setWizardTagIds] = useState<Set<number>>(new Set());
  const [wizardPatientIds, setWizardPatientIds] = useState<Set<number>>(new Set());
  const viewerAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openViewer && viewerAnchorRef.current) {
      viewerAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [openViewer]);

  async function handleExportPresentation(p: ApiPresentation, formatType: "pdf" | "pptx") {
    const slides = (p.slides as Slide[] | undefined) ?? [];
    if (!slides.length) {
      toast({ variant: "destructive", title: t("gallery.noSlidesToExport") });
      return;
    }
    setExportingId(p.id);
    try {
      if (formatType === "pdf") await exportPresentationToPdf(p.title, slides);
      else await exportPresentationToPptx(p.title, slides);
    } catch {
      toast({ variant: "destructive", title: t("gallery.exportFailed") });
    } finally {
      setExportingId(null);
    }
  }

  const { data: presentations = [], isLoading: presentationsLoading } = useListPresentations(
    {},
    { query: { queryKey: getListPresentationsQueryKey({}) } }
  );
  const { data: allImages = [], isLoading: imagesLoading } = useListImages(
    {},
    { query: { queryKey: getListImagesQueryKey({}) } }
  );
  const { data: patients = [], isLoading: patientsLoading } = useListPatients(
    {},
    { query: { queryKey: getListPatientsQueryKey({}) } }
  );
  const { data: tags = [], isLoading: tagsLoading } = useListTags({
    query: { queryKey: getListTagsQueryKey(), enabled: mode === "select-tags" },
  });

  const patientMap = new Map((patients as any[]).map((p: any) => [p.id, p.name as string]));

  const pickerImages: PickerImage[] = (allImages as any[])
    .filter((img: any) => !img.isUnassigned)
    .map((img: any) => ({
      id: img.id,
      patientId: img.patientId,
      patientName: img.patientId ? patientMap.get(img.patientId) ?? t("common.unknown") : t("gallery.unassigned"),
    }));

  const wizardMatchingPatients = useMemo(() => {
    const list = patients as any[];
    if (wizardTagIds.size === 0) return list;
    return list.filter((p) => (p.tags ?? []).some((tag: any) => wizardTagIds.has(tag.id)));
  }, [patients, wizardTagIds]);

  const wizardPickerImages: PickerImage[] = pickerImages.filter(
    (img) => img.patientId != null && wizardPatientIds.has(img.patientId),
  );

  const crossPatient = presentations.filter((p) => p.patientId === null || p.patientId === undefined);

  function startNewPresentationWizard() {
    setWizardTagIds(new Set());
    setWizardPatientIds(new Set());
    setMode("select-tags");
  }

  function toggleWizardTag(id: number) {
    setWizardTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleWizardPatient(id: number) {
    setWizardPatientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function confirmWizardPatients() {
    setEditingPresentation(null);
    setIsSaved(false);
    setMode("builder");
  }

  const createPresentation = useCreatePresentation({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListPresentationsQueryKey({}) });
        setEditingPresentation(data as ApiPresentation);
        setIsSaved(true);
        toast({ title: t("presentation.savedSuccess") });
      },
      onError: () => toast({ variant: "destructive", title: t("common.error") }),
    },
  });

  const updatePresentation = useUpdatePresentation({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListPresentationsQueryKey({}) });
        setEditingPresentation(data as ApiPresentation);
        setIsSaved(true);
        toast({ title: t("presentation.savedSuccess") });
      },
      onError: () => toast({ variant: "destructive", title: t("common.error") }),
    },
  });

  const deletePresentation = useDeletePresentation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPresentationsQueryKey({}) });
        setDeleteTarget(null);
        toast({ title: t("presentation.deletedSuccess") });
      },
      onError: () => toast({ variant: "destructive", title: t("common.error") }),
    },
  });

  function handleSave(title: string, slides: Slide[]) {
    setIsSaved(false);
    if (editingPresentation) {
      updatePresentation.mutate({ id: editingPresentation.id, data: { title, slides } });
    } else {
      createPresentation.mutate({ data: { title, slides } });
    }
  }

  function openBuilder(p?: ApiPresentation) {
    setEditingPresentation(p ?? null);
    setIsSaved(!!p);
    setMode("builder");
  }

  function backToList() {
    setMode("list");
    setEditingPresentation(null);
    setIsSaved(false);
  }

  /* ─── Wizard: tag selection ─────────────────────────────── */
  if (mode === "select-tags") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={backToList}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-primary">{t("presentation.wizardTagsTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("presentation.wizardTagsDesc")}</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {tagsLoading ? (
              <div className="flex flex-wrap gap-2">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}
              </div>
            ) : tags.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("presentation.wizardNoTags")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag: any) => {
                  const active = wizardTagIds.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleWizardTag(tag.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted border-input"
                      )}
                    >
                      {active && <Check className="h-3.5 w-3.5" />}
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {wizardTagIds.size === 0
              ? t("presentation.wizardTagsNoneHint")
              : t("presentation.wizardTagsSelectedHint", { count: wizardTagIds.size })}
          </p>
          <Button onClick={() => setMode("select-patients")} className="gap-2">
            {t("presentation.wizardContinue")}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  /* ─── Wizard: patient selection ─────────────────────────── */
  if (mode === "select-patients") {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setMode("select-tags")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-primary">{t("presentation.wizardPatientsTitle")}</h1>
            <p className="text-sm text-muted-foreground">
              {wizardPatientIds.size === 0
                ? t("presentation.wizardPatientsDesc")
                : t("presentation.wizardPatientsSelectedHint", { count: wizardPatientIds.size })}
            </p>
          </div>
        </div>

        {patientsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : wizardMatchingPatients.length === 0 ? (
          <div className="border-2 border-dashed rounded-xl p-16 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="font-medium">{t("presentation.wizardNoPatients")}</p>
            <Button variant="outline" className="mt-4" onClick={() => setMode("select-tags")}>
              {t("presentation.wizardBackToTags")}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {wizardMatchingPatients.map((p: any) => {
              const selected = wizardPatientIds.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleWizardPatient(p.id)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors",
                    selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input hover:bg-muted"
                  )}
                >
                  <div className={cn(
                    "absolute top-2 right-2 h-5 w-5 rounded-full border flex items-center justify-center",
                    selected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
                  )}>
                    {selected && <Check className="h-3.5 w-3.5" />}
                  </div>
                  {p.profileImageId ? (
                    <img src={`/api/images/${p.profileImageId}/file`} className="h-14 w-14 rounded-full object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="min-w-0 w-full">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{t("presentation.wizardImageCount", { count: p.imageCount ?? 0 })}</p>
                  </div>
                  {(p.tags ?? []).length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1">
                      {(p.tags as any[]).slice(0, 3).map((tag) => (
                        <Badge key={tag.id} variant="secondary" className="text-[10px] px-1.5 py-0">{tag.name}</Badge>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={confirmWizardPatients} disabled={wizardPatientIds.size === 0} className="gap-2">
            {t("presentation.wizardOpenBuilder")}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  /* ─── Builder mode ──────────────────────────────────────── */
  if (mode === "builder") {
    return (
      <PresentationBuilder
        images={editingPresentation ? pickerImages : wizardPickerImages}
        initialSlides={(editingPresentation?.slides as Slide[] | undefined) ?? []}
        initialTitle={editingPresentation?.title ?? ""}
        isSaving={createPresentation.isPending || updatePresentation.isPending}
        isSaved={isSaved}
        onSave={handleSave}
        groupByPatient
        headerLeft={
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={backToList}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />
    );
  }

  /* ─── List mode ─────────────────────────────────────────── */
  const isLoading = presentationsLoading || imagesLoading || patientsLoading;

  function PresentationCard({ p }: { p: ApiPresentation }) {
    const slides = (p.slides as Slide[] | undefined) ?? [];
    const patientName = p.patientId ? patientMap.get(p.patientId) : undefined;
    return (
      <Card className="group overflow-hidden hover:shadow-md transition-shadow">
        {/* Thumbnail strip */}
        <div className="flex h-24 bg-muted overflow-hidden">
          {slides.slice(0, 4).map((s, i) => {
            const imgId = (s.type === "single" || s.type === "video") ? s.imageId : s.type === "compare" ? s.beforeId : s.baseId;
            return (
              <div key={i} className="flex-1 overflow-hidden">
                <img src={`/api/images/${imgId}/file`} className="w-full h-full object-cover" loading="lazy" />
              </div>
            );
          })}
          {slides.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <Images className="h-8 w-8 text-muted-foreground/40" />
            </div>
          )}
        </div>

        <CardContent className="pt-3 pb-2 px-3">
          <p className="font-semibold text-sm truncate">{p.title}</p>
          <div className="flex items-center gap-2 mt-1">
            {patientName ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 truncate max-w-[120px]">{patientName}</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t("presentation.crossPatient")}</Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {slides.length} {t("presentation.slides")}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {format(new Date(p.updatedAt), "MMM d, yyyy")}
          </p>
        </CardContent>

        <CardFooter className="px-3 pb-3 pt-0 gap-2">
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={() => openBuilder(p)}>
            <Pencil className="h-3 w-3" /> {t("common.edit")}
          </Button>
          <Button size="sm" className="flex-1 h-7 text-xs gap-1" onClick={() => setOpenViewer(p)}>
            <Play className="h-3 w-3" /> {t("presentation.present")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={exportingId === p.id}>
                {exportingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExportPresentation(p, "pdf")}>
                <FileText className="h-4 w-4 mr-2" /> {t("presentation.exportPdf")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportPresentation(p, "pptx")}>
                <PresentationIcon className="h-4 w-4 mr-2" /> {t("presentation.exportPptx")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteTarget(p)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">{t("presentation.hubTitle")}</h1>
          <p className="text-muted-foreground">{t("presentation.hubSubtitle")}</p>
        </div>
        <Button onClick={startNewPresentationWizard} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          {t("presentation.newPresentation")}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : crossPatient.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-16 text-center text-muted-foreground">
          <Images className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="font-medium">{t("presentation.noPresentations")}</p>
          <p className="text-sm mt-1">{t("presentation.noPresentationsDesc")}</p>
          <Button className="mt-6 gap-2" onClick={startNewPresentationWizard}>
            <PlusCircle className="h-4 w-4" />
            {t("presentation.newPresentation")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {crossPatient.map((p) => <PresentationCard key={p.id} p={p} />)}
        </div>
      )}

      {/* Inline viewer for list page */}
      {openViewer && (
        <div ref={viewerAnchorRef}>
          <div className="flex flex-col items-center gap-1 py-3 text-muted-foreground animate-bounce">
            <ChevronDown className="h-5 w-5" />
            <span className="text-xs font-medium">{t("presentation.scrollToView")}</span>
          </div>
          <PresentationBuilder
            key={openViewer.id}
            images={pickerImages}
            initialSlides={(openViewer.slides as Slide[] | undefined) ?? []}
            initialTitle={openViewer.title}
            groupByPatient
            headerLeft={null}
          />
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("presentation.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("presentation.deleteDesc", { title: deleteTarget?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deletePresentation.mutate({ id: deleteTarget.id })}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
