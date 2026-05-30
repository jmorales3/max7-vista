import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch, useListPatients, getListPatientsQueryKey } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { LayoutTemplate, Plus, Pencil, Trash2, FileText, SquareStack } from "lucide-react";
import { format } from "date-fns";

interface TemplateFrame { id: string; x: number; y: number; width: number; height: number; label?: string; }
interface Template { id: number; title: string; description?: string | null; officeName?: string | null; officeInfo?: string | null; pageWidth: number; pageHeight: number; frames: TemplateFrame[]; createdAt: string; updatedAt: string; }

const MM_PER_IN = 25.4;
const PAGE_PRESETS = [
  { id: "letter", label: "Letter (8.5 × 11 in)", width: 215.9, height: 279.4 },
  { id: "a4", label: "A4 (210 × 297 mm)", width: 210, height: 297 },
  { id: "legal", label: "Legal (8.5 × 14 in)", width: 215.9, height: 355.6 },
  { id: "custom", label: "Custom", width: 0, height: 0 },
];

function pageSizeLabel(w: number, h: number): string {
  for (const p of PAGE_PRESETS) {
    if (p.id !== "custom" && Math.abs(p.width - w) < 0.5 && Math.abs(p.height - h) < 0.5) return p.label;
  }
  return `${(w / MM_PER_IN).toFixed(2)} × ${(h / MM_PER_IN).toFixed(2)} in`;
}

export default function Templates() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("Untitled Template");
  const [createOfficeName, setCreateOfficeName] = useState("");
  const [createOfficeInfo, setCreateOfficeInfo] = useState("");
  const [createPreset, setCreatePreset] = useState("letter");
  const [createCustomW, setCreateCustomW] = useState("8.5");
  const [createCustomH, setCreateCustomH] = useState("11");

  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const [useOpen, setUseOpen] = useState(false);
  const [useTemplate, setUseTemplate] = useState<Template | null>(null);
  const [usePatientId, setUsePatientId] = useState<string>("");
  const [useDocTitle, setUseDocTitle] = useState("");

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: () => customFetch<Template[]>("/api/templates"),
  });

  const { data: patients = [] } = useListPatients({}, { query: { queryKey: getListPatientsQueryKey({}) } });

  const createMutation = useMutation<Template, Error, object>({
    mutationFn: (body: object) => customFetch<Template>("/api/templates", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (tmpl) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setCreateOpen(false);
      navigate(`/templates/${tmpl.id}`);
    },
    onError: () => toast({ title: t("templates.createFailed"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setDeleteTarget(null);
      toast({ title: t("templates.deleted") });
    },
    onError: () => toast({ title: t("templates.deleteFailed"), variant: "destructive" }),
  });

  const createDocMutation = useMutation<{ id: number }, Error, object>({
    mutationFn: (body: object) => customFetch<{ id: number }>("/api/template-documents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (doc) => {
      setUseOpen(false);
      navigate(`/template-documents/${doc.id}`);
    },
    onError: () => toast({ title: t("templates.docCreateFailed"), variant: "destructive" }),
  });

  function handleCreate() {
    const preset = PAGE_PRESETS.find((p) => p.id === createPreset);
    const width = createPreset === "custom" ? parseFloat(createCustomW) * MM_PER_IN : preset!.width;
    const height = createPreset === "custom" ? parseFloat(createCustomH) * MM_PER_IN : preset!.height;
    createMutation.mutate({ title: createTitle.trim() || "Untitled Template", officeName: createOfficeName || undefined, officeInfo: createOfficeInfo || undefined, pageWidth: width, pageHeight: height, frames: [] });
  }

  function handleUse(tmpl: Template) {
    setUseTemplate(tmpl);
    setUseDocTitle(`${tmpl.title} — Document`);
    setUsePatientId("");
    setUseOpen(true);
  }

  function handleCreateDoc() {
    if (!useTemplate) return;
    const frames = useTemplate.frames.map((f) => ({ frameId: f.id, panX: 50, panY: 50 }));
    createDocMutation.mutate({ templateId: useTemplate.id, patientId: usePatientId ? parseInt(usePatientId) : undefined, title: useDocTitle || "Document", frames });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6" />
            {t("templates.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("templates.subtitle")}
          </p>
        </div>
        <Button onClick={() => { setCreateTitle("Untitled Template"); setCreateOfficeName(""); setCreateOfficeInfo(""); setCreatePreset("letter"); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          {t("templates.newTemplate")}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 border-2 border-dashed rounded-xl">
          <LayoutTemplate className="h-12 w-12 text-muted-foreground/40" />
          <p className="font-medium text-muted-foreground">{t("templates.noTemplates")}</p>
          <p className="text-sm text-muted-foreground/70">{t("templates.noTemplatesDesc")}</p>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> {t("templates.newTemplate")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tmpl) => (
            <Card key={tmpl.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base truncate">{tmpl.title}</CardTitle>
                <CardDescription className="text-xs space-y-0.5">
                  <div>{pageSizeLabel(tmpl.pageWidth, tmpl.pageHeight)}</div>
                  {tmpl.officeName && <div className="truncate">{tmpl.officeName}</div>}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">
                    <SquareStack className="h-3 w-3 mr-1" />
                    {t("templates.frameCount", { count: tmpl.frames.length })}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t("templates.updatedDate", { date: format(new Date(tmpl.updatedAt), "MMM d, yyyy") })}
                </p>
              </CardContent>
              <CardFooter className="pt-2 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/templates/${tmpl.id}`)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  {t("templates.editLayout")}
                </Button>
                <Button size="sm" className="flex-1" onClick={() => handleUse(tmpl)}>
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  {t("templates.createDocument")}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2" onClick={() => setDeleteTarget(tmpl)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("templates.createTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("templates.templateName")}</Label>
              <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder={t("templates.namePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("templates.pageSize")}</Label>
              <Select value={createPreset} onValueChange={setCreatePreset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {createPreset === "custom" && (
                <div className="flex gap-2 mt-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">{t("templates.widthIn")}</Label>
                    <Input value={createCustomW} onChange={(e) => setCreateCustomW(e.target.value)} placeholder="8.5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">{t("templates.heightIn")}</Label>
                    <Input value={createCustomH} onChange={(e) => setCreateCustomH(e.target.value)} placeholder="11" />
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("templates.officeName")} <span className="text-muted-foreground text-xs">{t("templates.optional")}</span></Label>
              <Input value={createOfficeName} onChange={(e) => setCreateOfficeName(e.target.value)} placeholder={t("templates.officeNamePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("templates.officeInfo")} <span className="text-muted-foreground text-xs">{t("templates.optional")}</span></Label>
              <Textarea value={createOfficeInfo} onChange={(e) => setCreateOfficeInfo(e.target.value)} placeholder={t("templates.officeInfoPlaceholder")} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreate} disabled={!createTitle.trim() || createMutation.isPending}>
              {createMutation.isPending ? t("templates.creating") : t("templates.createAndDesign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={useOpen} onOpenChange={setUseOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("templates.useTitle", { title: useTemplate?.title })}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("templates.patient")} <span className="text-muted-foreground text-xs">{t("templates.optional")}</span></Label>
              <Select value={usePatientId} onValueChange={setUsePatientId}>
                <SelectTrigger><SelectValue placeholder={t("templates.selectPatient")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("templates.noPatient")}</SelectItem>
                  {(patients as any[]).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("templates.documentTitle")}</Label>
              <Input value={useDocTitle} onChange={(e) => setUseDocTitle(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUseOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreateDoc} disabled={createDocMutation.isPending}>
              {createDocMutation.isPending ? t("templates.creating") : t("templates.createDocument")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("templates.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("templates.deleteDesc", { title: deleteTarget?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
