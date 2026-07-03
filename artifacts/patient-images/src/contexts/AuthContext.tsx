import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { getSession, login as apiLogin, logout as apiLogout, refreshSession, verifyMfaLogin, type AuthUser, PendingApprovalError, MfaRequiredError } from "@/lib/auth";
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
  mfaPending: boolean;
  login: (username: string, password: string) => Promise<void>;
  verifyMfa: (token: string) => Promise<void>;
  cancelMfa: () => void;
  logout: () => Promise<void>;
  forceLogout: () => void;
  clearForcePasswordChange: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [mfaPending, setMfaPending] = useState(false);
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
      setMfaPending(false);
      setUser(u);
    } catch (err) {
      if (err instanceof PendingApprovalError) {
        setPendingApproval(true);
        throw err;
      }
      if (err instanceof MfaRequiredError) {
        setMfaPending(true);
        throw err;
      }
      throw err;
    }
  }

  async function verifyMfa(token: string) {
    const u = await verifyMfaLogin(token);
    setMfaPending(false);
    setUser(u);
  }

  function cancelMfa() {
    setMfaPending(false);
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

  function clearForcePasswordChange() {
    setUser((prev) => (prev ? { ...prev, forcePasswordChange: false } : prev));
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, pendingApproval, suspended, mfaPending, login, verifyMfa, cancelMfa, logout, forceLogout, clearForcePasswordChange }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
