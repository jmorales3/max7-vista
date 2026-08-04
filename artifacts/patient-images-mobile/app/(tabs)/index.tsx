import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useListPatients } from "@workspace/api-client-react";
import type { Patient } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function PatientRow({ patient, colors }: { patient: Patient; colors: ReturnType<typeof useColors> }) {
  const initials = (patient.name ?? "")
    .split(" ")
    .slice(0, 2)
    .map((n) => n?.[0] ?? "")
    .join("")
    .toUpperCase();

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/patient/${patient.id}`);
  };

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={handlePress}
      activeOpacity={0.7}
      testID={`patient-row-${patient.id}`}
    >
      <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
        <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {patient.name}
        </Text>
        <Text style={[styles.code, { color: colors.mutedForeground }]}>
          {patient.patientCode}
          {patient.dateOfBirth ? ` · ${patient.dateOfBirth}` : ""}
        </Text>
      </View>
      <View style={styles.rowRight}>
        {(patient.imageCount ?? 0) > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <Ionicons name="image" size={12} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              {patient.imageCount}
            </Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

export default function PatientsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback((text: string) => {
    setSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  }, []);

  const { data, isLoading, isError, refetch, isFetching } = useListPatients(
    debouncedSearch ? { search: debouncedSearch } : {},
  );

  const patients = data ?? [];

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topInset + 12,
      paddingHorizontal: 16,
      paddingBottom: 8,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 10,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      paddingHorizontal: 12,
      height: 42,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    list: { flex: 1 },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90,
    },
    separator: { height: 8 },
    emptyBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 80,
      gap: 8,
    },
    emptyText: {
      fontSize: 16,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    emptySubtext: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    errorBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 80,
      gap: 12,
    },
    errorText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
    },
    retryBtn: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
    },
    retryBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Patients</Text>
        <View style={s.searchBar}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={handleSearch}
            placeholder="Search by name or code..."
            placeholderTextColor={colors.mutedForeground}
            autoCorrect={false}
            returnKeyType="search"
            testID="patient-search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch("")}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={s.emptyBox}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={s.errorBox}>
          <Ionicons name="cloud-offline" size={40} color={colors.mutedForeground} />
          <Text style={s.errorText}>Failed to load patients</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
            <Text style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          style={s.list}
          contentContainerStyle={s.listContent}
          data={patients}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <PatientRow patient={item} colors={colors} />}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={() => refetch()}
              tintColor={colors.primary}
            />
          }
          scrollEnabled={!!patients.length}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
              <Text style={s.emptyText}>
                {debouncedSearch ? "No patients found" : "No patients yet"}
              </Text>
              {debouncedSearch ? (
                <Text style={s.emptySubtext}>Try a different search term</Text>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  rowInfo: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  code: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
