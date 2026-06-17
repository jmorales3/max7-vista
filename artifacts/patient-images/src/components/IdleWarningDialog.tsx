import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

const IDLE_MS = 15 * 60 * 1000;
const WARNING_MS = 2 * 60 * 1000;

export function IdleWarningDialog() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { showWarning, secondsLeft, reset } = useIdleTimeout(IDLE_MS, WARNING_MS);

  useEffect(() => {
    if (showWarning && secondsLeft <= 0) {
      void logout();
    }
  }, [showWarning, secondsLeft, logout]);

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const countdown = `${minutes}:${String(secs).padStart(2, "0")}`;

  return (
    <Dialog open={showWarning} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("idleTimeout.title")}</DialogTitle>
          <DialogDescription>{t("idleTimeout.message")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center py-4">
          <span className="text-5xl font-mono font-bold tabular-nums text-primary">
            {countdown}
          </span>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => void logout()}>
            {t("idleTimeout.signOut")}
          </Button>
          <Button onClick={reset}>{t("idleTimeout.staySignedIn")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
