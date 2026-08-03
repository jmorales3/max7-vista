import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setBaseUrl } from "@workspace/api-client-react";

export const SERVER_URL_KEY = "server_url";

// The production API URL.  EXPO_PUBLIC_API_URL is baked in by Metro at build
// time when set in the environment; the hardcoded string is a reliable fallback
// so the app works out of the box when loaded via Expo Go without any env var.
const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://patient-image-manager.replit.app";

interface ServerContextValue {
  serverUrl: string | null;
  isLoading: boolean;
  saveServerUrl: (url: string) => Promise<void>;
}

const ServerContext = createContext<ServerContextValue | null>(null);

export function ServerProvider({ children }: { children: React.ReactNode }) {
  const [serverUrl, setServerUrlState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const stored = await AsyncStorage.getItem(SERVER_URL_KEY);
        // Prefer the user-saved URL; fall back to the baked-in / hardcoded URL.
        const url = stored ?? DEFAULT_API_URL;
        const normalized = url.trim().replace(/\/+$/, "");
        // Persist the resolved URL so AuthContext (which reads AsyncStorage
        // directly) always finds a valid base URL even on a fresh install.
        if (!stored) {
          await AsyncStorage.setItem(SERVER_URL_KEY, normalized);
        }
        setBaseUrl(normalized);
        setServerUrlState(normalized);
      } catch {
        // ignore storage errors
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  const saveServerUrl = useCallback(async (url: string) => {
    const normalized = url.trim().replace(/\/+$/, "");
    await AsyncStorage.setItem(SERVER_URL_KEY, normalized);
    setBaseUrl(normalized);
    setServerUrlState(normalized);
  }, []);

  return (
    <ServerContext.Provider value={{ serverUrl, isLoading, saveServerUrl }}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error("useServer must be used inside ServerProvider");
  return ctx;
}
