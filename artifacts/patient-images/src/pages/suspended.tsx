import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ShieldOff, LogIn } from "lucide-react";

export default function SuspendedPage() {
  const { logout } = useAuth();

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

        <div
          className="rounded-2xl p-6 space-y-5 text-center"
          style={{
            background: "rgba(255,255,255,0.07)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <div className="flex justify-center">
            <div className="rounded-full bg-red-500/20 p-4 border border-red-500/30">
              <ShieldOff className="h-8 w-8 text-red-400" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-white">Access Suspended</h2>
            <p className="text-sm text-blue-200/70">
              Your account has been suspended. Please contact your administrator to restore access.
            </p>
          </div>

          <div
            className="rounded-lg p-3 text-left text-xs"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-blue-200/60">
              You have been signed out automatically. Contact your system administrator if you believe this is an error.
            </p>
          </div>

          <Button
            variant="ghost"
            className="w-full text-blue-200/60 hover:text-white hover:bg-white/10"
            onClick={logout}
          >
            <LogIn className="h-4 w-4 mr-2" />
            Back to sign in
          </Button>
        </div>

        <p className="text-center text-xs text-blue-300/50">
          Max7 Vista &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
