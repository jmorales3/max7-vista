import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListPresentations, getListPresentationsQueryKey,
  useListImages, getListImagesQueryKey,
  useListPatients, getListPatientsQueryKey,
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
import { PlusCircle, Play, Pencil, Trash2, Images, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { PresentationBuilder, type Slide, type PickerImage } from "@/components/PresentationBuilder";

type Mode = "list" | "builder";

export default function Presentations() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("list");
  const [editingPresentation, setEditingPresentation] = useState<ApiPresentation | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiPresentation | null>(null);
  const [openViewer, setOpenViewer] = useState<ApiPresentation | null>(null);

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

  const patientMap = new Map((patients as any[]).map((p: any) => [p.id, p.name as string]));

  const pickerImages: PickerImage[] = (allImages as any[])
    .filter((img: any) => !img.isUnassigned)
    .map((img: any) => ({
      id: img.id,
      patientId: img.patientId,
      patientName: img.patientId ? patientMap.get(img.patientId) ?? t("common.unknown") : t("gallery.unassigned"),
    }));

  const crossPatient = presentations.filter((p) => p.patientId === null || p.patientId === undefined);
  const patientSpecific = presentations.filter((p) => p.patientId !== null && p.patientId !== undefined);

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

  /* ─── Builder mode ──────────────────────────────────────── */
  if (mode === "builder") {
    return (
      <PresentationBuilder
        images={pickerImages}
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
        <Button onClick={() => openBuilder()} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          {t("presentation.newPresentation")}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : presentations.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl p-16 text-center text-muted-foreground">
          <Images className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="font-medium">{t("presentation.noPresentations")}</p>
          <p className="text-sm mt-1">{t("presentation.noPresentationsDesc")}</p>
          <Button className="mt-6 gap-2" onClick={() => openBuilder()}>
            <PlusCircle className="h-4 w-4" />
            {t("presentation.newPresentation")}
          </Button>
        </div>
      ) : (
        <>
          {crossPatient.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                {t("presentation.crossPatientSection")}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {crossPatient.map((p) => <PresentationCard key={p.id} p={p} />)}
              </div>
            </section>
          )}
          {patientSpecific.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                {t("presentation.patientSection")}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {patientSpecific.map((p) => <PresentationCard key={p.id} p={p} />)}
              </div>
            </section>
          )}
        </>
      )}

      {/* Inline viewer for list page */}
      {openViewer && (
        <PresentationBuilder
          images={pickerImages}
          initialSlides={(openViewer.slides as Slide[] | undefined) ?? []}
          initialTitle={openViewer.title}
          groupByPatient
          headerLeft={null}
        />
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
