import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  GripVertical,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Lock,
  Copy,
  Save,
} from "lucide-react";

interface CephLandmark {
  id: number;
  templateId: number;
  label: string;
  name: string;
  description: string | null;
  displayOrder: number;
}

interface CephMeasurement {
  id: number;
  templateId: number;
  name: string;
  type: "line" | "angle" | "perpendicular" | "line_angle";
  p1Label: string;
  p2Label: string;
  p3Label: string | null;
  p4Label: string | null;
  angleQuadrant: string | null;
  unit: string;
  displayOrder: number;
}

interface CephTemplateDetail {
  id: number;
  tenantId: number | null;
  name: string;
  description: string | null;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
  landmarks: CephLandmark[];
  measurements: CephMeasurement[];
}

type MeasurementType = "line" | "angle" | "perpendicular" | "line_angle";

const MEASUREMENT_TYPES: MeasurementType[] = ["line", "angle", "perpendicular", "line_angle"];

const QUADRANTS = [
  { value: "none", labelKey: "ceph.quadrantNone" },
  { value: "upper-right", labelKey: "ceph.quadrantUpperRight" },
  { value: "upper-left", labelKey: "ceph.quadrantUpperLeft" },
  { value: "lower-right", labelKey: "ceph.quadrantLowerRight" },
  { value: "lower-left", labelKey: "ceph.quadrantLowerLeft" },
];

function pointsForType(type: MeasurementType): number {
  switch (type) {
    case "line": return 2;
    case "angle": return 3;
    case "perpendicular": return 3;
    case "line_angle": return 4;
  }
}

function needsQuadrant(type: MeasurementType): boolean {
  return type === "line_angle";
}

function unitForType(type: MeasurementType): string {
  return type === "line" || type === "perpendicular" ? "mm" : "°";
}

function pointLabel(type: MeasurementType, idx: number, t: (k: string) => string): string {
  if (type === "angle") {
    const labels = [t("ceph.p1Vertex"), t("ceph.p2Arm1"), t("ceph.p3Arm2")];
    return labels[idx] ?? `P${idx + 1}`;
  }
  if (type === "line_angle") {
    const labels = [t("ceph.p1LineA1"), t("ceph.p2LineA2"), t("ceph.p3LineB1"), t("ceph.p4LineB2")];
    return labels[idx] ?? `P${idx + 1}`;
  }
  if (type === "perpendicular") {
    const labels = [t("ceph.p1Point"), t("ceph.p2LineStart"), t("ceph.p3LineEnd")];
    return labels[idx] ?? `P${idx + 1}`;
  }
  return idx === 0 ? t("ceph.p1Label") : t("ceph.p2Label");
}

export default function CephalometricsEditor() {
  const { id } = useParams<{ id: string }>();
  const templateId = parseInt(id, 10);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const [nameVal, setNameVal] = useState("");
  const [descVal, setDescVal] = useState("");

  const [landmarks, setLandmarks] = useState<CephLandmark[]>([]);
  const [measurements, setMeasurements] = useState<CephMeasurement[]>([]);

  const [lmEditId, setLmEditId] = useState<number | null>(null);
  const [lmEditLabel, setLmEditLabel] = useState("");
  const [lmEditName, setLmEditName] = useState("");
  const [lmEditDesc, setLmEditDesc] = useState("");

  const [lmAddOpen, setLmAddOpen] = useState(false);
  const [lmAddLabel, setLmAddLabel] = useState("");
  const [lmAddName, setLmAddName] = useState("");
  const [lmAddDesc, setLmAddDesc] = useState("");

  const [mEditId, setMEditId] = useState<number | null>(null);
  const [mEditName, setMEditName] = useState("");
  const [mEditType, setMEditType] = useState<MeasurementType>("line");
  const [mEditPoints, setMEditPoints] = useState<string[]>(["", ""]);
  const [mEditQuadrant, setMEditQuadrant] = useState("none");

  const [mEditUnit, setMEditUnit] = useState("mm");

  const [mAddOpen, setMAddOpen] = useState(false);
  const [mAddName, setMAddName] = useState("");
  const [mAddType, setMAddType] = useState<MeasurementType>("line");
  const [mAddPoints, setMAddPoints] = useState<string[]>(["", ""]);
  const [mAddQuadrant, setMAddQuadrant] = useState("none");
  const [mAddUnit, setMAddUnit] = useState("mm");

  const [deleteTarget, setDeleteTarget] = useState<{ kind: "lm" | "m"; id: number } | null>(null);

  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyDialogName, setCopyDialogName] = useState("");

  const dragLmRef = useRef<number | null>(null);
  const dragMRef = useRef<number | null>(null);
  const [lmDragOver, setLmDragOver] = useState<number | null>(null);
  const [mDragOver, setMDragOver] = useState<number | null>(null);

  const QUERY_KEY = ["ceph-template", templateId];

  const { data: template, isLoading } = useQuery<CephTemplateDetail>({
    queryKey: QUERY_KEY,
    queryFn: () => customFetch<CephTemplateDetail>(`/api/ceph/templates/${templateId}`),
    enabled: !isNaN(templateId),
  });

  useEffect(() => {
    if (template) {
      setLandmarks([...template.landmarks]);
      setMeasurements([...template.measurements]);
      setNameVal(template.name);
      setDescVal(template.description ?? "");
    }
  }, [template?.id]);

  const copyMutation = useMutation<{ id: number }, Error, { name: string }>({
    mutationFn: ({ name }) =>
      customFetch<{ id: number }>(`/api/ceph/templates/${templateId}/copy`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (tmpl) => {
      setCopyDialogOpen(false);
      toast({ title: t("ceph.copySuccess") });
      navigate(`/cephalometrics/templates/${tmpl.id}/edit`);
    },
    onError: () => toast({ title: t("ceph.copyFailed"), variant: "destructive" }),
  });

  const saveMeta = useMutation({
    mutationFn: (body: { name?: string; description?: string }) =>
      customFetch(`/api/ceph/templates/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: t("ceph.templateSaved") });
    },
    onError: () => toast({ title: t("ceph.templateSaveFailed"), variant: "destructive" }),
  });

  const addLmMutation = useMutation({
    mutationFn: (body: object) =>
      customFetch<CephLandmark>(`/api/ceph/templates/${templateId}/landmarks`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (lm) => {
      setLandmarks((prev) => [...prev, lm]);
      setLmAddOpen(false);
      setLmAddLabel("");
      setLmAddName("");
      setLmAddDesc("");
    },
    onError: () => toast({ title: t("ceph.landmarkSaveFailed"), variant: "destructive" }),
  });

  const updateLmMutation = useMutation({
    mutationFn: ({ lmId, body }: { lmId: number; body: object }) =>
      customFetch<CephLandmark>(
        `/api/ceph/templates/${templateId}/landmarks/${lmId}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),
    onSuccess: (lm) => {
      setLandmarks((prev) => prev.map((l) => (l.id === lm.id ? lm : l)));
      setLmEditId(null);
    },
    onError: () => toast({ title: t("ceph.landmarkSaveFailed"), variant: "destructive" }),
  });

  const deleteLmMutation = useMutation({
    mutationFn: (lmId: number) =>
      customFetch(`/api/ceph/templates/${templateId}/landmarks/${lmId}`, { method: "DELETE" }),
    onSuccess: (_, lmId) => {
      setLandmarks((prev) => prev.filter((l) => l.id !== lmId));
      setDeleteTarget(null);
      toast({ title: t("ceph.landmarkDeleted") });
    },
    onError: () => toast({ title: t("ceph.landmarkDeleteFailed"), variant: "destructive" }),
  });

  const reorderLmMutation = useMutation({
    mutationFn: (order: number[]) =>
      customFetch(`/api/ceph/templates/${templateId}/landmarks/reorder`, {
        method: "PUT",
        body: JSON.stringify({ order }),
      }),
    onError: () => toast({ title: t("ceph.reorderFailed"), variant: "destructive" }),
  });

  const addMMutation = useMutation({
    mutationFn: (body: object) =>
      customFetch<CephMeasurement>(`/api/ceph/templates/${templateId}/measurements`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (m) => {
      setMeasurements((prev) => [...prev, m]);
      setMAddOpen(false);
      setMAddName("");
      setMAddType("line");
      setMAddPoints(["", ""]);
      setMAddQuadrant("none");
    },
    onError: () => toast({ title: t("ceph.measurementSaveFailed"), variant: "destructive" }),
  });

  const updateMMutation = useMutation({
    mutationFn: ({ mId, body }: { mId: number; body: object }) =>
      customFetch<CephMeasurement>(
        `/api/ceph/templates/${templateId}/measurements/${mId}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),
    onSuccess: (m) => {
      setMeasurements((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      setMEditId(null);
    },
    onError: () => toast({ title: t("ceph.measurementSaveFailed"), variant: "destructive" }),
  });

  const deleteMMutation = useMutation({
    mutationFn: (mId: number) =>
      customFetch(`/api/ceph/templates/${templateId}/measurements/${mId}`, { method: "DELETE" }),
    onSuccess: (_, mId) => {
      setMeasurements((prev) => prev.filter((m) => m.id !== mId));
      setDeleteTarget(null);
      toast({ title: t("ceph.measurementDeleted") });
    },
    onError: () => toast({ title: t("ceph.measurementDeleteFailed"), variant: "destructive" }),
  });

  const reorderMMutation = useMutation({
    mutationFn: (order: number[]) =>
      customFetch(`/api/ceph/templates/${templateId}/measurements/reorder`, {
        method: "PUT",
        body: JSON.stringify({ order }),
      }),
    onError: () => toast({ title: t("ceph.reorderFailed"), variant: "destructive" }),
  });

  function openLmEdit(lm: CephLandmark) {
    setLmEditId(lm.id);
    setLmEditLabel(lm.label);
    setLmEditName(lm.name);
    setLmEditDesc(lm.description ?? "");
  }

  function saveLmEdit() {
    if (!lmEditLabel.trim() || !lmEditName.trim() || lmEditId === null) return;
    updateLmMutation.mutate({
      lmId: lmEditId,
      body: { label: lmEditLabel.trim(), name: lmEditName.trim(), description: lmEditDesc.trim() || null },
    });
  }

  function handleAddLm() {
    if (!lmAddLabel.trim() || !lmAddName.trim()) return;
    addLmMutation.mutate({
      label: lmAddLabel.trim(),
      name: lmAddName.trim(),
      description: lmAddDesc.trim() || null,
      displayOrder: landmarks.length,
    });
  }

  function pointsArrayToBody(type: MeasurementType, points: string[], quadrant: string, unit: string) {
    const n = pointsForType(type);
    return {
      p1Label: points[0] ?? "",
      p2Label: points[1] ?? "",
      p3Label: n >= 3 ? (points[2] ?? "") : null,
      p4Label: n >= 4 ? (points[3] ?? "") : null,
      angleQuadrant: needsQuadrant(type) && quadrant !== "none" ? quadrant : null,
      unit,
    };
  }

  function openMEdit(m: CephMeasurement) {
    setMEditId(m.id);
    setMEditName(m.name);
    setMEditType(m.type);
    setMEditPoints([
      m.p1Label,
      m.p2Label,
      m.p3Label ?? "",
      m.p4Label ?? "",
    ]);
    setMEditQuadrant(m.angleQuadrant ?? "none");
    setMEditUnit(m.unit || unitForType(m.type));
  }

  function saveMEdit() {
    if (!mEditName.trim() || mEditId === null) return;
    updateMMutation.mutate({
      mId: mEditId,
      body: {
        name: mEditName.trim(),
        type: mEditType,
        ...pointsArrayToBody(mEditType, mEditPoints, mEditQuadrant, mEditUnit),
      },
    });
  }

  function handleAddM() {
    if (!mAddName.trim()) return;
    addMMutation.mutate({
      name: mAddName.trim(),
      type: mAddType,
      ...pointsArrayToBody(mAddType, mAddPoints, mAddQuadrant, mAddUnit),
      displayOrder: measurements.length,
    });
  }

  function handleLmDragStart(idx: number) {
    dragLmRef.current = idx;
  }
  function handleLmDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setLmDragOver(idx);
  }
  function handleLmDrop(idx: number) {
    const from = dragLmRef.current;
    if (from === null || from === idx) { setLmDragOver(null); return; }
    const next = [...landmarks];
    const [item] = next.splice(from, 1);
    next.splice(idx, 0, item);
    setLandmarks(next);
    reorderLmMutation.mutate(next.map((l) => l.id));
    dragLmRef.current = null;
    setLmDragOver(null);
  }
  function handleLmDragEnd() {
    dragLmRef.current = null;
    setLmDragOver(null);
  }

  function handleMDragStart(idx: number) {
    dragMRef.current = idx;
  }
  function handleMDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setMDragOver(idx);
  }
  function handleMDrop(idx: number) {
    const from = dragMRef.current;
    if (from === null || from === idx) { setMDragOver(null); return; }
    const next = [...measurements];
    const [item] = next.splice(from, 1);
    next.splice(idx, 0, item);
    setMeasurements(next);
    reorderMMutation.mutate(next.map((m) => m.id));
    dragMRef.current = null;
    setMDragOver(null);
  }
  function handleMDragEnd() {
    dragMRef.current = null;
    setMDragOver(null);
  }

  function updateMEditPoint(idx: number, val: string) {
    setMEditPoints((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }
  function updateMAddPoint(idx: number, val: string) {
    setMAddPoints((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }

  function onMEditTypeChange(type: MeasurementType) {
    setMEditType(type);
    setMEditPoints(Array(pointsForType(type)).fill(""));
    setMEditQuadrant("none");
    setMEditUnit(unitForType(type));
  }
  function onMAddTypeChange(type: MeasurementType) {
    setMAddType(type);
    setMAddPoints(Array(pointsForType(type)).fill(""));
    setMAddQuadrant("none");
    setMAddUnit(unitForType(type));
  }

  function measurementSummary(m: CephMeasurement): string {
    const pts = [m.p1Label, m.p2Label, m.p3Label, m.p4Label].filter(Boolean);
    return pts.join(" → ");
  }

  const locked = template?.locked ?? true;
  const canEdit = isAdmin && !locked;

  if (isLoading || !template) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
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

          <div className="min-w-0 flex-1">
            {canEdit ? (
              <div className="space-y-2">
                <Input
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  className="text-lg font-bold h-9 max-w-md"
                  placeholder={t("ceph.templateNamePlaceholder")}
                />
                <Textarea
                  value={descVal}
                  onChange={(e) => setDescVal(e.target.value)}
                  placeholder={t("ceph.descriptionPlaceholder")}
                  rows={2}
                  className="text-sm max-w-md"
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold leading-tight">{template.name}</h1>
                  {locked && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Lock className="h-3 w-3" />
                      {t("ceph.systemBadge")}
                    </Badge>
                  )}
                </div>
                {template.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{template.description}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <Button
              size="sm"
              onClick={() =>
                saveMeta.mutate({ name: nameVal.trim(), description: descVal.trim() || undefined })
              }
              disabled={!nameVal.trim() || saveMeta.isPending}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saveMeta.isPending ? t("ceph.saving") : t("common.save")}
            </Button>
          )}
          {isAdmin && locked && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCopyDialogName(`${template.name} (copy)`);
                setCopyDialogOpen(true);
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              {t("ceph.copyToEdit")}
            </Button>
          )}
        </div>
      </div>

      {locked && (
        <div className="flex items-center gap-2 rounded-md bg-muted px-4 py-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          {t("ceph.readOnlyNotice")}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Landmarks panel */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("ceph.landmarksPanel")}</CardTitle>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setLmAddOpen(true);
                    setLmAddLabel("");
                    setLmAddName("");
                    setLmAddDesc("");
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {t("ceph.addLandmark")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {/* Add form */}
            {lmAddOpen && canEdit && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2 mb-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t("ceph.addLandmark")}
                </p>
                <div className="flex gap-2">
                  <div className="w-20 shrink-0 space-y-1">
                    <Label className="text-xs">{t("ceph.landmarkLabel")}</Label>
                    <Input
                      value={lmAddLabel}
                      onChange={(e) => setLmAddLabel(e.target.value)}
                      placeholder="S"
                      className="h-8 text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">{t("ceph.landmarkName")}</Label>
                    <Input
                      value={lmAddName}
                      onChange={(e) => setLmAddName(e.target.value)}
                      placeholder={t("ceph.landmarkNamePlaceholder")}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("ceph.landmarkDesc")} <span className="text-muted-foreground">({t("ceph.optional")})</span></Label>
                  <Input
                    value={lmAddDesc}
                    onChange={(e) => setLmAddDesc(e.target.value)}
                    placeholder={t("ceph.landmarkDescPlaceholder")}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={handleAddLm}
                    disabled={!lmAddLabel.trim() || !lmAddName.trim() || addLmMutation.isPending}
                  >
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    {t("ceph.saveLandmark")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setLmAddOpen(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {landmarks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("ceph.noLandmarks")}</p>
            ) : (
              <div className="space-y-1">
                {landmarks.map((lm, idx) => (
                  <div
                    key={lm.id}
                    draggable={canEdit}
                    onDragStart={() => handleLmDragStart(idx)}
                    onDragOver={(e) => handleLmDragOver(e, idx)}
                    onDrop={() => handleLmDrop(idx)}
                    onDragEnd={handleLmDragEnd}
                    className={`rounded-md border transition-colors ${
                      lmDragOver === idx ? "border-primary bg-primary/5" : "border-transparent"
                    }`}
                  >
                    {lmEditId === lm.id && canEdit ? (
                      <div className="p-2 space-y-2 bg-muted/20 rounded-md">
                        <div className="flex gap-2">
                          <div className="w-20 shrink-0 space-y-1">
                            <Label className="text-xs">{t("ceph.landmarkLabel")}</Label>
                            <Input
                              value={lmEditLabel}
                              onChange={(e) => setLmEditLabel(e.target.value)}
                              className="h-7 text-sm"
                              autoFocus
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs">{t("ceph.landmarkName")}</Label>
                            <Input
                              value={lmEditName}
                              onChange={(e) => setLmEditName(e.target.value)}
                              className="h-7 text-sm"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("ceph.landmarkDesc")}</Label>
                          <Input
                            value={lmEditDesc}
                            onChange={(e) => setLmEditDesc(e.target.value)}
                            className="h-7 text-sm"
                            placeholder={t("ceph.landmarkDescPlaceholder")}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-7"
                            onClick={saveLmEdit}
                            disabled={!lmEditLabel.trim() || !lmEditName.trim() || updateLmMutation.isPending}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            {t("common.save")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            onClick={() => setLmEditId(null)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-1 py-1.5 group rounded-md hover:bg-muted/40">
                        {canEdit && (
                          <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab shrink-0" />
                        )}
                        <span className="text-xs text-muted-foreground font-mono w-5 text-right shrink-0 select-none">
                          {idx + 1}.
                        </span>
                        <Badge variant="outline" className="font-mono text-xs shrink-0 w-10 justify-center">
                          {lm.label}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{lm.name}</p>
                          {lm.description && (
                            <p className="text-xs text-muted-foreground truncate">{lm.description}</p>
                          )}
                        </div>
                        {canEdit && (
                          <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => openLmEdit(lm)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget({ kind: "lm", id: lm.id })}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Measurements panel */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("ceph.measurementsPanel")}</CardTitle>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMAddOpen(true);
                    setMAddName("");
                    setMAddType("line");
                    setMAddPoints(["", ""]);
                    setMAddQuadrant("none");
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  {t("ceph.addMeasurement")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {/* Add measurement form */}
            {mAddOpen && canEdit && (
              <MeasurementForm
                name={mAddName}
                type={mAddType}
                points={mAddPoints}
                quadrant={mAddQuadrant}
                unit={mAddUnit}
                landmarks={landmarks}
                onName={setMAddName}
                onType={onMAddTypeChange}
                onPoint={updateMAddPoint}
                onQuadrant={setMAddQuadrant}
                onUnit={setMAddUnit}
                onSave={handleAddM}
                onCancel={() => setMAddOpen(false)}
                saving={addMMutation.isPending}
                isAdd
                t={t}
              />
            )}

            {measurements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("ceph.noMeasurements")}</p>
            ) : (
              <div className="space-y-1">
                {measurements.map((m, idx) => (
                  <div
                    key={m.id}
                    draggable={canEdit}
                    onDragStart={() => handleMDragStart(idx)}
                    onDragOver={(e) => handleMDragOver(e, idx)}
                    onDrop={() => handleMDrop(idx)}
                    onDragEnd={handleMDragEnd}
                    className={`rounded-md border transition-colors ${
                      mDragOver === idx ? "border-primary bg-primary/5" : "border-transparent"
                    }`}
                  >
                    {mEditId === m.id && canEdit ? (
                      <div className="p-2 bg-muted/20 rounded-md">
                        <MeasurementForm
                          name={mEditName}
                          type={mEditType}
                          points={mEditPoints}
                          quadrant={mEditQuadrant}
                          unit={mEditUnit}
                          landmarks={landmarks}
                          onName={setMEditName}
                          onType={onMEditTypeChange}
                          onPoint={updateMEditPoint}
                          onQuadrant={setMEditQuadrant}
                          onUnit={setMEditUnit}
                          onSave={saveMEdit}
                          onCancel={() => setMEditId(null)}
                          saving={updateMMutation.isPending}
                          isAdd={false}
                          t={t}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 px-1 py-1.5 group rounded-md hover:bg-muted/40">
                        {canEdit && (
                          <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{m.name}</p>
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {t(`ceph.typeLabel.${m.type}`)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {measurementSummary(m)}
                          </p>
                        </div>
                        {canEdit && (
                          <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => openMEdit(m)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget({ kind: "m", id: m.id })}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Copy dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={(o) => !o && setCopyDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("ceph.copyTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>{t("ceph.copyNameLabel")}</Label>
            <Input
              value={copyDialogName}
              onChange={(e) => setCopyDialogName(e.target.value)}
              placeholder={t("ceph.copyNamePlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && copyDialogName.trim() && copyMutation.mutate({ name: copyDialogName.trim() })}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => copyDialogName.trim() && copyMutation.mutate({ name: copyDialogName.trim() })}
              disabled={!copyDialogName.trim() || copyMutation.isPending}
            >
              {copyMutation.isPending ? t("ceph.copying") : t("ceph.copyToEdit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === "lm"
                ? t("ceph.confirmDeleteLandmark")
                : t("ceph.confirmDeleteMeasurement")}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("ceph.deleteItemDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.kind === "lm") deleteLmMutation.mutate(deleteTarget.id);
                else deleteMMutation.mutate(deleteTarget.id);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const UNIT_OPTIONS = ["mm", "°", "px", "%"];

interface MeasurementFormProps {
  name: string;
  type: MeasurementType;
  points: string[];
  quadrant: string;
  unit: string;
  landmarks: CephLandmark[];
  onName: (v: string) => void;
  onType: (v: MeasurementType) => void;
  onPoint: (idx: number, v: string) => void;
  onQuadrant: (v: string) => void;
  onUnit: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isAdd: boolean;
  t: (k: string) => string;
}

function MeasurementForm({
  name, type, points, quadrant, unit, landmarks,
  onName, onType, onPoint, onQuadrant, onUnit,
  onSave, onCancel, saving, isAdd, t,
}: MeasurementFormProps) {
  const n = pointsForType(type);

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2 mb-3">
      {isAdd && (
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("ceph.addMeasurement")}
        </p>
      )}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">{t("ceph.measurementName")}</Label>
          <Input
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder={t("ceph.measurementNamePlaceholder")}
            className="h-8 text-sm"
            autoFocus={isAdd}
          />
        </div>
        <div className="w-40 shrink-0 space-y-1">
          <Label className="text-xs">{t("ceph.measurementType")}</Label>
          <Select value={type} onValueChange={(v) => onType(v as MeasurementType)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEASUREMENT_TYPES.map((mt) => (
                <SelectItem key={mt} value={mt} className="text-xs">
                  {t(`ceph.typeLabel.${mt}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-20 shrink-0 space-y-1">
          <Label className="text-xs">{t("ceph.unitLabel")}</Label>
          <Select value={unit} onValueChange={onUnit}>
            <SelectTrigger className="h-8 text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNIT_OPTIONS.map((u) => (
                <SelectItem key={u} value={u} className="text-xs font-mono">
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Label className="text-xs">{pointLabel(type, i, t)}</Label>
            <Select value={points[i] ?? ""} onValueChange={(v) => onPoint(i, v)}>
              <SelectTrigger className="h-8 text-xs font-mono">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {landmarks.map((lm) => (
                  <SelectItem key={lm.id} value={lm.label} className="text-xs font-mono">
                    <span className="font-semibold">{lm.label}</span>
                    {lm.name ? <span className="text-muted-foreground ml-1">— {lm.name}</span> : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {needsQuadrant(type) && (
        <div className="space-y-1">
          <Label className="text-xs">{t("ceph.angleQuadrant")}</Label>
          <Select value={quadrant} onValueChange={onQuadrant}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUADRANTS.map((q) => (
                <SelectItem key={q.value} value={q.value} className="text-xs">
                  {t(q.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={onSave}
          disabled={!name.trim() || saving}
        >
          <Check className="h-3.5 w-3.5 mr-1.5" />
          {t("ceph.saveMeasurement")}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
