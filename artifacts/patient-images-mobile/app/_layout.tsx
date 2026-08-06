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
import { AppState, type AppStateStatus, View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
// Initialize i18n and restore persisted language before first render
import "@/i18n";
import { initLanguage } from "@/i18n";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ServerProvider, useServer } from "@/contexts/ServerContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { IdleWarningBanner } from "@/components/IdleWarningBanner";

SplashScreen.preventAutoHideAsync();

// ─── Session-expired toast overlay ──────────────────────────────────────────
// Rendered above the Stack so it persists through the route transition to
// /login and gives the user immediate feedback before (and during) the redirect.
function SessionExpiredToast({ onDismiss }: { onDismiss: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const styles = StyleSheet.create({
    container: {
      position: "absolute",
      top: topInset + 8,
      left: 16,
      right: 16,
      backgroundColor: "#fffbea",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#fde68a",
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 10,
      zIndex: 200,
    },
    text: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: "#92400e",
    },
    close: {
      padding: 2,
    },
  });

  return (
    <View style={styles.container} testID="session-expired-toast">
      <Ionicons name="time-outline" size={18} color="#92400e" />
      <Text style={styles.text}>{t("login.sessionExpired")}</Text>
      <Ionicons
        name="close"
        size={18}
        color="#92400e"
        style={styles.close}
        onPress={onDismiss}
        testID="session-expired-toast-dismiss"
      />
    </View>
  );
}
// ────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
// Window before the idle cutoff during which returning to the foreground
// shows a countdown warning instead of logging the user out immediately.
const IDLE_WARNING_MS = 60 * 1000;

function RootLayoutNav() {
  const { serverUrl, isLoading: serverLoading } = useServer();
  const { user, isLoading: authLoading, logout, sessionExpired } = useAuth();
  // Tracks whether we have already routed the user to their initial destination.
  // Once true, in-app navigation (patient detail, settings, etc.) is never
  // interrupted by this guard. It resets when the user logs out or the server
  // URL is cleared so those transitions still force the correct screen.
  const initialRouteDone = useRef(false);
  const bgTimestampRef = useRef<number | null>(null);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);
  const idleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Session-expired toast: fires when the unauthorized handler kicks in
  // during a live action (delete, upload, etc.) — shows immediately on top of
  // whatever screen the user is on, then persists into the login redirect.
  const [sessionExpiredToastVisible, setSessionExpiredToastVisible] = useState(false);
  const prevSessionExpiredRef = useRef(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (sessionExpired && !prevSessionExpiredRef.current) {
      setSessionExpiredToastVisible(true);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => {
        setSessionExpiredToastVisible(false);
      }, 4000);
    }
    if (!sessionExpired) {
      // User logged in again — clear the toast immediately.
      setSessionExpiredToastVisible(false);
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    }
    prevSessionExpiredRef.current = sessionExpired;
  }, [sessionExpired]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Idle timeout is configurable per tenant (Settings > Session Timeout for
  // admins on the web app); the mobile app mirrors whatever the server reports.
  const mobileIdleMs = Math.max(
    (user?.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES) * 60 * 1000,
    IDLE_WARNING_MS + 10_000
  );

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

        if (elapsed >= mobileIdleMs) {
          void logout().finally(() => {
            router.replace("/login");
          });
        } else if (elapsed >= mobileIdleMs - IDLE_WARNING_MS) {
          const remainingMs = mobileIdleMs - elapsed;
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
  }, [user, logout, clearIdleWarning, mobileIdleMs]);

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
      {sessionExpiredToastVisible && (
        <SessionExpiredToast
          onDismiss={() => {
            setSessionExpiredToastVisible(false);
            if (toastTimeoutRef.current) {
              clearTimeout(toastTimeoutRef.current);
              toastTimeoutRef.current = null;
            }
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

  // Restore persisted language selection before splash hides
  useEffect(() => {
    void initLanguage();
  }, []);

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
