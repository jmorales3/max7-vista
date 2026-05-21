import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setBaseUrl } from "@workspace/api-client-react";

export const SERVER_URL_KEY = "server_url";

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
        if (stored) {
          setBaseUrl(stored);
          setServerUrlState(stored);
        }
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
