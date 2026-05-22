import { useTranslation } from "react-i18next";
import {
  useGetSettings, getGetSettingsQueryKey,
  useUpdateSettings, useScanDirectory,
  useGetImageStats, getGetImageStatsQueryKey,
  useListTags, getListTagsQueryKey,
  useCreateTag, useDeleteTag,
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
  AlertCircle, Tag, Plus, X, ClipboardList,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

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

  const isAdmin = user?.role === "superadmin" || user?.role === "admin";

  const { data: auditLogs, isLoading: loadingAudit } = useQuery<AuditLogEntry[]>({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const res = await fetch("/api/audit-log", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
    enabled: isAdmin,
  });

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
          <CardContent>
            {loadingAudit ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !auditLogs || auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No audit log entries yet. Actions on images and patients will appear here.
              </p>
            ) : (
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
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
