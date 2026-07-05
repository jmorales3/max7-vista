import { useMemo, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  useGetPatient, getGetPatientQueryKey,
  useListPatientImages, getListPatientImagesQueryKey,
  useListPresentations, getListPresentationsQueryKey,
  useCreatePresentation, useUpdatePresentation, useDeletePresentation,
  Presentation as ApiPresentation,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, FolderOpen, Trash2, PlusCircle } from "lucide-react";
import { format } from "date-fns";
import { PresentationBuilder, type Slide, type PickerImage } from "@/components/PresentationBuilder";

export default function PatientPresentation() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/presentation/:id");
  const patientId = parseInt(params?.id || "0", 10);

  const [activePresentationId, setActivePresentationId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  const { data: patient, isLoading: patientLoading } = useGetPatient(patientId, {
    query: { enabled: !!patientId, queryKey: getGetPatientQueryKey(patientId) },
  });
  const { data: images = [], isLoading: imagesLoading } = useListPatientImages(patientId, {
    query: { enabled: !!patientId, queryKey: getListPatientImagesQueryKey(patientId) },
  });
  const { data: savedPresentations = [], isLoading: presentationsLoading } = useListPresentations(
    { patientId },
    { query: { enabled: !!patientId, queryKey: getListPresentationsQueryKey({ patientId }) } }
  );

  const activePresentation = savedPresentations.find((p) => p.id === activePresentationId) ?? null;

  const { data: libraryAssets = [] } = useQuery<{ id: number }[]>({
    queryKey: ["library-assets"],
    queryFn: async () => {
      const res = await fetch("/api/library-assets", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load library assets");
      return res.json();
    },
  });
  const libraryAssetIds = useMemo(
    () => new Set((libraryAssets as { id: number }[]).map((a) => a.id)),
    [libraryAssets],
  );

  function handleEditSlideImage(presentationId: number, imageId: number, field: string, slideIndex: number) {
    setLocation(`/editor/${imageId}?presentationId=${presentationId}&slideIndex=${slideIndex}&field=${field}`);
  }

  const createPresentation = useCreatePresentation({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListPresentationsQueryKey({ patientId }) });
        setActivePresentationId(data.id);
        setIsSaved(true);
        toast({ title: t("presentation.savedSuccess") });
      },
      onError: () => toast({ variant: "destructive", title: t("common.error") }),
    },
  });

  const updatePresentation = useUpdatePresentation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPresentationsQueryKey({ patientId }) });
        setIsSaved(true);
        toast({ title: t("presentation.savedSuccess") });
      },
      onError: () => toast({ variant: "destructive", title: t("common.error") }),
    },
  });

  const deletePresentation = useDeletePresentation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPresentationsQueryKey({ patientId }) });
        setActivePresentationId(null);
        setIsSaved(false);
        toast({ title: t("presentation.deletedSuccess") });
      },
      onError: () => toast({ variant: "destructive", title: t("common.error") }),
    },
  });

  function handleSave(title: string, slides: Slide[]) {
    setIsSaved(false);
    if (activePresentationId) {
      updatePresentation.mutate({ id: activePresentationId, data: { title, slides } });
    } else {
      createPresentation.mutate({ data: { title, slides, patientId } });
    }
  }

  function loadPresentation(p: ApiPresentation) {
    setActivePresentationId(p.id);
    setIsSaved(true);
  }

  function newPresentation() {
    setActivePresentationId(null);
    setIsSaved(false);
  }

  if (patientLoading || imagesLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
        </div>
      </div>
    );
  }

  const pickerImages: PickerImage[] = (images as any[]).map((img) => ({ id: img.id }));

  return (
    <PresentationBuilder
      images={pickerImages}
      initialSlides={(activePresentation?.slides as Slide[] | undefined) ?? []}
      initialTitle={activePresentation?.title ?? ""}
      contextLabel={patient?.name}
      isSaving={createPresentation.isPending || updatePresentation.isPending}
      isSaved={isSaved}
      onSave={handleSave}
      onEditSlideImage={
        activePresentation
          ? (imageId, field, slideIndex) => handleEditSlideImage(activePresentation.id, imageId, field, slideIndex)
          : undefined
      }
      isCrossPatient={false}
      libraryAssetIds={libraryAssetIds}
      headerLeft={
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="icon" asChild className="h-8 w-8">
            <Link href={`/patients/${patientId}`}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>

          {/* Load saved */}
          {!presentationsLoading && savedPresentations.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-8">
                  <FolderOpen className="h-3.5 w-3.5" />
                  {t("presentation.load")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem onClick={newPresentation} className="gap-2">
                  <PlusCircle className="h-4 w-4 text-primary" />
                  {t("presentation.newPresentation")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {savedPresentations.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    className="flex items-center justify-between gap-2"
                    onClick={() => loadPresentation(p)}
                  >
                    <span className="truncate flex-1 font-medium">{p.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(p.updatedAt), "MMM d")}
                    </span>
                    <button
                      className="ml-1 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); deletePresentation.mutate({ id: p.id }); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      }
    />
  );
}
