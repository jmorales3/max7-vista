import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PresentationStub {
  id: number;
  title: string;
}

interface SaveOverlayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presentations: PresentationStub[];
  isPending: boolean;
  onSave: (pickId: string, newTitle: string) => void;
}

/**
 * Isolated dialog so its local state (pickId + newTitle) never triggers
 * a re-render of the parent editor on every keystroke.
 */
export function SaveOverlayDialog({
  open,
  onOpenChange,
  presentations,
  isPending,
  onSave,
}: SaveOverlayDialogProps) {
  const { t } = useTranslation();
  const [pickId, setPickId] = useState<string>("new");
  const [newTitle, setNewTitle] = useState("");

  // Reset to defaults each time the dialog opens.
  useEffect(() => {
    if (open) {
      setPickId("new");
      setNewTitle("");
    }
  }, [open]);

  function handleSave() {
    onSave(pickId, newTitle);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editor.overlayPresentationTitle")}</DialogTitle>
          <DialogDescription>{t("editor.overlayPresentationDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("editor.overlayPresentationAddTo")}</Label>
            <Select value={pickId} onValueChange={setPickId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">{t("editor.overlayPresentationNewLabel")}</SelectItem>
                {presentations.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {pickId === "new" && (
            <div className="space-y-2">
              <Label>{t("editor.overlayPresentationNewName")}</Label>
              <Input
                autoFocus
                placeholder={t("editor.overlayPresentationNewName")}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {t("presentation.addToPresentation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
