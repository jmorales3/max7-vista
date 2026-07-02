import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ServerProvider, useServer } from "@/contexts/ServerContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { IdleWarningBanner } from "@/components/IdleWarningBanner";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const MOBILE_IDLE_MS = 15 * 60 * 1000;
// Window before the idle cutoff during which returning to the foreground
// shows a countdown warning instead of logging the user out immediately.
const IDLE_WARNING_MS = 60 * 1000;

function RootLayoutNav() {
  const { serverUrl, isLoading: serverLoading } = useServer();
  const { user, isLoading: authLoading, logout } = useAuth();
  // Tracks whether we have already routed the user to their initial destination.
  // Once true, in-app navigation (patient detail, settings, etc.) is never
  // interrupted by this guard. It resets when the user logs out or the server
  // URL is cleared so those transitions still force the correct screen.
  const initialRouteDone = useRef(false);
  const bgTimestampRef = useRef<number | null>(null);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);
  const idleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearIdleWarning = useCallback(() => {
    if (idleIntervalRef.current) {
      clearInterval(idleIntervalRef.current);
      idleIntervalRef.current = null;
    }
    setIdleSecondsLeft(null);
  }, []);

  const dismissIdleWarning = useCallback(() => {
    clearIdleWarning();
  }, [clearIdleWarning]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        bgTimestampRef.current = Date.now();
      } else if (nextState === "active" && bgTimestampRef.current !== null) {
        const elapsed = Date.now() - bgTimestampRef.current;
        bgTimestampRef.current = null;

        if (!user) return;

        if (elapsed >= MOBILE_IDLE_MS) {
          void logout().finally(() => {
            router.replace("/login");
          });
        } else if (elapsed >= MOBILE_IDLE_MS - IDLE_WARNING_MS) {
          const remainingMs = MOBILE_IDLE_MS - elapsed;
          setIdleSecondsLeft(Math.ceil(remainingMs / 1000));
          const deadline = Date.now() + remainingMs;
          if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
          idleIntervalRef.current = setInterval(() => {
            const secondsLeft = Math.ceil((deadline - Date.now()) / 1000);
            if (secondsLeft <= 0) {
              clearIdleWarning();
              void logout().finally(() => {
                router.replace("/login");
              });
              return;
            }
            setIdleSecondsLeft(secondsLeft);
          }, 1000);
        }
      }
    });
    return () => sub.remove();
  }, [user, logout, clearIdleWarning]);

  useEffect(() => {
    if (!user) clearIdleWarning();
  }, [user, clearIdleWarning]);

  useEffect(() => {
    return () => {
      if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (serverLoading) return;

    // No server configured → always force Server Setup, reset route flag.
    if (!serverUrl) {
      initialRouteDone.current = false;
      router.replace("/server-setup");
      return;
    }

    if (authLoading) return;

    // Not authenticated → force Login, reset route flag so the next successful
    // login / session restore triggers the initial-route redirect again.
    if (!user) {
      initialRouteDone.current = false;
      router.replace("/login");
      return;
    }

    // Authenticated + server configured.
    // Redirect to tabs exactly once (initial app start or after login).
    // After that, leave all navigation to the user and individual screens —
    // this prevents the guard from intercepting /patient/[id] or /server-setup?edit=true.
    if (!initialRouteDone.current) {
      initialRouteDone.current = true;
      router.replace("/(tabs)");
    }
  }, [serverUrl, serverLoading, user, authLoading]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="server-setup" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="patient/[id]" />
      </Stack>
      {idleSecondsLeft !== null && (
        <IdleWarningBanner
          secondsLeft={idleSecondsLeft}
          onStaySignedIn={dismissIdleWarning}
          onSignOut={() => {
            clearIdleWarning();
            void logout().finally(() => router.replace("/login"));
          }}
        />
      )}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <ServerProvider>
                <AuthProvider>
                  <RootLayoutNav />
                </AuthProvider>
              </ServerProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
