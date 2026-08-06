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
  useColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

export default function LoginScreen() {
  const colors = useColors();
  const { login, sessionExpired, suspended } = useAuth();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { t } = useTranslation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError(t("login.errors.enterCredentials"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("login.errors.failed");
      setError(msg);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Platform.OS === "web" ? 67 : insets.top,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom,
    },
    inner: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 28,
    },
    logoRow: {
      alignItems: "center",
      marginBottom: 40,
    },
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
      fontSize: 26,
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
    },
    form: {
      gap: 12,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    field: {
      marginBottom: 4,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark ? colors.card : colors.secondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      height: 50,
    },
    input: {
      flex: 1,
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    eyeBtn: {
      padding: 4,
    },
    errorBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#fff0f0",
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
      marginBottom: 4,
    },
    errorText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      flex: 1,
    },
    loginBtn: {
      height: 52,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    loginBtnDisabled: {
      opacity: 0.6,
    },
    loginBtnText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    sessionBanner: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#fffbea",
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
      marginBottom: 16,
    },
    sessionBannerText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: "#92400e",
      flex: 1,
    },
    suspendedBanner: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#fff0f0",
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
      marginBottom: 16,
    },
    suspendedBannerText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      flex: 1,
    },
    footer: {
      paddingBottom: 20,
      alignItems: "center",
    },
    footerText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <View style={styles.logoRow}>
          <View style={styles.iconBg}>
            <Ionicons name="image-outline" size={36} color="#fff" />
          </View>
          <Text style={styles.title}>{t("login.title")}</Text>
          <Text style={styles.subtitle}>{t("login.subtitle")}</Text>
        </View>

        <View style={styles.form}>
          {sessionExpired && (
            <View style={styles.sessionBanner}>
              <Ionicons name="time-outline" size={18} color="#92400e" />
              <Text style={styles.sessionBannerText}>{t("login.sessionExpired")}</Text>
            </View>
          )}
          {suspended && (
            <View style={styles.suspendedBanner}>
              <Ionicons name="ban-outline" size={18} color={colors.destructive} />
              <Text style={styles.suspendedBannerText}>{t("login.suspended")}</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>{t("login.usernameLabel")}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder={t("login.usernamePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                testID="username-input"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("login.passwordLabel")}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={t("login.passwordPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPassword}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                testID="password-input"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={20}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.destructive} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.loginBtn, (loading || !username || !password) && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading || !username || !password}
            activeOpacity={0.8}
            testID="login-button"
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.loginBtnText}>{t("login.signIn")}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t("login.footer")}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}
