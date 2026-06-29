import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthTokenGetter, setUnauthorizedHandler } from "@workspace/api-client-react";
import { SERVER_URL_KEY } from "./ServerContext";

interface AuthUser {
  id: number;
  username: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  sessionExpired: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Keep a stable ref to the current token so the unauthorized handler can
  // read it without capturing a stale closure.
  const tokenRef = useRef<string | null>(null);

  // Wire up the global 401 interceptor once on mount.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Clear credentials immediately so subsequent requests don't retry
      // with an invalid token.
      setAuthTokenGetter(null);
      tokenRef.current = null;
      void AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
      setUser(null);
      setSessionExpired(true);
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  useEffect(() => {
    async function restore() {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        const userJson = await AsyncStorage.getItem(USER_KEY);
        if (token && userJson) {
          tokenRef.current = token;
          setAuthTokenGetter(() => token);
          const baseUrl = (await AsyncStorage.getItem(SERVER_URL_KEY)) ?? "";
          const resp = await fetch(`${baseUrl}/api/auth/session`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (resp.ok) {
            const fresh = (await resp.json()) as AuthUser;
            setUser(fresh);
          } else {
            tokenRef.current = null;
            await AsyncStorage.removeItem(TOKEN_KEY);
            await AsyncStorage.removeItem(USER_KEY);
            setAuthTokenGetter(null);
            setUser(null);
          }
        }
      } catch {
        // ignore restore errors
      } finally {
        setIsLoading(false);
      }
    }
    void restore();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const baseUrl = (await AsyncStorage.getItem(SERVER_URL_KEY)) ?? "";
    const resp = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!resp.ok) {
      const data = (await resp.json()) as { error?: string };
      throw new Error(data.error ?? "Login failed");
    }

    const userData = (await resp.json()) as AuthUser & { authToken?: string };
    const token = userData.authToken ?? "";

    tokenRef.current = token || null;
    setAuthTokenGetter(token ? () => token : null);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
    setSessionExpired(false);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    const baseUrl = (await AsyncStorage.getItem(SERVER_URL_KEY)) ?? "";
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    try {
      await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // best effort
    }
    tokenRef.current = null;
    setAuthTokenGetter(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
    setSessionExpired(false);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, sessionExpired, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
