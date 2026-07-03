import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { changePassword } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, LogOut } from "lucide-react";

export default function ChangePasswordPage() {
  const { logout, clearForcePasswordChange } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from your current password");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      clearForcePasswordChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #0a1628 0%, #0d2145 40%, #0a2d5e 70%, #061830 100%)",
      }}
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img
            src="/max7-vista-logo.png?v=2"
            alt="Max7 Vista"
            className="mx-auto w-full max-w-xs"
            style={{ mixBlendMode: "screen" }}
          />
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6 space-y-5"
          style={{
            background: "rgba(255,255,255,0.07)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <div className="flex justify-center">
            <div className="rounded-full bg-amber-500/20 p-4 border border-amber-500/30">
              <KeyRound className="h-8 w-8 text-amber-400" />
            </div>
          </div>

          <div className="space-y-2 text-center">
            <h2 className="text-lg font-semibold text-white">Change Your Password</h2>
            <p className="text-sm text-blue-200/70">
              For security, you must set a new password before continuing.
            </p>
          </div>

          {error && (
            <div className="rounded-lg p-3 text-sm text-red-300 bg-red-500/10 border border-red-500/30">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword" className="text-blue-200/80">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="bg-white/10 border-white/20 text-white placeholder:text-blue-200/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword" className="text-blue-200/80">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="bg-white/10 border-white/20 text-white placeholder:text-blue-200/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-blue-200/80">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="bg-white/10 border-white/20 text-white placeholder:text-blue-200/40"
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Updating…" : "Update Password"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-blue-200/60 hover:text-white hover:bg-white/10"
            onClick={logout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </form>

        <p className="text-center text-xs text-blue-300/50">
          Max7 Vista &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
