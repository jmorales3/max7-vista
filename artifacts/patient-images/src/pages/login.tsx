import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock } from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #0a1628 0%, #0d2145 40%, #0a2d5e 70%, #061830 100%)",
      }}
    >
      <div className="absolute top-4 right-4">
        <LanguageSelector />
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
          <h2 className="text-lg font-semibold text-center text-white">{t("auth.welcome")}</h2>

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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
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

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold"
              disabled={loading || !username || !password}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("auth.loginButton")}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-blue-300/50">
          Max7 Vista &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
