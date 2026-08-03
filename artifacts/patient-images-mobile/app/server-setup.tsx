import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useColorScheme,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useColors } from "@/hooks/useColors";
import { useServer } from "@/contexts/ServerContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ServerSetupScreen() {
  const colors = useColors();
  const { saveServerUrl } = useServer();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const params = useLocalSearchParams<{ edit?: string }>();
  const isEditMode = params.edit === "true";

  const [url, setUrl] = useState(
    process.env.EXPO_PUBLIC_API_URL ?? "https://patient-image-manager.replit.app",
  );
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanHandled, setScanHandled] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const normalise = (raw: string) => raw.trim().replace(/\/+$/, "");

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError("Camera permission is needed to scan the QR code");
        return;
      }
    }
    setScanHandled(false);
    setScannerOpen(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanHandled) return;
    setScanHandled(true);
    setScannerOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setUrl(data.trim());
    setError(null);
  };

  const validate = (raw: string): string | null => {
    const u = normalise(raw);
    if (!u) return "Please enter a server address";
    if (!/^https?:\/\//i.test(u)) return "Address must start with http:// or https://";
    try {
      new URL(u);
    } catch {
      return "Not a valid URL — example: http://192.168.1.50:8080";
    }
    return null;
  };

  const handleConnect = async () => {
    const validationError = validate(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setTesting(true);

    const target = normalise(url);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(`${target}/api/auth/session`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok && resp.status !== 401) {
        setError(`Server responded with ${resp.status} — check the address and try again`);
        setTesting(false);
        return;
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setError("Connection timed out — check the address and make sure the server is running");
      } else {
        setError(`Could not reach server — check the address and your network connection`);
      }
      setTesting(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    await saveServerUrl(target);
    setSuccess(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTesting(false);

    setTimeout(() => {
      if (isEditMode) {
        router.back();
      } else {
        router.replace("/login");
      }
    }, 600);
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Platform.OS === "web" ? 67 : insets.top,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom,
    },
    scroll: { flexGrow: 1, justifyContent: "center" },
    inner: { paddingHorizontal: 28, paddingVertical: 32 },
    logoRow: { alignItems: "center", marginBottom: 36 },
    iconBg: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 6,
      lineHeight: 20,
    },
    infoBox: {
      backgroundColor: isDark ? colors.card : "#f0f7ff",
      borderRadius: colors.radius,
      padding: 14,
      marginBottom: 20,
      gap: 8,
    },
    infoRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
    infoText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      flex: 1,
      lineHeight: 18,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 8,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark ? colors.card : colors.secondary,
      borderWidth: 1,
      borderColor: error ? colors.destructive : colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      height: 52,
    },
    input: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    errorBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#fff0f0",
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
      marginTop: 10,
    },
    errorText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      flex: 1,
    },
    connectBtn: {
      height: 52,
      backgroundColor: success ? "#16a34a" : colors.primary,
      borderRadius: colors.radius,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 16,
      flexDirection: "row",
      gap: 8,
    },
    connectBtnDisabled: { opacity: 0.6 },
    connectBtnText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    backBtn: {
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 12,
    },
    backBtnText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    example: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 6,
    },
    scanBtn: {
      height: 46,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 14,
      flexDirection: "row",
      gap: 8,
    },
    scanBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    scannerContainer: {
      flex: 1,
      backgroundColor: "#000",
    },
    scannerOverlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    scannerFrame: {
      width: 240,
      height: 240,
      borderWidth: 3,
      borderColor: "#fff",
      borderRadius: 16,
      backgroundColor: "transparent",
    },
    scannerHint: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: "#fff",
      marginTop: 24,
      textAlign: "center",
      paddingHorizontal: 32,
    },
    scannerCloseBtn: {
      position: "absolute",
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
    },
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <View style={styles.logoRow}>
            <View style={styles.iconBg}>
              <Ionicons name="server-outline" size={34} color="#fff" />
            </View>
            <Text style={styles.title}>
              {isEditMode ? "Change Server" : "Server Setup"}
            </Text>
            <Text style={styles.subtitle}>
              {isEditMode
                ? "Enter the new server address to reconnect"
                : "Enter the address of the Max7 Vista server on your clinic network"}
            </Text>
          </View>

          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Ionicons name="globe-outline" size={16} color={colors.mutedForeground} />
              <Text style={styles.infoText}>
                Use your clinic's published address (e.g.{" "}
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>https://your-clinic.replit.app</Text>
                ) to connect from anywhere without Wi-Fi restrictions.
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="wifi-outline" size={16} color={colors.mutedForeground} />
              <Text style={styles.infoText}>
                Or use the local network address (e.g.{" "}
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>http://192.168.x.x:8080</Text>
                ) when on the same Wi-Fi as the server.
              </Text>
            </View>
          </View>

          <Text style={styles.label}>Server Address</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={(v) => { setUrl(v); setError(null); }}
              placeholder="http://192.168.1.50:8080"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={handleConnect}
              editable={!testing}
            />
          </View>
          <Text style={styles.example}>
            Include http:// and the port number
          </Text>

          <TouchableOpacity
            style={styles.scanBtn}
            onPress={openScanner}
            activeOpacity={0.8}
            disabled={testing}
          >
            <Ionicons name="qr-code-outline" size={18} color={colors.primary} />
            <Text style={styles.scanBtnText}>Scan QR Code</Text>
          </TouchableOpacity>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.destructive} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.connectBtn, (testing || !url.trim()) && styles.connectBtnDisabled]}
            onPress={handleConnect}
            disabled={testing || !url.trim()}
            activeOpacity={0.8}
          >
            {testing ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : success ? (
              <>
                <Ionicons name="checkmark-circle" size={20} color={colors.primaryForeground} />
                <Text style={styles.connectBtnText}>Connected!</Text>
              </>
            ) : (
              <Text style={styles.connectBtnText}>Test & Connect</Text>
            )}
          </TouchableOpacity>

          {isEditMode && (
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
      >
        <View style={styles.scannerContainer}>
          {permission?.granted && (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={scanHandled ? undefined : handleBarcodeScanned}
            />
          )}
          <View style={[StyleSheet.absoluteFill, styles.scannerOverlay]} pointerEvents="none">
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerHint}>
              Point the camera at the QR code shown in the app's Settings page
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.scannerCloseBtn, { top: insets.top + 12, right: 16 }]}
            onPress={() => setScannerOpen(false)}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
