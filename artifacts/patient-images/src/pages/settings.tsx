import { useTranslation } from "react-i18next";
import {
  useGetSettings, getGetSettingsQueryKey,
  useUpdateSettings, useScanDirectory,
  useGetImageStats, getGetImageStatsQueryKey,
  useListTags, getListTagsQueryKey,
  useCreateTag, useDeleteTag,
  getListPatientsQueryKey,
  getListImagesQueryKey,
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, Save, HardDrive, Database, Users, ImageIcon,
  AlertCircle, Tag, Plus, X, ClipboardList, KeyRound,
  Download, Upload, ArrowRightLeft, ShieldCheck, RotateCcw,
  Search, ChevronLeft, ChevronRight, Filter,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

interface BackupEntry {
  filename: string;
  createdAt: string;
  sizeBytes: number;
}

interface AuditLogEntry {
  id: number;
  userId: number | null;
  username: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  upload: "Uploaded",
  view: "Viewed",
  edit: "Edited",
  delete: "Deleted",
  replace_file: "Replaced File",
  create: "Created",
};

const ACTION_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  upload: "default",
  view: "secondary",
  edit: "outline",
  delete: "destructive",
  replace_file: "outline",
  create: "default",
};

export default function Settings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [storageDirectory, setStorageDirectory] = useState("");
  const [newTagName, setNewTagName] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [auditAction, setAuditAction] = useState("all");
  const [auditUsername, setAuditUsername] = useState("");
  const [auditEntityId, setAuditEntityId] = useState("");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_PAGE_SIZE = 50;

  const [migrationExporting, setMigrationExporting] = useState(false);
  const [migrationImporting, setMigrationImporting] = useState(false);
  const [migrationFile, setMigrationFile] = useState<File | null>(null);
  const [migrationResult, setMigrationResult] = useState<null | {
    patientsImported: number; patientsSkipped: number;
    imagesImported: number; imagesSkipped: number;
    usersImported: number; usersSkipped: number;
    settingsApplied: number;
    errors: Array<{ item: string; reason: string }>;
  }>(null);

  async function handleMigrationExport() {
    setMigrationExporting(true);
    try {
      const res = await fetch("/api/migration/export", { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `max7-vista-migration-${dateStr}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "Migration archive downloaded." });
    } catch (err) {
      toast({ variant: "destructive", title: "Export failed", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setMigrationExporting(false);
    }
  }

  async function handleMigrationImport() {
    if (!migrationFile) return;
    setMigrationImporting(true);
    setMigrationResult(null);
    try {
      const formData = new FormData();
      formData.append("archive", migrationFile);
      const res = await fetch("/api/migration/import", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const result = await res.json();
      setMigrationResult(result);

      void queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListImagesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetImageStatsQueryKey() });

      toast({
        title: result.errors.length === 0 ? "Migration complete" : "Migration finished with errors",
        description: `${result.patientsImported} patients, ${result.imagesImported} images imported.`,
        variant: result.errors.length > 0 ? "destructive" : "default",
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Import failed", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setMigrationImporting(false);
    }
  }

  const updateCredentials = useMutation({
    mutationFn: async () => {
      if (newPassword && newPassword !== confirmPassword) {
        throw new Error(t("settings.passwordsDoNotMatch"));
      }
      if (!newUsername && !newPassword) {
        throw new Error(t("settings.noChanges"));
      }
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword,
          ...(newUsername ? { newUsername } : {}),
          ...(newPassword ? { newPassword } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("settings.credentialsFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("settings.credentialsUpdated") });
      setCurrentPassword("");
      setNewUsername("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: e.message });
    },
  });

  const isAdmin = user?.role === "superadmin" || user?.role === "admin";

  const auditQueryKey = ["audit-log", auditAction, auditUsername, auditEntityId, auditDateFrom, auditDateTo, auditPage];

  const { data: auditData, isLoading: loadingAudit } = useQuery<{ items: AuditLogEntry[]; total: number; totalPages: number; page: number }>({
    queryKey: auditQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(AUDIT_PAGE_SIZE));
      params.set("page", String(auditPage));
      if (auditAction && auditAction !== "all") params.set("action", auditAction);
      if (auditUsername.trim()) params.set("username", auditUsername.trim());
      if (auditEntityId.trim() && /^\d+$/.test(auditEntityId.trim())) params.set("entityId", auditEntityId.trim());
      if (auditDateFrom) params.set("from", auditDateFrom);
      if (auditDateTo) params.set("to", auditDateTo);
      const res = await fetch(`/api/audit-logs?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
    enabled: isAdmin,
  });

  const auditLogs = auditData?.items ?? [];
  const auditTotalPages = auditData?.totalPages ?? 1;
  const auditTotal = auditData?.total ?? 0;

  const hasAuditFilters = (auditAction && auditAction !== "all") || auditUsername.trim() || auditEntityId.trim() || auditDateFrom || auditDateTo;

  function clearAuditFilters() {
    setAuditAction("all");
    setAuditUsername("");
    setAuditEntityId("");
    setAuditDateFrom("");
    setAuditDateTo("");
    setAuditPage(1);
  }

  const { data: settings, isLoading: loadingSettings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const { data: stats, isLoading: loadingStats } = useGetImageStats({
    query: { queryKey: getGetImageStatsQueryKey() }
  });

  const { data: allTags, isLoading: loadingTags } = useListTags({
    query: { queryKey: getListTagsQueryKey(), enabled: isAdmin }
  });

  useEffect(() => {
    if (settings?.storageDirectory) {
      setStorageDirectory(settings.storageDirectory);
    }
  }, [settings]);

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        toast({ title: t("settings.settingsSaved") });
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          title: t("settings.saveFailed"),
          description: e instanceof Error ? e.message : "An unexpected error occurred."
        });
      }
    }
  });

  const scanDirectory = useScanDirectory({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetImageStatsQueryKey() });
        toast({
          title: t("settings.scanComplete"),
          description: t("settings.scanCompleteDesc", { scanned: data.scanned, indexed: data.indexed })
        });
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          title: t("settings.scanFailed"),
          description: e instanceof Error ? e.message : "An unexpected error occurred."
        });
      }
    }
  });

  const createTag = useCreateTag({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTagsQueryKey() });
        setNewTagName("");
        toast({ title: t("tags.tagCreated") });
      },
      onError: (e: any) => {
        toast({
          variant: "destructive",
          title: t("common.error"),
          description: e?.response?.data?.error ?? t("tags.tagExists"),
        });
      }
    }
  });

  const deleteTag = useDeleteTag({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTagsQueryKey() });
        toast({ title: t("tags.tagDeleted") });
      },
      onError: () => {
        toast({ variant: "destructive", title: t("common.error") });
      }
    }
  });

  const isElectron = typeof window !== "undefined" && !!window.electronAPI;

  const { data: backupsData, isLoading: loadingBackups, refetch: refetchBackups } = useQuery<{ backups: BackupEntry[] }>({
    queryKey: ["backups"],
    queryFn: async () => {
      const res = await fetch("/api/settings/backups", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch backups");
      return res.json();
    },
    enabled: isElectron,
  });

  const triggerBackup = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/backup", { method: "POST", credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Backup failed");
      }
      return res.json() as Promise<{ backup: BackupEntry }>;
    },
    onSuccess: (data) => {
      refetchBackups();
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({
        title: "Backup created",
        description: `Saved as ${data.backup.filename}`,
      });
    },
    onError: (e) => {
      toast({
        variant: "destructive",
        title: "Backup failed",
        description: e instanceof Error ? e.message : "An unexpected error occurred.",
      });
    },
  });

  const [restoringFile, setRestoringFile] = useState<string | null>(null);

  const triggerRestore = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch("/api/settings/restore", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Restore failed");
      }
      return res.json() as Promise<{ success: boolean; message: string }>;
    },
    onSuccess: (data) => {
      setRestoringFile(null);
      refetchBackups();
      toast({
        title: "Restore complete",
        description: data.message,
      });
    },
    onError: (e) => {
      setRestoringFile(null);
      toast({
        variant: "destructive",
        title: "Restore failed",
        description: e instanceof Error ? e.message : "An unexpected error occurred.",
      });
    },
  });

  const handleRestore = (filename: string) => {
    setRestoringFile(filename);
    triggerRestore.mutate(filename);
  };

  const handleSave = () => {
    updateSettings.mutate({ data: { storageDirectory } });
  };

  const handleCreateTag = () => {
    const name = newTagName.trim();
    if (!name) return;
    createTag.mutate({ data: { name } });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t("settings.myAccount")}
          </CardTitle>
          <CardDescription>{t("settings.myAccountDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t("settings.currentPassword")} *</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="newUsername">{t("settings.newUsername")}</Label>
              <Input
                id="newUsername"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                autoComplete="username"
                placeholder={user?.username}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("settings.newPassword")}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          {newPassword && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("settings.confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t pt-6">
          <Button
            onClick={() => updateCredentials.mutate()}
            disabled={!currentPassword || updateCredentials.isPending}
          >
            {updateCredentials.isPending
              ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              : <Save className="mr-2 h-4 w-4" />}
            {t("settings.saveSettings")}
          </Button>
        </CardFooter>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Database className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t("settings.totalImages")}</p>
              {loadingStats ? <Skeleton className="h-8 w-16 mt-1" /> : (
                <h3 className="text-2xl font-bold">{stats?.totalImages || 0}</h3>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t("settings.totalPatients")}</p>
              {loadingStats ? <Skeleton className="h-8 w-16 mt-1" /> : (
                <h3 className="text-2xl font-bold">{stats?.totalPatients || 0}</h3>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <AlertCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t("settings.unassigned")}</p>
              {loadingStats ? <Skeleton className="h-8 w-16 mt-1" /> : (
                <h3 className="text-2xl font-bold">{stats?.unassignedImages || 0}</h3>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ImageIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{t("settings.recent30d")}</p>
              {loadingStats ? <Skeleton className="h-8 w-16 mt-1" /> : (
                <h3 className="text-2xl font-bold">{stats?.recentUploads || 0}</h3>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            {t("settings.storageConfig")}
          </CardTitle>
          <CardDescription>{t("settings.storageConfigDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="storageDirectory">{t("settings.rootDirectory")}</Label>
            {loadingSettings ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="flex gap-2">
                <Input
                  id="storageDirectory"
                  value={storageDirectory}
                  onChange={(e) => setStorageDirectory(e.target.value)}
                  className="font-mono flex-1"
                  placeholder="/path/to/image/storage"
                />
                {window.electronAPI && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const selected = await window.electronAPI!.selectFolder();
                      if (selected) setStorageDirectory(selected);
                    }}
                    title="Browse for folder (desktop app only)"
                  >
                    {t("settings.browseFolders")}
                  </Button>
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {t("settings.rootDirectoryHint")}
              {" "}<code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;root&gt;/&lt;patientId&gt;/YYYY-MM-DD/</code>
            </p>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6">
          <Button onClick={handleSave} disabled={updateSettings.isPending || loadingSettings}>
            {updateSettings.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t("settings.saveSettings")}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            {t("settings.dirIndexing")}
          </CardTitle>
          <CardDescription>{t("settings.dirIndexingDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {t("settings.scanLegacyDesc")}
          </p>
          <div className="bg-muted/50 p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-medium">{t("settings.scanLegacy")}</h4>
              <p className="text-sm text-muted-foreground mt-1">
                {t("settings.lastScan")}: {settings?.lastScanAt ? format(new Date(settings.lastScanAt), "MMM d, yyyy h:mm a") : t("settings.neverScanned")}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => scanDirectory.mutate()}
              disabled={scanDirectory.isPending}
            >
              {scanDirectory.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {t("settings.scanning")}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("settings.runScan")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isElectron && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Database Backups
            </CardTitle>
            <CardDescription>
              Automatic daily backups protect patient data against corruption or hardware failure. Up to 7 rolling copies are kept.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-medium">Last Backup</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {(() => {
                    const backups = backupsData?.backups ?? [];
                    if (loadingBackups) return "Loading…";
                    if (backups.length === 0) return "No backups yet";
                    const last = backups[0];
                    return `${formatDistanceToNow(new Date(last.createdAt), { addSuffix: true })} — ${(last.sizeBytes / 1024 / 1024).toFixed(1)} MB`;
                  })()}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => triggerBackup.mutate()}
                disabled={triggerBackup.isPending}
              >
                {triggerBackup.isPending ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Backing up…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Back Up Now
                  </>
                )}
              </Button>
            </div>

            {loadingBackups ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : backupsData && backupsData.backups.length > 0 ? (
              <div>
                <h4 className="text-sm font-medium mb-2">Available Backups</h4>
                <div className="divide-y rounded-md border overflow-hidden">
                  {backupsData.backups.map((backup) => (
                    <div key={backup.filename} className="flex items-center justify-between px-4 py-3 bg-background hover:bg-muted/30 transition-colors gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono truncate">{backup.filename}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(backup.createdAt), "MMM d, yyyy h:mm a")} · {(backup.sizeBytes / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestore(backup.filename)}
                        disabled={triggerRestore.isPending}
                        title="Restore this backup"
                      >
                        {restoringFile === backup.filename && triggerRestore.isPending ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1.5">Restore</span>
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Restoring replaces the current database. The app will need to restart afterwards.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No backups found. Click "Back Up Now" to create the first one.</p>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              {t("tags.manageTags")}
            </CardTitle>
            <CardDescription>{t("tags.manageTagsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingTags ? (
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}
              </div>
            ) : allTags && allTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1.5 text-sm font-medium"
                  >
                    <Tag className="h-3.5 w-3.5" />
                    {tag.name}
                    <button
                      onClick={() => deleteTag.mutate({ id: tag.id })}
                      className="ml-1 text-primary/60 hover:text-destructive transition-colors"
                      title={t("tags.deleteTag")}
                      disabled={deleteTag.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("tags.noTags")}</p>
            )}

            <div className="flex gap-2 pt-2 border-t">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder={t("tags.newTag")}
                className="max-w-sm"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateTag(); }}
              />
              <Button
                onClick={handleCreateTag}
                disabled={!newTagName.trim() || createTag.isPending}
              >
                {createTag.isPending
                  ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  : <Plus className="mr-2 h-4 w-4" />}
                {t("tags.addTag")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {user?.role === "superadmin" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Migration
            </CardTitle>
            <CardDescription>
              Move all data (patients, images, users, settings) between the LAN desktop app and the web version. Export from the source system, then import on the destination.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Export */}
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-primary" />
                  <p className="font-medium text-sm">Export from this system</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Downloads a ZIP archive containing all patients, images (files included), users, and settings. Use this on the LAN desktop app before switching to the web version.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleMigrationExport}
                  disabled={migrationExporting}
                  className="w-full"
                >
                  {migrationExporting
                    ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Exporting…</>
                    : <><Download className="mr-2 h-4 w-4" /> Download migration archive</>}
                </Button>
              </div>

              {/* Import */}
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-primary" />
                  <p className="font-medium text-sm">Import into this system</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Upload a migration archive exported from another Max7 Vista instance. Existing patients and users are skipped (no duplicates).
                </p>
                <div className="space-y-2">
                  <Input
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(e) => {
                      setMigrationFile(e.target.files?.[0] ?? null);
                      setMigrationResult(null);
                    }}
                    className="cursor-pointer"
                  />
                  <Button
                    type="button"
                    onClick={handleMigrationImport}
                    disabled={!migrationFile || migrationImporting}
                    className="w-full"
                  >
                    {migrationImporting
                      ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Importing…</>
                      : <><Upload className="mr-2 h-4 w-4" /> Import archive</>}
                  </Button>
                </div>
              </div>
            </div>

            {migrationResult && (
              <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
                <p className="text-sm font-medium">Import summary</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  {[
                    { label: "Patients imported", value: migrationResult.patientsImported },
                    { label: "Patients skipped", value: migrationResult.patientsSkipped },
                    { label: "Images imported",  value: migrationResult.imagesImported },
                    { label: "Images skipped",   value: migrationResult.imagesSkipped },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-md bg-background border p-3">
                      <p className="text-xl font-bold">{value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                {migrationResult.errors.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-destructive">{migrationResult.errors.length} error(s):</p>
                    <div className="max-h-32 overflow-y-auto rounded border bg-background p-2 space-y-1">
                      {migrationResult.errors.map((e, i) => (
                        <p key={i} className="text-xs font-mono text-muted-foreground">
                          <span className="text-foreground">{e.item}</span>: {e.reason}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Audit Log
            </CardTitle>
            <CardDescription>
              A record of who viewed, uploaded, edited, or deleted patient images and records.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filter bar */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Filter className="h-4 w-4" />
                Filter entries
                {hasAuditFilters && (
                  <button
                    onClick={clearAuditFilters}
                    className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <X className="h-3 w-3" />
                    Clear filters
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {/* Username search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search by username"
                    value={auditUsername}
                    onChange={(e) => { setAuditUsername(e.target.value); setAuditPage(1); }}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
                {/* Patient / Image ID */}
                <Input
                  type="number"
                  placeholder="Patient or image ID (e.g. 42)"
                  value={auditEntityId}
                  onChange={(e) => { setAuditEntityId(e.target.value); setAuditPage(1); }}
                  className="h-9 text-sm"
                  min={1}
                />
                {/* Action type */}
                <Select
                  value={auditAction}
                  onValueChange={(v) => { setAuditAction(v); setAuditPage(1); }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All action types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All action types</SelectItem>
                    <SelectItem value="view">View</SelectItem>
                    <SelectItem value="upload">Upload</SelectItem>
                    <SelectItem value="create">Create</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                    <SelectItem value="delete">Delete</SelectItem>
                    <SelectItem value="replace_file">Replace File</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Date from */}
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground shrink-0">From</Label>
                  <Input
                    type="date"
                    value={auditDateFrom}
                    onChange={(e) => { setAuditDateFrom(e.target.value); setAuditPage(1); }}
                    className="h-9 text-sm flex-1"
                  />
                </div>
                {/* Date to */}
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground shrink-0">To</Label>
                  <Input
                    type="date"
                    value={auditDateTo}
                    onChange={(e) => { setAuditDateTo(e.target.value); setAuditPage(1); }}
                    className="h-9 text-sm flex-1"
                  />
                </div>
              </div>
            </div>

            {/* Results */}
            {loadingAudit ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {hasAuditFilters
                  ? "No entries match your filters. Try adjusting the search criteria."
                  : "No audit log entries yet. Actions on images and patients will appear here."}
              </p>
            ) : (
              <>
                <div className="divide-y rounded-md border overflow-hidden">
                  {auditLogs.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 px-4 py-3 text-sm bg-background hover:bg-muted/30 transition-colors">
                      <Badge
                        variant={ACTION_VARIANTS[entry.action] ?? "outline"}
                        className="mt-0.5 shrink-0 capitalize"
                      >
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium">
                            {entry.username ?? "System"}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground capitalize">
                            {entry.entityType} {entry.entityId ? `#${entry.entityId}` : ""}
                          </span>
                        </div>
                        {entry.details && (() => {
                          try {
                            const parsed = JSON.parse(entry.details);
                            const label = parsed.fileName ?? parsed.name ?? parsed.patientCode ?? null;
                            return label ? (
                              <p className="text-muted-foreground text-xs mt-0.5 truncate">{label}</p>
                            ) : null;
                          } catch {
                            return null;
                          }
                        })()}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                        {format(new Date(entry.createdAt), "MMM d, yyyy h:mm a")}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {auditTotalPages > 1 && (
                  <div className="flex items-center justify-between pt-1 text-sm text-muted-foreground">
                    <span>
                      Showing {((auditPage - 1) * AUDIT_PAGE_SIZE) + 1}–{Math.min(auditPage * AUDIT_PAGE_SIZE, auditTotal)} of {auditTotal} entries
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                        disabled={auditPage <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="px-2 text-xs">
                        Page {auditPage} of {auditTotalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                        disabled={auditPage >= auditTotalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
