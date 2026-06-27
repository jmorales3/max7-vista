import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { BrainCircuit, Plus, Trash2, Copy, Lock, Eye, Pencil } from "lucide-react";

interface CephTemplate {
  id: number;
  tenantId: number | null;
  name: string;
  description: string | null;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
  landmarkCount?: number;
  measurementCount?: number;
}

const QUERY_KEY = ["ceph-templates"];

export default function Cephalometrics() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const [copyTarget, setCopyTarget] = useState<CephTemplate | null>(null);
  const [copyName, setCopyName] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<CephTemplate | null>(null);

  const { data: templates = [], isLoading } = useQuery<CephTemplate[]>({
    queryKey: QUERY_KEY,
    queryFn: () => customFetch<CephTemplate[]>("/api/ceph/templates"),
  });

  const systemTemplates = templates.filter((tmpl) => tmpl.locked);
  const clinicTemplates = templates.filter((tmpl) => !tmpl.locked);

  const copyMutation = useMutation<CephTemplate, Error, { id: number; name: string }>({
    mutationFn: ({ id, name }) =>
      customFetch<CephTemplate>(`/api/ceph/templates/${id}/copy`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (tmpl) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setCopyTarget(null);
      toast({ title: t("ceph.copySuccess") });
      navigate(`/cephalometrics/templates/${tmpl.id}/edit`);
    },
    onError: () => toast({ title: t("ceph.copyFailed"), variant: "destructive" }),
  });

  const deleteMutation = useMutation<void, Error, number>({
    mutationFn: (id) => customFetch(`/api/ceph/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setDeleteTarget(null);
      toast({ title: t("ceph.deleteSuccess") });
    },
    onError: () => toast({ title: t("ceph.deleteFailed"), variant: "destructive" }),
  });

  function handleCopy(tmpl: CephTemplate) {
    setCopyTarget(tmpl);
    setCopyName(`${tmpl.name} (copy)`);
  }

  function handleCopyConfirm() {
    if (!copyTarget || !copyName.trim()) return;
    copyMutation.mutate({ id: copyTarget.id, name: copyName.trim() });
  }

  function TemplateCard({ tmpl }: { tmpl: CephTemplate }) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight">{tmpl.name}</CardTitle>
            {tmpl.locked && (
              <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
                <Lock className="h-3 w-3" />
                {t("ceph.systemBadge")}
              </Badge>
            )}
          </div>
          {tmpl.description && (
            <CardDescription className="text-xs line-clamp-2 mt-1">
              {t(`ceph.tmpl.${tmpl.name.split(" ")[0].toLowerCase()}.desc` as any, tmpl.description)}
            </CardDescription>
          )}
          {(tmpl.landmarkCount !== undefined || tmpl.measurementCount !== undefined) && (
            <div className="flex items-center gap-3 mt-2">
              {tmpl.landmarkCount !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {t("ceph.landmarkCountLabel", { count: tmpl.landmarkCount })}
                </span>
              )}
              {tmpl.measurementCount !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {t("ceph.measurementCountLabel", { count: tmpl.measurementCount })}
                </span>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="flex-1 pb-2" />
        <CardFooter className="pt-2 flex gap-2">
          {tmpl.locked ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => navigate(`/cephalometrics/templates/${tmpl.id}/edit`)}
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                {t("ceph.viewTemplate")}
              </Button>
              {isAdmin && (
                <Button size="sm" className="flex-1" onClick={() => handleCopy(tmpl)}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  {t("ceph.copyToEdit")}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => navigate(`/cephalometrics/templates/${tmpl.id}/edit`)}
              >
                {isAdmin ? (
                  <>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    {t("ceph.editTemplate")}
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    {t("ceph.viewTemplate")}
                  </>
                )}
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                  onClick={() => setDeleteTarget(tmpl)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BrainCircuit className="h-6 w-6" />
            {t("ceph.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t("ceph.subtitle")}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate("/cephalometrics/templates/new")}>
            <Plus className="h-4 w-4 mr-2" />
            {t("ceph.newTemplate")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t("ceph.systemTemplates")}
            </h2>
            {systemTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("ceph.noSystemTemplates")}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {systemTemplates.map((tmpl) => (
                  <TemplateCard key={tmpl.id} tmpl={tmpl} />
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t("ceph.clinicTemplates")}
            </h2>
            {clinicTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 border-2 border-dashed rounded-xl">
                <BrainCircuit className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  {t("ceph.noClinicTemplates")}
                </p>
                <p className="text-xs text-muted-foreground/70">
                  {t("ceph.noClinicTemplatesDesc")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {clinicTemplates.map((tmpl) => (
                  <TemplateCard key={tmpl.id} tmpl={tmpl} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <Dialog open={!!copyTarget} onOpenChange={(o) => !o && setCopyTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("ceph.copyTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>{t("ceph.copyNameLabel")}</Label>
            <Input
              value={copyName}
              onChange={(e) => setCopyName(e.target.value)}
              placeholder={t("ceph.copyNamePlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && handleCopyConfirm()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCopyConfirm}
              disabled={!copyName.trim() || copyMutation.isPending}
            >
              {copyMutation.isPending ? t("ceph.copying") : t("ceph.copyToEdit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ceph.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("ceph.deleteDesc", { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
