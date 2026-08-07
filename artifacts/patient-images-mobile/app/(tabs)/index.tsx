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
  Modal,
  Dimensions,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPatients,
  useListImages,
  getListImagesQueryKey,
  customFetch,
  getBaseUrl,
} from "@workspace/api-client-react";
import type { Patient, Image as PatientImage } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";

// ─── Patient row ─────────────────────────────────────────────────────────────

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

// ─── Assign modal ─────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get("window").width;

function AssignModal({
  image,
  visible,
  onClose,
  onAssigned,
}: {
  image: PatientImage | null;
  visible: boolean;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { token: authToken } = useAuth();
  const baseUrl = getBaseUrl() ?? "";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [assigning, setAssigning] = useState(false);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback((text: string) => {
    setSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  }, []);

  const { data: patients, isLoading: patientsLoading } = useListPatients(
    debouncedSearch ? { search: debouncedSearch } : {},
  );

  const handleClose = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setSelectedPatient(null);
    setAssigning(false);
    onClose();
  }, [onClose]);

  const handleAssign = useCallback(async () => {
    if (!image || !selectedPatient) return;
    setAssigning(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await customFetch(`/api/images/${image.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: selectedPatient.id }),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSearch("");
      setDebouncedSearch("");
      setSelectedPatient(null);
      onAssigned();
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t("unassigned.assignError"), err instanceof Error ? err.message : String(err));
    } finally {
      setAssigning(false);
    }
  }, [image, selectedPatient, onAssigned, t]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const imageUrl = image
    ? authToken
      ? `${baseUrl}/api/images/${image.id}/file?token=${encodeURIComponent(authToken)}`
      : `${baseUrl}/api/images/${image.id}/file`
    : null;

  const s = StyleSheet.create({
    modal: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: topInset + 12,
      paddingHorizontal: 16,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: {
      width: 36, height: 36, borderRadius: 18,
      borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.card, alignItems: "center", justifyContent: "center",
    },
    preview: {
      width: SCREEN_WIDTH - 32,
      height: (SCREEN_WIDTH - 32) * 0.6,
      margin: 16,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: colors.muted,
      alignSelf: "center",
    },
    previewImg: { width: "100%", height: "100%" },
    notesLabel: {
      marginHorizontal: 16,
      marginBottom: 4,
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    notesText: {
      marginHorizontal: 16,
      marginBottom: 12,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    sectionLabel: {
      marginHorizontal: 16,
      marginBottom: 8,
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      paddingHorizontal: 12,
      height: 42,
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 8,
    },
    searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground },
    patientItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    patientItemSelected: { backgroundColor: colors.accent + "44" },
    patientAvatar: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: colors.accent, alignItems: "center", justifyContent: "center",
    },
    patientAvatarSelected: { backgroundColor: colors.primary },
    patientInitials: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.primary },
    patientInitialsSelected: { color: colors.primaryForeground },
    patientName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    patientCode: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    checkmark: { marginLeft: "auto" },
    footer: {
      padding: 16,
      paddingBottom: Platform.OS === "web" ? 24 : insets.bottom + 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 10,
    },
    assignBtn: {
      height: 52, borderRadius: colors.radius,
      backgroundColor: colors.primary, alignItems: "center",
      justifyContent: "center", flexDirection: "row", gap: 8,
    },
    assignBtnDisabled: { opacity: 0.45 },
    assignBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    cancelBtn: {
      height: 44, borderRadius: colors.radius,
      borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.card, alignItems: "center", justifyContent: "center",
    },
    cancelBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground },
    emptyBox: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 8 },
    emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={s.modal}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{t("unassigned.assignTitle")}</Text>
          <TouchableOpacity style={s.closeBtn} onPress={handleClose} disabled={assigning}>
            <Ionicons name="close" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          {imageUrl && (
            <View style={s.preview}>
              <Image source={{ uri: imageUrl }} style={s.previewImg} contentFit="cover" transition={200} />
            </View>
          )}

          {image?.notes ? (
            <>
              <Text style={s.notesLabel}>{t("unassigned.notes")}</Text>
              <Text style={s.notesText}>{image.notes}</Text>
            </>
          ) : null}

          <Text style={s.sectionLabel}>{t("unassigned.selectPatient")}</Text>

          <View style={s.searchBar}>
            <Ionicons name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={handleSearch}
              placeholder={t("unassigned.searchPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => handleSearch("")}>
                <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {patientsLoading ? (
            <View style={s.emptyBox}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : (patients ?? []).length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyText}>
                {debouncedSearch ? t("patients.notFound") : t("patients.noneYet")}
              </Text>
            </View>
          ) : (
            (patients ?? []).map((p) => {
              const initials = (p.name ?? "")
                .split(" ")
                .slice(0, 2)
                .map((n) => n?.[0] ?? "")
                .join("")
                .toUpperCase();
              const isSelected = selectedPatient?.id === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[s.patientItem, isSelected && s.patientItemSelected]}
                  onPress={() => setSelectedPatient(isSelected ? null : p)}
                  activeOpacity={0.7}
                >
                  <View style={[s.patientAvatar, isSelected && s.patientAvatarSelected]}>
                    <Text style={[s.patientInitials, isSelected && s.patientInitialsSelected]}>
                      {initials}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.patientName}>{p.name}</Text>
                    <Text style={s.patientCode}>{p.patientCode}</Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} style={s.checkmark} />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.assignBtn, (!selectedPatient || assigning) && s.assignBtnDisabled]}
            onPress={handleAssign}
            disabled={!selectedPatient || assigning}
            activeOpacity={0.8}
          >
            {assigning ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <>
                <Ionicons name="person-add-outline" size={18} color={colors.primaryForeground} />
                <Text style={s.assignBtnText}>
                  {selectedPatient
                    ? t("unassigned.assignTo", { name: selectedPatient.name })
                    : t("unassigned.assignBtn")}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={handleClose} disabled={assigning}>
            <Text style={s.cancelBtnText}>{t("unassigned.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Unassigned tab ───────────────────────────────────────────────────────────

function UnassignedTab({ colors, insets }: { colors: ReturnType<typeof useColors>; insets: ReturnType<typeof useSafeAreaInsets> }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { token: authToken } = useAuth();
  const baseUrl = getBaseUrl() ?? "";

  const [assignTarget, setAssignTarget] = useState<PatientImage | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const unassignedQueryParams = { isUnassigned: true };
  const { data: images, isLoading, isError, refetch, isFetching } = useListImages(unassignedQueryParams);

  const GAP = 4;
  const PADDING = 16;
  const COLS = 3;
  const itemSize = (SCREEN_WIDTH - PADDING * 2 - GAP * (COLS - 1)) / COLS;

  const handlePress = useCallback(async (img: PatientImage) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAssignTarget(img);
    setModalVisible(true);
  }, []);

  const handleAssigned = useCallback(() => {
    setModalVisible(false);
    setAssignTarget(null);
    void queryClient.invalidateQueries({ queryKey: getListImagesQueryKey(unassignedQueryParams) });
    void queryClient.invalidateQueries({ queryKey: ["listPatients"] });
    void queryClient.invalidateQueries({ queryKey: ["listPatientImages"] });
  }, [queryClient]);

  const s = StyleSheet.create({
    flex1: { flex: 1 },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      padding: PADDING,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90,
      gap: GAP,
    },
    thumb: {
      width: itemSize,
      height: itemSize,
      borderRadius: 8,
      overflow: "hidden",
      backgroundColor: colors.muted,
    },
    thumbImg: { width: "100%", height: "100%" },
    assignOverlay: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingVertical: 4,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
    },
    assignOverlayText: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    emptyBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 80,
      gap: 12,
    },
    emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 32 },
    errorBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
    errorText: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.destructive },
    retryBtn: {
      paddingHorizontal: 20, paddingVertical: 10,
      backgroundColor: colors.primary, borderRadius: colors.radius,
    },
    retryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    countBadge: {
      paddingHorizontal: 8, paddingVertical: 2,
      backgroundColor: colors.destructive, borderRadius: 10, marginLeft: 6,
    },
    countBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  });

  if (isLoading) {
    return (
      <View style={s.emptyBox}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={s.errorBox}>
        <Ionicons name="cloud-offline" size={40} color={colors.mutedForeground} />
        <Text style={s.errorText}>{t("unassigned.loadError")}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
          <Text style={s.retryBtnText}>{t("patients.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const imageList = images ?? [];

  return (
    <View style={s.flex1}>
      <ScrollView
        style={s.flex1}
        contentContainerStyle={imageList.length === 0 ? { flex: 1 } : undefined}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {imageList.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="images-outline" size={52} color={colors.mutedForeground} />
            <Text style={s.emptyText}>{t("unassigned.noneYet")}</Text>
            <Text style={s.emptySubtext}>{t("unassigned.noneYetHint")}</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {imageList.map((img) => {
              const imageUrl = authToken
                ? `${baseUrl}/api/images/${img.id}/file?token=${encodeURIComponent(authToken)}`
                : `${baseUrl}/api/images/${img.id}/file`;
              return (
                <TouchableOpacity
                  key={img.id}
                  style={s.thumb}
                  onPress={() => handlePress(img)}
                  activeOpacity={0.8}
                  testID={`unassigned-image-${img.id}`}
                >
                  <Image source={{ uri: imageUrl }} style={s.thumbImg} contentFit="cover" transition={200} />
                  <View style={s.assignOverlay}>
                    <Text style={s.assignOverlayText}>{t("unassigned.tapToAssign")}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <AssignModal
        image={assignTarget}
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setAssignTarget(null); }}
        onAssigned={handleAssigned}
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type ActiveTab = "patients" | "unassigned";

export default function PatientsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ActiveTab>("patients");
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

  // Also fetch unassigned count for badge
  const { data: unassignedImages } = useListImages({ isUnassigned: true });
  const unassignedCount = (unassignedImages ?? []).length;

  const patients = data ?? [];
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topInset + 12,
      paddingHorizontal: 16,
      paddingBottom: 0,
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
    tabRow: {
      flexDirection: "row",
      gap: 4,
      marginBottom: -1,
    },
    tab: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
      gap: 6,
    },
    tabActive: {
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    tabTextActive: {
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
    },
    unassignedBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.destructive,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    unassignedBadgeText: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: "#fff",
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      paddingHorizontal: 12,
      height: 42,
      gap: 8,
      margin: 16,
      marginTop: 12,
      marginBottom: 0,
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
        <Text style={s.headerTitle}>{t("patients.title")}</Text>

        {/* Tab bar */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tab, activeTab === "patients" && s.tabActive]}
            onPress={() => setActiveTab("patients")}
            activeOpacity={0.7}
          >
            <Ionicons
              name="people"
              size={16}
              color={activeTab === "patients" ? colors.primary : colors.mutedForeground}
            />
            <Text style={[s.tabText, activeTab === "patients" && s.tabTextActive]}>
              {t("tabs.patients")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tab, activeTab === "unassigned" && s.tabActive]}
            onPress={() => setActiveTab("unassigned")}
            activeOpacity={0.7}
            testID="unassigned-tab"
          >
            <Ionicons
              name="images"
              size={16}
              color={activeTab === "unassigned" ? colors.primary : colors.mutedForeground}
            />
            <Text style={[s.tabText, activeTab === "unassigned" && s.tabTextActive]}>
              {t("unassigned.tab")}
            </Text>
            {unassignedCount > 0 && (
              <View style={s.unassignedBadge}>
                <Text style={s.unassignedBadgeText}>{unassignedCount > 99 ? "99+" : unassignedCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Patients tab */}
      {activeTab === "patients" && (
        <>
          <View style={s.searchBar}>
            <Ionicons name="search" size={18} color={colors.mutedForeground} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={handleSearch}
              placeholder={t("patients.search")}
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

          {isLoading ? (
            <View style={s.emptyBox}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : isError ? (
            <View style={s.errorBox}>
              <Ionicons name="cloud-offline" size={40} color={colors.mutedForeground} />
              <Text style={s.errorText}>{t("patients.loadError")}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
                <Text style={s.retryBtnText}>{t("patients.retry")}</Text>
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
                    {debouncedSearch ? t("patients.notFound") : t("patients.noneYet")}
                  </Text>
                  {debouncedSearch ? (
                    <Text style={s.emptySubtext}>{t("patients.tryDifferent")}</Text>
                  ) : null}
                </View>
              }
            />
          )}
        </>
      )}

      {/* Unassigned tab */}
      {activeTab === "unassigned" && (
        <UnassignedTab colors={colors} insets={insets} />
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
