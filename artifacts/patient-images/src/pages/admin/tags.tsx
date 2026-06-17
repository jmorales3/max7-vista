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

async function deleteTag(id: number): Promise<void> {
  const res = await fetch(`/api/tags/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) throw new Error("Delete failed");
}

const TAGS_QUERY_KEY = ["admin-tags"];

export default function AdminTags() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);

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
    mutationFn: deleteTag,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
      setDeleteTarget(null);
      toast({ title: t("adminTags.deleted") });
    },
    onError: () => {
      toast({ variant: "destructive", title: t("common.error") });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate(name);
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

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminTags.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("adminTags.deleteDesc", { name: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
