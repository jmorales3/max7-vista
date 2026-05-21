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
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ServerProvider, useServer } from "@/contexts/ServerContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function RootLayoutNav() {
  const { serverUrl, isLoading: serverLoading } = useServer();
  const { user, isLoading: authLoading } = useAuth();
  // Tracks whether we have already routed the user to their initial destination.
  // Once true, in-app navigation (patient detail, settings, etc.) is never
  // interrupted by this guard. It resets when the user logs out or the server
  // URL is cleared so those transitions still force the correct screen.
  const initialRouteDone = useRef(false);

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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="server-setup" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="patient/[id]" />
    </Stack>
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
