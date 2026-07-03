import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { getSession, login as apiLogin, logout as apiLogout, refreshSession, type AuthUser, PendingApprovalError } from "@/lib/auth";
import { registerForceLogout, registerSuspended } from "@/lib/authBridge";

// Periodically touches the server session so an open-but-passive tab (no
// mouse/keyboard activity, but no idle warning shown yet either) doesn't
// silently expire between the 15-minute idle warning and the 30-minute
// server-side session timeout. Mirrors the mobile app's heartbeat.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  pendingApproval: boolean;
  suspended: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  forceLogout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;

  useEffect(() => {
    getSession()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (userRef.current) void refreshSession();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    registerForceLogout(() => {
      setUser(null);
      setPendingApproval(false);
      setSuspended(false);
    });
    registerSuspended(() => {
      setUser(null);
      setPendingApproval(false);
      setSuspended(true);
    });
  }, []);

  async function login(username: string, password: string) {
    try {
      const u = await apiLogin(username, password);
      setPendingApproval(false);
      setUser(u);
    } catch (err) {
      if (err instanceof PendingApprovalError) {
        setPendingApproval(true);
        throw err;
      }
      throw err;
    }
  }

  async function logout() {
    await apiLogout();
    setUser(null);
    setPendingApproval(false);
    setSuspended(false);
  }

  function forceLogout() {
    setUser(null);
    setPendingApproval(false);
    setSuspended(false);
  }

  return (
    <AuthContext.Provider value={{ user, loading, pendingApproval, suspended, login, logout, forceLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
