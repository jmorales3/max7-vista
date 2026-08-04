import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type AppStateStatus } from "react-native";
import { setAuthTokenGetter, setUnauthorizedHandler, setSuspendedHandler } from "@workspace/api-client-react";
import { SERVER_URL_KEY } from "./ServerContext";

// Mirrors the fallback in ServerContext so that AuthContext can always
// construct a valid base URL even before ServerContext writes to AsyncStorage.
const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://patient-image-manager.replit.app";

interface AuthUser {
  id: number;
  username: string;
  role: string;
  idleTimeoutMinutes?: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  sessionExpired: boolean;
  suspended: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

// How often we ping the server while the app is active and a user is
// signed in, so a rolling session doesn't silently expire during periods
// of on-screen inactivity that generate no other API calls.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [suspended, setSuspended] = useState(false);

  // Keep a stable ref to the current token so the unauthorized handler can
  // read it without capturing a stale closure.
  const tokenRef = useRef<string | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Wire up the global 401/403 interceptors once on mount.
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

    setSuspendedHandler(() => {
      setAuthTokenGetter(null);
      tokenRef.current = null;
      void AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
      setUser(null);
      setSuspended(true);
    });

    return () => {
      setUnauthorizedHandler(null);
      setSuspendedHandler(null);
    };
  }, []);

  // Periodically touch the session while the app is foregrounded and a user
  // is signed in, extending the server's rolling session expiry even if the
  // user isn't triggering other API calls.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const refresh = async () => {
      if (!userRef.current || !tokenRef.current) return;
      try {
        const baseUrl = (await AsyncStorage.getItem(SERVER_URL_KEY)) ?? DEFAULT_API_URL;
        await fetch(`${baseUrl}/api/auth/refresh`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tokenRef.current}` },
        });
      } catch {
        // best effort — a failed refresh ping is not fatal, the next one
        // will retry, and normal API calls will surface real auth errors.
      }
    };

    const startInterval = () => {
      if (interval) return;
      interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    };
    const stopInterval = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    if (user) {
      startInterval();
    }

    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active" && userRef.current) {
        void refresh();
        startInterval();
      } else if (nextState !== "active") {
        stopInterval();
      }
    });

    return () => {
      stopInterval();
      sub.remove();
    };
  }, [user]);

  useEffect(() => {
    async function restore() {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        const userJson = await AsyncStorage.getItem(USER_KEY);
        if (token && userJson) {
          tokenRef.current = token;
          setAuthTokenGetter(() => token);
          const baseUrl = (await AsyncStorage.getItem(SERVER_URL_KEY)) ?? DEFAULT_API_URL;
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
    const baseUrl = (await AsyncStorage.getItem(SERVER_URL_KEY)) ?? DEFAULT_API_URL;
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
    setSuspended(false);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    const baseUrl = (await AsyncStorage.getItem(SERVER_URL_KEY)) ?? DEFAULT_API_URL;
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
    setSuspended(false);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token: tokenRef.current, isLoading, sessionExpired, suspended, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
