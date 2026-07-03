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
import { refreshSession } from "@/lib/auth";

const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
const WARNING_MS = 2 * 60 * 1000;

export function IdleWarningDialog() {
  const { t } = useTranslation();
  const { logout, user } = useAuth();
  // Idle timeout is configurable per tenant (Settings > Security for
  // admins). The warning appears WARNING_MS before the session's actual
  // rolling expiry so the countdown lines up with the server-side cutoff.
  const idleTimeoutMinutes = user?.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
  const idleMs = Math.max(idleTimeoutMinutes * 60 * 1000 - WARNING_MS, 60 * 1000);
  const { showWarning, secondsLeft, reset } = useIdleTimeout(idleMs, WARNING_MS);

  useEffect(() => {
    if (showWarning && secondsLeft <= 0) {
      void logout();
    }
  }, [showWarning, secondsLeft, logout]);

  const handleStaySignedIn = () => {
    reset();
    void refreshSession();
  };

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
          <Button onClick={handleStaySignedIn}>{t("idleTimeout.staySignedIn")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
