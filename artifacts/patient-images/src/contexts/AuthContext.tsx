import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getSession, login as apiLogin, logout as apiLogout, type AuthUser, PendingApprovalError } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  pendingApproval: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingApproval, setPendingApproval] = useState(false);

  useEffect(() => {
    getSession()
      .then(setUser)
      .finally(() => setLoading(false));
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
  }

  return (
    <AuthContext.Provider value={{ user, loading, pendingApproval, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
