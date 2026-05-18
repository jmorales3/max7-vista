import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { register } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Clock } from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
        setSuccess("Account created! An administrator will review your request before you can sign in.");
        setMode("login");
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === "login" ? t("auth.loginFailed") : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError("");
    setSuccess("");
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #0a1628 0%, #0d2145 40%, #0a2d5e 70%, #061830 100%)",
      }}
    >
      <div className="absolute top-4 right-4">
        <LanguageSelector variant="dark" />
      </div>

      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img
            src="/max7-vista-logo.png"
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
            {mode === "login" ? t("auth.welcome") : "Request Access"}
          </h2>

          {mode === "register" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200 text-xs">
              <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                New accounts require admin approval before you can sign in. You will be notified when access is granted.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-blue-100">{t("auth.username")}</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
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
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "Minimum 6 characters" : t("auth.passwordPlaceholder")}
                disabled={loading}
                required
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-blue-400"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 text-sm">
                <Lock className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/20 border border-green-500/30 text-green-200 text-sm">
                <Clock className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold"
              disabled={loading || !username || !password}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {mode === "login" ? t("auth.loginButton") : "Request Access"}
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={switchMode}
              className="text-xs text-blue-300/60 hover:text-blue-200 transition-colors"
            >
              {mode === "login"
                ? "Don't have an account? Request access"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-blue-300/50">
          Max7 Vista &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
