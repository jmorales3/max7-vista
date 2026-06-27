import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BrainCircuit, Save } from "lucide-react";

interface CephTemplate {
  id: number;
  name: string;
  description: string | null;
  locked: boolean;
}

export default function CephalometricsNew() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const createMutation = useMutation<CephTemplate, Error, { name: string; description?: string }>({
    mutationFn: (body) =>
      customFetch<CephTemplate>("/api/ceph/templates", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (tmpl) => {
      navigate(`/cephalometrics/templates/${tmpl.id}/edit`);
    },
    onError: () => toast({ title: t("ceph.createFailed"), variant: "destructive" }),
  });

  if (!isAdmin) {
    navigate("/cephalometrics");
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({ name: name.trim(), description: desc.trim() || undefined });
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 mt-0.5"
            onClick={() => navigate("/cephalometrics")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t("ceph.backToTemplates")}
          </Button>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-muted-foreground shrink-0" />
            <h1 className="text-xl font-bold">{t("ceph.createTitle")}</h1>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!name.trim() || createMutation.isPending}
          onClick={handleSubmit}
          className="shrink-0"
        >
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {createMutation.isPending ? t("ceph.creating") : t("ceph.createAndEdit")}
        </Button>
      </div>

      {/* Template metadata */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1 space-y-1.5">
                <Label htmlFor="tmpl-name">{t("ceph.templateName")}</Label>
                <Input
                  id="tmpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("ceph.templateNamePlaceholder")}
                  autoFocus
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="tmpl-desc">
                  {t("ceph.description")}{" "}
                  <span className="text-muted-foreground text-xs">({t("ceph.optional")})</span>
                </Label>
                <Textarea
                  id="tmpl-desc"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder={t("ceph.descriptionPlaceholder")}
                  rows={2}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("ceph.newTemplateHint")}
            </p>
          </CardContent>
        </Card>
      </form>

      {/* Two-panel preview — disabled until template is created */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="opacity-50 pointer-events-none select-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("ceph.landmarksPanel")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("ceph.saveFirstToAddLandmarks")}
            </p>
          </CardContent>
        </Card>
        <Card className="opacity-50 pointer-events-none select-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("ceph.measurementsPanel")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-6">
              {t("ceph.saveFirstToAddMeasurements")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
