import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export function IdleWarningBanner({
  secondsLeft,
  onStaySignedIn,
  onSignOut,
}: {
  secondsLeft: number;
  onStaySignedIn: () => void;
  onSignOut: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const styles = StyleSheet.create({
    container: {
      position: "absolute",
      top: topInset + 8,
      left: 16,
      right: 16,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
      zIndex: 100,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    title: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      flex: 1,
    },
    countdown: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
      textAlign: "center",
    },
    message: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    actions: {
      flexDirection: "row",
      gap: 8,
      marginTop: 4,
    },
    btn: {
      flex: 1,
      height: 42,
      borderRadius: colors.radius,
      alignItems: "center",
      justifyContent: "center",
    },
    signOutBtn: {
      backgroundColor: colors.secondary,
    },
    signOutText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    stayBtn: {
      backgroundColor: colors.primary,
    },
    stayText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
  });

  return (
    <View style={styles.container} testID="idle-warning-banner">
      <View style={styles.row}>
        <Ionicons name="time-outline" size={20} color={colors.primary} />
        <Text style={styles.title}>Still there?</Text>
      </View>
      <Text style={styles.message}>
        You'll be signed out soon due to inactivity.
      </Text>
      <Text style={styles.countdown}>{secondsLeft}s</Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.signOutBtn]}
          onPress={onSignOut}
          testID="idle-warning-sign-out"
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.stayBtn]}
          onPress={onStaySignedIn}
          testID="idle-warning-stay"
        >
          <Text style={styles.stayText}>Stay signed in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
