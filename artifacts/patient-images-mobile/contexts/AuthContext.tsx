import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthTokenGetter } from "@workspace/api-client-react";

interface AuthUser {
  id: number;
  username: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function restore() {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        const userJson = await AsyncStorage.getItem(USER_KEY);
        if (token && userJson) {
          setAuthTokenGetter(() => token);
          const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
          const resp = await fetch(`${baseUrl}/api/auth/session`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (resp.ok) {
            const fresh = (await resp.json()) as AuthUser;
            setUser(fresh);
          } else {
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
    const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
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

    setAuthTokenGetter(token ? () => token : null);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    try {
      await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // best effort
    }
    setAuthTokenGetter(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
