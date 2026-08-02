import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tags, Plus, Trash2 } from "lucide-react";

interface Tag {
  id: number;
  name: string;
  createdAt: string;
}

interface TagRef {
  id: number;
  name?: string;
  title?: string;
}

class TagConflictError extends Error {
  patients: TagRef[];
  libraryAssets: TagRef[];
  constructor(patients: TagRef[], libraryAssets: TagRef[]) {
    super("This tag is still assigned to one or more patients or library assets.");
    this.patients = patients;
    this.libraryAssets = libraryAssets;
  }
}

async function fetchTags(): Promise<Tag[]> {
  const res = await fetch("/api/tags", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load tags");
  return res.json();
}

async function createTag(name: string): Promise<Tag> {
  const res = await fetch("/api/tags", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create tag");
  }
  return res.json();
}

async function deleteTag(id: number, force = false): Promise<void> {
  const res = await fetch(`/api/tags/${id}${force ? "?force=true" : ""}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    throw new TagConflictError(body.patients ?? [], body.libraryAssets ?? []);
  }
  if (!res.ok && res.status !== 204) throw new Error("Delete failed");
}

const TAGS_QUERY_KEY = ["admin-tags"];

export default function AdminTags() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [deleteConflict, setDeleteConflict] = useState<{ patients: TagRef[]; libraryAssets: TagRef[] } | null>(null);

  const { data: tags = [], isLoading } = useQuery({
    queryKey: TAGS_QUERY_KEY,
    queryFn: fetchTags,
  });

  const createMutation = useMutation({
    mutationFn: createTag,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
      setNewName("");
      toast({ title: t("adminTags.created") });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => deleteTag(id, force),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
      setDeleteTarget(null);
      setDeleteConflict(null);
      toast({ title: t("adminTags.deleted") });
    },
    onError: (err: Error) => {
      if (err instanceof TagConflictError) {
        setDeleteConflict({ patients: err.patients, libraryAssets: err.libraryAssets });
        return;
      }
      toast({ variant: "destructive", title: t("common.error") });
      setDeleteTarget(null);
      setDeleteConflict(null);
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate(name);
  }

  function confirmDelete(force = false) {
    if (!deleteTarget) return;
    deleteMutation.mutate({ id: deleteTarget.id, force });
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary" />
          {t("adminTags.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("adminTags.subtitle")}</p>
      </div>

      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("adminTags.namePlaceholder")}
          className="flex-1"
          maxLength={60}
        />
        <Button type="submit" disabled={!newName.trim() || createMutation.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          {t("adminTags.addTag")}
        </Button>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : tags.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Tags className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("adminTags.noTags")}</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1.5 border"
            >
              <span className="text-sm font-medium">{tag.name}</span>
              <button
                onClick={() => setDeleteTarget(tag)}
                className="h-4 w-4 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteConflict(null); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteConflict ? t("adminTags.deleteConflictTitle") : t("adminTags.deleteTitle")}
            </DialogTitle>
            <DialogDescription asChild>
              {deleteConflict ? (
                <div>
                  {t("adminTags.deleteConflictDesc")}
                  {deleteConflict.patients.length > 0 && (
                    <>
                      <p className="mt-2 text-xs font-medium text-foreground">{t("adminTags.deleteConflictPatients")}</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {deleteConflict.patients.map((p) => (
                          <li key={`p-${p.id}`} className="text-foreground">{p.name}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {deleteConflict.libraryAssets.length > 0 && (
                    <>
                      <p className="mt-2 text-xs font-medium text-foreground">{t("adminTags.deleteConflictAssets")}</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {deleteConflict.libraryAssets.map((a) => (
                          <li key={`a-${a.id}`} className="text-foreground">{a.title}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              ) : (
                <span>{t("adminTags.deleteDesc", { name: deleteTarget?.name ?? "" })}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConflict(null); }}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete(!!deleteConflict)}
              disabled={deleteMutation.isPending}
            >
              {deleteConflict ? t("adminTags.deleteAnyway") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
