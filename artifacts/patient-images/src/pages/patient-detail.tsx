import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import {
  useGetPatient,
  getGetPatientQueryKey,
  useListPatientImages,
  getListPatientImagesQueryKey,
  useDeletePatient,
  getListPatientsQueryKey,
  useListTags,
  getListTagsQueryKey,
  useListPatientTags,
  getListPatientTagsQueryKey,
  useAddPatientTag,
  useRemovePatientTag,
  customFetch,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  Calendar,
  FileText,
  Camera,
  LayoutGrid,
  Trash2,
  Clock,
  MoreVertical,
  Monitor,
  Tag,
  Plus,
  X,
  LayoutTemplate,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { ImageGrid } from "@/components/image-grid";
import { PatientDocuments } from "@/components/patient-documents";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
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
import { useLocation } from "wouter";

interface TemplateItem {
  id: number;
  title: string;
  officeName?: string | null;
}

export default function PatientDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute("/patients/:id");
  const id = parseInt(params?.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [gridColumns, setGridColumns] = useState<1 | 2 | 4 | 8>(4);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [templateDocOpen, setTemplateDocOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<TemplateItem | null>(null);
  const [docName, setDocName] = useState("");
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null);

  const { data: patient, isLoading: patientLoading } = useGetPatient(id, {
    query: { enabled: !!id, queryKey: getGetPatientQueryKey(id) }
  });

  const { data: images, isLoading: imagesLoading } = useListPatientImages(id, {
    query: { enabled: !!id, queryKey: getListPatientImagesQueryKey(id) }
  });

  const { data: allTags = [] } = useListTags({
    query: { queryKey: getListTagsQueryKey() }
  });

  const { data: patientTags = [] } = useListPatientTags(id, {
    query: { enabled: !!id, queryKey: getListPatientTagsQueryKey(id) }
  });

  const assignedTagIds = new Set(patientTags.map((t) => t.id));
  const availableTags = allTags.filter((t) => !assignedTagIds.has(t.id));

  const addTag = useAddPatientTag({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientTagsQueryKey(id) });
        setSelectedTagId("");
        toast({ title: t("tags.tagAdded") });
      },
      onError: () => {
        toast({ variant: "destructive", title: t("common.error") });
      }
    }
  });

  const removeTag = useRemovePatientTag({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientTagsQueryKey(id) });
        toast({ title: t("tags.tagRemoved") });
      },
      onError: () => {
        toast({ variant: "destructive", title: t("common.error") });
      }
    }
  });

  const deletePatient = useDeletePatient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        toast({ title: t("patients.deletePatient") });
        setLocation("/patients");
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          title: t("common.error"),
          description: e instanceof Error ? e.message : t("common.error")
        });
      }
    }
  });

  const handleAddTag = () => {
    if (!selectedTagId) return;
    addTag.mutate({ id, data: { tagId: parseInt(selectedTagId, 10) } });
  };

  const { data: templates = [], isLoading: templatesLoading } = useQuery<TemplateItem[]>({
    queryKey: ["templates"],
    queryFn: () => customFetch<TemplateItem[]>("/api/templates"),
    enabled: templateDocOpen,
  });

  interface TemplateDocItem { id: number; title: string; createdAt: string; updatedAt: string; }
  const { data: patientDocs = [] } = useQuery<TemplateDocItem[]>({
    queryKey: ["template-documents", "patient", id],
    queryFn: () => customFetch<TemplateDocItem[]>(`/api/template-documents?patientId=${id}`),
    enabled: !!id,
  });

  const createDocMutation = useMutation({
    mutationFn: ({ templateId, title }: { templateId: number; title: string }) =>
      customFetch<{ id: number }>("/api/template-documents", {
        method: "POST",
        body: JSON.stringify({ templateId, patientId: id, title }),
      }),
    onSuccess: (doc) => {
      setTemplateDocOpen(false);
      setPendingTemplate(null);
      setDocName("");
      setLocation(`/template-documents/${doc.id}`);
    },
    onError: () => {
      toast({ variant: "destructive", title: t("patients.createTemplateDocError") });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) =>
      customFetch<void>(`/api/template-documents/${docId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-documents", "patient", id] });
      setDeleteDocId(null);
      toast({ title: t("patients.deleteDocSuccess") });
    },
    onError: () => {
      toast({ variant: "destructive", title: t("patients.deleteDocError") });
      setDeleteDocId(null);
    },
  });

  if (patientLoading) {
    return <div className="p-8"><Skeleton className="h-12 w-64 mb-8" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!patient) {
    return <div>{t("patients.notFound")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b pb-6">
        <Button variant="outline" size="icon" asChild className="shrink-0 h-8 w-8">
          <Link href="/patients">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-primary truncate">{patient.name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5 font-mono bg-muted/50 px-2 py-0.5 rounded">
              <FileText className="h-3.5 w-3.5" />
              {patient.patientCode}
            </div>
            {patient.dateOfBirth && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {t("patients.dob")}: {format(new Date(patient.dateOfBirth), "MMM d, yyyy")}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {t("patients.created")} {format(new Date(patient.createdAt), "MMM d, yyyy")}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" asChild>
            <Link href={`/presentation/${patient.id}`}>
              <Monitor className="mr-2 h-4 w-4" />
              {t("presentation.createPresentation")}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/capture?patientId=${patient.id}`}>
              <Camera className="mr-2 h-4 w-4" />
              {t("patients.captureImage")}
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/patients/${patient.id}/edit`}>{t("patients.editPatient")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTemplateDocOpen(true)}>
                <LayoutTemplate className="mr-2 h-4 w-4" />
                {t("patients.createTemplateDoc")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("patients.deletePatient")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {patient.notes && (
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="p-4 text-sm">
            <div className="font-semibold text-primary mb-1">{t("patients.clinicalNotes")}</div>
            <p className="text-muted-foreground">{patient.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2 py-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
          <Tag className="h-3.5 w-3.5" />
          {t("tags.patientTags")}:
        </span>

        {patientTags.length > 0 ? (
          patientTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="gap-1 pr-1 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15"
            >
              {tag.name}
              <button
                onClick={() => removeTag.mutate({ id, tagId: tag.id })}
                className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
                title={t("tags.removeTag")}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">{t("tags.noPatientTags")}</span>
        )}

        {availableTags.length > 0 && (
          <div className="flex items-center gap-1.5 ml-1">
            <Select value={selectedTagId} onValueChange={setSelectedTagId}>
              <SelectTrigger className="h-7 text-xs w-36 border-dashed">
                <SelectValue placeholder={t("tags.selectTag")} />
              </SelectTrigger>
              <SelectContent>
                {availableTags.map((tag) => (
                  <SelectItem key={tag.id} value={String(tag.id)}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2 border-dashed"
              onClick={handleAddTag}
              disabled={!selectedTagId || addTag.isPending}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            {t("patients.imageGallery")}
            <span className="text-sm font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
              {images?.length || 0} {t("patients.images")}
            </span>
          </h2>

          <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-md border">
            {[1, 2, 4, 8].map((cols) => (
              <Button
                key={cols}
                variant={gridColumns === cols ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-8 px-0"
                onClick={() => setGridColumns(cols as 1 | 2 | 4 | 8)}
                title={`${cols} column${cols > 1 ? "s" : ""}`}
              >
                <LayoutGrid className="h-4 w-4" style={{
                  opacity: gridColumns === cols ? 1 : 0.5,
                  transform: `scale(${cols === 1 ? 1.2 : cols === 2 ? 1 : cols === 4 ? 0.8 : 0.6})`
                }} />
              </Button>
            ))}
          </div>
        </div>

        {imagesLoading ? (
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        ) : images && images.length > 0 ? (
          <ImageGrid images={images} columns={gridColumns} />
        ) : (
          <div className="flex flex-col items-center justify-center p-16 text-center border rounded-xl bg-card border-dashed">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Camera className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium text-foreground">{t("patients.noImagesYet")}</h3>
            <p className="text-muted-foreground max-w-sm mt-2 mb-6">
              {t("patients.noImagesDesc")}
            </p>
            <Button asChild>
              <Link href={`/capture?patientId=${patient.id}`}>
                <Camera className="mr-2 h-4 w-4" />
                {t("patients.captureFirst")}
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Template photo documents for this patient */}
      {patientDocs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            {t("patients.templateDocuments")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {patientDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-accent hover:border-primary/40 transition-colors group"
              >
                <LayoutTemplate className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                <a
                  href={`/template-documents/${doc.id}`}
                  className="flex-1 min-w-0 cursor-pointer"
                >
                  <div className="font-medium truncate text-sm">{doc.title}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(doc.updatedAt), "MMM d, yyyy")}</div>
                </a>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    asChild
                  >
                    <a href={`/template-documents/${doc.id}`}>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => { e.preventDefault(); setDeleteDocId(doc.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <PatientDocuments patientId={patient.id} />

      <Dialog open={templateDocOpen} onOpenChange={(o) => { if (!o) { setTemplateDocOpen(false); setPendingTemplate(null); setDocName(""); } }}>
        <DialogContent className="max-w-md">
          {!pendingTemplate ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <LayoutTemplate className="h-5 w-5 text-primary" />
                  {t("patients.selectTemplate")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2 mt-2">
                {templatesLoading ? (
                  <>
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </>
                ) : templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {t("patients.noTemplatesAvailable")}
                  </p>
                ) : (
                  templates.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      className="w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm hover:bg-accent hover:border-primary/40 transition-colors"
                      onClick={() => { setPendingTemplate(tmpl); setDocName(tmpl.title); }}
                    >
                      <LayoutTemplate className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{tmpl.title}</div>
                        {tmpl.officeName && (
                          <div className="text-xs text-muted-foreground truncate">{tmpl.officeName}</div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t("patients.nameDocument")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  {t("patients.nameDocumentDesc", { template: pendingTemplate.title })}
                </p>
                <Input
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && docName.trim()) createDocMutation.mutate({ templateId: pendingTemplate.id, title: docName.trim() }); }}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setPendingTemplate(null); setDocName(""); }}>
                  {t("common.back")}
                </Button>
                <Button
                  onClick={() => createDocMutation.mutate({ templateId: pendingTemplate.id, title: docName.trim() || pendingTemplate.title })}
                  disabled={createDocMutation.isPending}
                >
                  {createDocMutation.isPending ? t("templates.creating") : t("templates.createDocument")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("patients.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("patients.deleteConfirmDesc", { name: patient.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletePatient.mutate({ id: patient.id })}
            >
              {t("patients.deletePatient")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDocId !== null} onOpenChange={(open) => { if (!open) setDeleteDocId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("patients.deleteDocTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("patients.deleteDocDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteDocId !== null) deleteDocMutation.mutate(deleteDocId); }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
