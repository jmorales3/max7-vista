import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/apiUrl";
import { PatientAccessHistory } from "@/components/patient-access-history";
import {
  useGetPatient,
  getGetPatientQueryKey,
  useListPatientImages,
  getListPatientImagesQueryKey,
  useDeletePatient,
  getListPatientsQueryKey,
  useUpdatePatient,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Download,
  Brain,
  ChevronRight,
  Scale,
  ShieldAlert,
  FileDown,
} from "lucide-react";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
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

interface CephTracingItem {
  id: number;
  patientId: number;
  imageId: number | null;
  templateId: number | null;
  templateName: string | null;
  pxPerMm: string | null;
  name: string | null;
  createdAt: string;
}

export default function PatientDetail() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
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

  const [exportOpen, setExportOpen] = useState(false);
  const [selectedExportIds, setSelectedExportIds] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [cephNewOpen, setCephNewOpen] = useState(false);
  const [deleteCephId, setDeleteCephId] = useState<number | null>(null);

  const [legalHoldDialogOpen, setLegalHoldDialogOpen] = useState(false);
  const [legalHoldReason, setLegalHoldReason] = useState("");
  const [legalHoldSaving, setLegalHoldSaving] = useState(false);

  const [disclosureReportOpen, setDisclosureReportOpen] = useState(false);
  const [disclosureFrom, setDisclosureFrom] = useState("");
  const [disclosureTo, setDisclosureTo] = useState("");
  const [disclosureGenerating, setDisclosureGenerating] = useState(false);

  const setLegalHold = async (legalHold: boolean, reason?: string) => {
    setLegalHoldSaving(true);
    try {
      const res = await fetch(getApiUrl(`/api/admin/patients/${id}/legal-hold`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ legalHold, reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(id) });
      setLegalHoldDialogOpen(false);
      setLegalHoldReason("");
      toast({ title: legalHold ? "Legal hold placed" : "Legal hold released" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to update legal hold",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLegalHoldSaving(false);
    }
  };

  const handleGenerateDisclosureReport = async (format: "csv" | "json") => {
    setDisclosureGenerating(true);
    try {
      const qs = new URLSearchParams();
      qs.set("format", format);
      if (disclosureFrom) qs.set("from", disclosureFrom);
      if (disclosureTo) qs.set("to", disclosureTo);
      const res = await fetch(getApiUrl(`/api/patients/${id}/disclosure-report?${qs.toString()}`), {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `disclosure-report-${patient?.patientCode ?? id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setDisclosureReportOpen(false);
      toast({ title: "Disclosure report generated" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to generate disclosure report",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDisclosureGenerating(false);
    }
  };

  const openExportDialog = () => {
    setSelectedExportIds(new Set((images ?? []).map((img) => img.id)));
    setExportOpen(true);
  };

  const toggleExportId = (imgId: number) => {
    setSelectedExportIds((prev) => {
      const next = new Set(prev);
      if (next.has(imgId)) next.delete(imgId);
      else next.add(imgId);
      return next;
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(getApiUrl(`/api/patients/${id}/export-images`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: Array.from(selectedExportIds) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `patient-${patient?.patientCode ?? id}-images.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
      toast({ title: t("patients.exportSuccess") });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("patients.exportError"),
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setExporting(false);
    }
  };

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

  const setProfileMutation = useUpdatePatient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        toast({ title: t("patients.profileSet") });
      },
      onError: () => {
        toast({ variant: "destructive", title: t("common.error") });
      }
    }
  });

  const handleSetProfile = (imageId: number) => {
    setProfileMutation.mutate({ id, data: { profileImageId: imageId } });
  };

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

  const { data: cephTracings = [] } = useQuery<CephTracingItem[]>({
    queryKey: ["ceph-tracings-patient", id],
    queryFn: () => customFetch<CephTracingItem[]>(`/api/ceph/tracings?patientId=${id}`),
    enabled: !!id,
  });

  const deleteCephMutation = useMutation({
    mutationFn: (tracingId: number) =>
      customFetch<void>(`/api/ceph/tracings/${tracingId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ceph-tracings-patient", id] });
      setDeleteCephId(null);
      toast({ title: t("ceph.tracingDeleted") });
    },
    onError: () => {
      toast({ variant: "destructive", title: t("ceph.tracingDeleteFailed") });
      setDeleteCephId(null);
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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight text-primary truncate">{patient.name}</h1>
            {patient.legalHold && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5" />
                Legal Hold
              </Badge>
            )}
          </div>
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
              {isAdmin && (images?.length ?? 0) > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={openExportDialog}>
                    <Download className="mr-2 h-4 w-4" />
                    {t("patients.exportImages")}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDisclosureReportOpen(true)}>
                <FileDown className="mr-2 h-4 w-4" />
                Generate Disclosure Report
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem
                  onClick={() => {
                    if (patient.legalHold) {
                      setLegalHold(false);
                    } else {
                      setLegalHoldReason("");
                      setLegalHoldDialogOpen(true);
                    }
                  }}
                >
                  <Scale className="mr-2 h-4 w-4" />
                  {patient.legalHold ? "Release Legal Hold" : "Place Legal Hold"}
                </DropdownMenuItem>
              )}
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
          <ImageGrid
            images={images}
            columns={gridColumns}
            profileImageId={patient.profileImageId}
            onSetProfile={handleSetProfile}
            reorderablePatientId={patient.id}
          />
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
                  <div className="font-medium text-sm break-words line-clamp-2">{doc.title}</div>
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

      {/* Ceph Tracings section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            {t("ceph.tracings")}
            {cephTracings.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
                {cephTracings.length}
              </span>
            )}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCephNewOpen(true)}
            disabled={(images ?? []).length === 0}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            {t("ceph.newTracing")}
          </Button>
        </div>

        {cephTracings.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Brain className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium text-muted-foreground">{t("ceph.noTracings")}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t("ceph.noTracingsDesc")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cephTracings.map((tr) => (
              <div
                key={tr.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-accent hover:border-primary/40 transition-colors group"
              >
                <Brain className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {tr.templateName ?? t("ceph.title")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(tr.createdAt), "MMM d, yyyy · HH:mm")}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    asChild
                  >
                    <Link href={`/cephalometrics/tracings/${tr.id}`}>
                      {t("ceph.viewTracing")}
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteCephId(tr.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PatientAccessHistory patientId={patient.id} />

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
                  onFocus={(e) => e.target.select()}
                  autoFocus
                  placeholder="e.g. Laser Treatment – Jan 2026"
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

      {/* Export Images Dialog — admin/superadmin only */}
      <Dialog open={exportOpen} onOpenChange={(o) => { if (!o) setExportOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              {t("patients.exportImagesTitle")}
            </DialogTitle>
          </DialogHeader>

          {(images ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("patients.exportNoImages")}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t("patients.exportImagesDesc")}
              </p>

              <div className="flex items-center justify-between py-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("patients.exportSelected", { count: selectedExportIds.size })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs text-primary underline-offset-2 hover:underline"
                    onClick={() => setSelectedExportIds(new Set((images ?? []).map((img) => img.id)))}
                  >
                    {t("patients.exportSelectAll")}
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    className="text-xs text-primary underline-offset-2 hover:underline"
                    onClick={() => setSelectedExportIds(new Set())}
                  >
                    {t("patients.exportDeselectAll")}
                  </button>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2 bg-muted/30">
                {(images ?? []).map((img) => (
                  <label
                    key={img.id}
                    className="flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer hover:bg-accent transition-colors"
                  >
                    <Checkbox
                      checked={selectedExportIds.has(img.id)}
                      onCheckedChange={() => toggleExportId(img.id)}
                    />
                    <span className="text-sm truncate flex-1">{img.fileName}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(img.capturedAt), "MMM d, yyyy")}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleExport}
              disabled={exporting || selectedExportIds.size === 0}
            >
              {exporting ? (
                t("patients.exportPreparing")
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  {t("patients.exportDownload")}
                </>
              )}
            </Button>
          </DialogFooter>
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

      {/* New Tracing — image picker */}
      <Dialog open={cephNewOpen} onOpenChange={(o) => { if (!o) setCephNewOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              {t("ceph.selectImageForTracing")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("ceph.selectImageForTracingDesc")}</p>
          {(images ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("ceph.noImagesForTracing")}</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto border rounded-md p-2 bg-muted/30">
              {(images ?? []).map((img) => (
                <button
                  key={img.id}
                  className="w-full flex items-center gap-3 px-2 py-1.5 rounded text-sm text-left hover:bg-accent transition-colors"
                  onClick={() => { setCephNewOpen(false); setLocation(`/cephalometrics/trace/${img.id}`); }}
                >
                  <div className="h-8 w-8 rounded overflow-hidden shrink-0 bg-muted">
                    <img
                      src={`/api/images/${img.id}/file`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="flex-1 truncate">{img.fileName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(img.capturedAt), "MMM d, yyyy")}
                  </span>
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCephNewOpen(false)}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Ceph Tracing */}
      <AlertDialog open={deleteCephId !== null} onOpenChange={(open) => { if (!open) setDeleteCephId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ceph.trace.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("ceph.trace.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteCephId !== null) deleteCephMutation.mutate(deleteCephId); }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={legalHoldDialogOpen} onOpenChange={setLegalHoldDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Place Legal Hold</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Placing a legal hold prevents this patient's record from being purged by the data retention policy, even after the retention period expires. Provide a reason for the audit record.
          </p>
          <div className="space-y-2">
            <Label htmlFor="legalHoldReason">Reason</Label>
            <Textarea
              id="legalHoldReason"
              value={legalHoldReason}
              onChange={(e) => setLegalHoldReason(e.target.value)}
              placeholder="e.g. Pending litigation, subpoena, insurance dispute"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLegalHoldDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => setLegalHold(true, legalHoldReason.trim())}
              disabled={!legalHoldReason.trim() || legalHoldSaving}
            >
              Place Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disclosureReportOpen} onOpenChange={setDisclosureReportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Disclosure Report</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Produces an accounting of disclosures for this patient's record, listing who accessed or exported their data and when. Leave dates blank to include the full history.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="disclosureFrom">From</Label>
              <Input id="disclosureFrom" type="date" value={disclosureFrom} onChange={(e) => setDisclosureFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="disclosureTo">To</Label>
              <Input id="disclosureTo" type="date" value={disclosureTo} onChange={(e) => setDisclosureTo(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDisclosureReportOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="outline" onClick={() => handleGenerateDisclosureReport("json")} disabled={disclosureGenerating}>
              <FileDown className="mr-2 h-4 w-4" />
              JSON
            </Button>
            <Button onClick={() => handleGenerateDisclosureReport("csv")} disabled={disclosureGenerating}>
              <FileDown className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
