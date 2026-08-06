import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import i18n, { AVAILABLE_LANGUAGES, setLanguage, type LanguageCode } from "@/i18n";

export default function SettingsScreen() {
  const colors = useColors();
  const { user, logout } = useAuth();
  const { serverUrl } = useServer();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handleLogout = () => {
    Alert.alert(
      t("settings.signOutTitle"),
      t("settings.signOutMsg"),
      [
        { text: t("settings.cancel"), style: "cancel" },
        {
          text: t("settings.signOut"),
          style: "destructive",
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await logout();
          },
        },
      ],
    );
  };

  const handleChangeServer = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/server-setup?edit=true");
  };

  const handleSelectLanguage = async (code: LanguageCode) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setLanguage(code);
  };

  const currentLanguage = i18n.language as LanguageCode;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topInset + 12,
      paddingHorizontal: 16,
      paddingBottom: 14,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    scroll: { flex: 1 },
    section: { marginTop: 28, paddingHorizontal: 16 },
    sectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    rowContent: { flex: 1 },
    rowLabel: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    rowValue: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    logoutRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    logoutLabel: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.destructive,
    },
    langRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 13,
      gap: 12,
    },
    langLabel: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    langActive: {
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
    },
    footer: {
      paddingVertical: 32,
      paddingBottom: bottomInset + 32,
      alignItems: "center",
    },
    footerText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t("settings.title")}</Text>
      </View>

      <ScrollView style={s.scroll}>
        {/* Account */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>{t("settings.account")}</Text>
          <View style={s.card}>
            <View style={s.row}>
              <View style={[s.rowIcon, { backgroundColor: colors.primary + "20" }]}>
                <Ionicons name="person" size={16} color={colors.primary} />
              </View>
              <View style={s.rowContent}>
                <Text style={s.rowLabel}>{user?.username ?? "—"}</Text>
                <Text style={s.rowValue}>{user?.role ?? ""}</Text>
              </View>
            </View>

            <TouchableOpacity style={[s.logoutRow, s.rowDivider]} onPress={handleLogout} activeOpacity={0.7}>
              <View style={[s.rowIcon, { backgroundColor: "#fff0f0" }]}>
                <Ionicons name="log-out-outline" size={16} color={colors.destructive} />
              </View>
              <Text style={s.logoutLabel}>{t("settings.signOut")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Server */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>{t("settings.server")}</Text>
          <View style={s.card}>
            <TouchableOpacity style={s.row} onPress={handleChangeServer} activeOpacity={0.7}>
              <View style={[s.rowIcon, { backgroundColor: colors.accent }]}>
                <Ionicons name="server-outline" size={16} color={colors.primary} />
              </View>
              <View style={s.rowContent}>
                <Text style={s.rowLabel}>{t("settings.serverAddress")}</Text>
                <Text style={s.rowValue} numberOfLines={1}>
                  {serverUrl ?? t("settings.notConfigured")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Language */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>{t("settings.language")}</Text>
          <View style={s.card}>
            {AVAILABLE_LANGUAGES.map((lang, idx) => (
              <TouchableOpacity
                key={lang.code}
                style={[s.langRow, idx > 0 && s.rowDivider]}
                onPress={() => handleSelectLanguage(lang.code)}
                activeOpacity={0.7}
              >
                <Text style={[s.langLabel, currentLanguage === lang.code && s.langActive]}>
                  {lang.label}
                </Text>
                {currentLanguage === lang.code && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>{t("settings.footer")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
