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
import { ArrowLeft, BrainCircuit } from "lucide-react";

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
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/cephalometrics")}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("ceph.backToTemplates")}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <BrainCircuit className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("ceph.createTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("ceph.subtitle")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("ceph.templateName")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-name">{t("ceph.templateName")}</Label>
              <Input
                id="tmpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("ceph.templateNamePlaceholder")}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-desc">
                {t("ceph.description")}{" "}
                <span className="text-muted-foreground text-xs">({t("ceph.optional")})</span>
              </Label>
              <Textarea
                id="tmpl-desc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={t("ceph.descriptionPlaceholder")}
                rows={3}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                type="submit"
                disabled={!name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? t("ceph.creating") : t("ceph.createAndEdit")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/cephalometrics")}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
