import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { register } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Clock, ShieldCheck } from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";

type Mode = "login" | "register" | "setup";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    fetch("/api/auth/needs-setup", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { needsSetup: boolean }) => {
        if (data.needsSetup) setMode("setup");
      })
      .catch(() => {})
      .finally(() => setCheckingSetup(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (mode === "setup" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else if (mode === "register") {
        await register(username.trim(), password);
        setSuccess("Account created! An administrator will review your request before you can sign in.");
        setMode("login");
        setPassword("");
      } else if (mode === "setup") {
        const res = await fetch("/api/auth/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username: username.trim(), password }),
        });
        const body = await res.json();
        if (res.status === 403) {
          // Setup already done — browser had a stale cached response; switch to login
          setMode("login");
          setPassword("");
          setConfirmPassword("");
          setError("");
          return;
        }
        if (!res.ok) throw new Error(body.error ?? "Setup failed");
        setSuccess(t("auth.setupSuccess"));
        setMode("login");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === "login" ? t("auth.loginFailed") : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0a1628 0%, #0d2145 40%, #0a2d5e 70%, #061830 100%)" }}>
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #0a1628 0%, #0d2145 40%, #0a2d5e 70%, #061830 100%)" }}
    >
      <div className="absolute top-4 right-4">
        <LanguageSelector variant="dark" />
      </div>

      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img
            src="/max7-vista-logo.png?v=2"
            alt="Max7 Vista"
            className="mx-auto w-full max-w-xs"
            style={{ mixBlendMode: "screen" }}
          />
          <p className="text-blue-200/70 text-sm mt-1">{t("auth.subtitle")}</p>
        </div>

        <div
          className="rounded-2xl p-6 space-y-5"
          style={{
            background: "rgba(255,255,255,0.07)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <h2 className="text-lg font-semibold text-center text-white">
            {mode === "login" && t("auth.welcome")}
            {mode === "register" && t("auth.requestAccessTitle")}
            {mode === "setup" && t("auth.setupTitle")}
          </h2>

          {mode === "setup" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/15 border border-blue-400/30 text-blue-200 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-400" />
              <span>{t("auth.setupInfo")}</span>
            </div>
          )}

          {mode === "register" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-xs">
              <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{t("auth.pendingApproval")}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-blue-100">{t("auth.username")}</Label>
              <Input
                id="username"
                type="text"
                autoComplete="off"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("auth.usernamePlaceholder")}
                disabled={loading}
                required
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-blue-400"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-blue-100">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "login" ? t("auth.passwordPlaceholder") : t("auth.passwordMinLength")}
                disabled={loading}
                required
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-blue-400"
              />
            </div>

            {mode === "setup" && (
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-blue-100">{t("auth.confirmPassword")}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  disabled={loading}
                  required
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-blue-400"
                />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 text-sm">
                <Lock className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/20 border border-green-500/30 text-green-200 text-sm">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold"
              disabled={loading || !username || !password}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {mode === "login" && t("auth.loginButton")}
              {mode === "register" && t("auth.requestAccessButton")}
              {mode === "setup" && t("auth.setupButton")}
            </Button>
          </form>

          {mode !== "setup" && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setSuccess(""); }}
                className="text-xs text-blue-300/60 hover:text-blue-200 transition-colors"
              >
                {mode === "login" ? t("auth.noAccount") : t("auth.alreadyHaveAccount")}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-blue-300/50">
          Max7 Vista &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
