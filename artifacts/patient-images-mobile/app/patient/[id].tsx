import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Dimensions,
  Platform,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPatient,
  useListPatientImages,
  useListImages,
  useListPatients,
  useDeletePatient,
  useDeleteImage,
  getBaseUrl,
  getListPatientsQueryKey,
  getListPatientImagesQueryKey,
  getListImagesQueryKey,
  customFetch,
  ApiError,
} from "@workspace/api-client-react";
import type { Image as PatientImage, Patient } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";

type DeleteConflict = { id: number; title: string }[];

function conflictMessage(base: string, conflict: DeleteConflict) {
  const titles = conflict.map((p) => `• ${p.title}`).join("\n");
  return `${base}\n\n${titles}`;
}

type GridColumns = 1 | 2 | 4;

const SCREEN_WIDTH = Dimensions.get("window").width;

function ImageGridItem({
  image,
  columns,
  baseUrl,
  authToken,
  colors,
  onPress,
  onLongPress,
  selectMode = false,
  isSelected = false,
}: {
  image: PatientImage;
  columns: GridColumns;
  baseUrl: string;
  authToken: string | null;
  colors: ReturnType<typeof useColors>;
  onPress: (image: PatientImage) => void;
  onLongPress?: (image: PatientImage) => void;
  selectMode?: boolean;
  isSelected?: boolean;
}) {
  const gap = 4;
  const padding = 16;
  const totalPad = padding * 2 + gap * (columns - 1);
  const itemSize = (SCREEN_WIDTH - totalPad) / columns;
  const imageUrl = authToken
    ? `${baseUrl}/api/images/${image.id}/file?token=${encodeURIComponent(authToken)}`
    : `${baseUrl}/api/images/${image.id}/file`;

  return (
    <TouchableOpacity
      onPress={() => onPress(image)}
      onLongPress={() => onLongPress?.(image)}
      delayLongPress={400}
      activeOpacity={0.85}
      style={[
        gridStyles.item,
        {
          width: itemSize,
          height: itemSize,
          borderRadius: columns === 1 ? 10 : 6,
          margin: gap / 2,
        },
        selectMode && isSelected && { borderWidth: 3, borderColor: colors.primary },
      ]}
      testID={`image-item-${image.id}`}
    >
      <Image
        source={{ uri: imageUrl }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        transition={200}
      />
      {selectMode && (
        <View style={gridStyles.checkOverlay}>
          {isSelected ? (
            <View style={[gridStyles.checkCircle, { backgroundColor: colors.primary }]}>
              <Ionicons name="checkmark" size={16} color="#fff" />
            </View>
          ) : (
            <View style={gridStyles.checkEmpty} />
          )}
        </View>
      )}
      {!selectMode && image.notes ? (
        columns === 1 ? (
          <View style={[gridStyles.noteBanner, { backgroundColor: colors.card }]}>
            <Text style={[gridStyles.noteText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {image.notes}
            </Text>
          </View>
        ) : (
          <View style={gridStyles.noteOverlay}>
            <Text
              style={[gridStyles.noteOverlayText, columns === 4 && gridStyles.noteOverlayTextSmall]}
              numberOfLines={columns === 4 ? 1 : 2}
            >
              {image.notes}
            </Text>
          </View>
        )
      ) : null}
    </TouchableOpacity>
  );
}

const gridStyles = StyleSheet.create({
  item: {
    overflow: "hidden",
    backgroundColor: "#eee",
  },
  noteBanner: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  noteText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  noteOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 5,
    paddingVertical: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  noteOverlayText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: "Inter_400Regular",
    color: "#fff",
  },
  noteOverlayTextSmall: {
    fontSize: 9,
    lineHeight: 11,
  },
  checkOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  checkEmpty: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
});

// ─── Move to Patient Modal ────────────────────────────────────────────────────

function MoveToPatientModal({
  sourcePatientId,
  selectedIds,
  visible,
  onClose,
  onMoved,
}: {
  sourcePatientId: number;
  selectedIds: Set<number>;
  visible: boolean;
  onClose: () => void;
  onMoved: (destinationPatientId: number) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [search, setSearch] = useState("");
  const [moving, setMoving] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const { data: patients, isLoading } = useListPatients(undefined, {
    query: { queryKey: getListPatientsQueryKey(), enabled: visible },
  });

  const filteredPatients = useMemo(() => {
    const list = (patients ?? []).filter((p) => p.id !== sourcePatientId);
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.patientCode ?? "").toLowerCase().includes(q),
    );
  }, [patients, sourcePatientId, search]);

  const handleClose = useCallback(() => {
    if (moving) return;
    setSearch("");
    setProgress(null);
    onClose();
  }, [moving, onClose]);

  const handleSelectPatient = useCallback(
    async (destPatient: Patient) => {
      if (moving || selectedIds.size === 0) return;
      setMoving(true);
      setProgress({ current: 0, total: selectedIds.size });
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        let done = 0;
        for (const imageId of selectedIds) {
          await customFetch(`/api/images/${imageId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patientId: destPatient.id }),
          });
          done++;
          setProgress({ current: done, total: selectedIds.size });
        }
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSearch("");
        setProgress(null);
        onMoved(destPatient.id);
      } catch (err) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          t("patient.moveToPatient.moveError"),
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        setMoving(false);
      }
    },
    [moving, selectedIds, onMoved, t],
  );

  const topInset = Platform.OS === "web" ? 67 : insets.top;

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
    subtitle: {
      fontSize: 13, fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
    },
    searchBox: {
      flexDirection: "row", alignItems: "center",
      marginHorizontal: 16, marginBottom: 8,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: colors.radius, backgroundColor: colors.card,
      paddingHorizontal: 12, height: 44, gap: 8,
    },
    searchInput: {
      flex: 1, fontSize: 15, fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    patientRow: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: colors.border,
      gap: 12,
    },
    patientAvatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.muted,
      alignItems: "center", justifyContent: "center",
    },
    patientName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    patientCode: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    emptyBox: {
      flex: 1, alignItems: "center", justifyContent: "center",
      paddingTop: 80, gap: 12,
    },
    emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    progressOverlay: {
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.4)",
      alignItems: "center", justifyContent: "center",
    },
    progressCard: {
      backgroundColor: colors.card,
      borderRadius: 16, padding: 28,
      alignItems: "center", gap: 16, minWidth: 200,
    },
    progressLabel: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    progressSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={s.modal}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{t("patient.moveToPatient.title")}</Text>
          <TouchableOpacity style={s.closeBtn} onPress={handleClose} disabled={moving}>
            <Ionicons name="close" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <Text style={s.subtitle}>
          {t("patient.moveToPatient.subtitle", { count: selectedIds.size })}
        </Text>

        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            style={s.searchInput}
            placeholder={t("patient.moveToPatient.searchPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
            editable={!moving}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <View style={s.emptyBox}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : filteredPatients.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="person-outline" size={48} color={colors.mutedForeground} />
            <Text style={s.emptyText}>{t("patient.moveToPatient.noPatients")}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredPatients}
            keyExtractor={(p) => String(p.id)}
            renderItem={({ item: p }) => (
              <TouchableOpacity
                style={s.patientRow}
                onPress={() => void handleSelectPatient(p)}
                disabled={moving}
                activeOpacity={0.7}
              >
                <View style={s.patientAvatar}>
                  <Ionicons name="person-outline" size={20} color={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.patientName} numberOfLines={1}>{p.name}</Text>
                  {p.patientCode ? (
                    <Text style={s.patientCode}>{p.patientCode}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          />
        )}

        {moving && (
          <View style={s.progressOverlay}>
            <View style={s.progressCard}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={s.progressLabel}>{t("patient.moveToPatient.moving")}</Text>
              {progress && (
                <Text style={s.progressSub}>
                  {t("patient.moveToPatient.progress", {
                    current: progress.current,
                    total: progress.total,
                  })}
                </Text>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Add from Unassigned Modal ────────────────────────────────────────────────

const UNASSIGNED_QUERY_PARAMS = { isUnassigned: true };

function AddFromUnassignedModal({
  patientId,
  visible,
  onClose,
  onAdded,
}: {
  patientId: number;
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { token: authToken } = useAuth();
  const baseUrl = getBaseUrl() ?? "";

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const { data: images, isLoading, isFetching, refetch } = useListImages(UNASSIGNED_QUERY_PARAMS);
  const imageList = images ?? [];

  const GAP = 4;
  const PADDING = 16;
  const COLS = 3;
  const itemSize = (SCREEN_WIDTH - PADDING * 2 - GAP * (COLS - 1)) / COLS;

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(imageList.map((img) => img.id)));
  }, [imageList]);

  const handleClose = useCallback(() => {
    if (assigning) return;
    setSelectedIds(new Set());
    setProgress(null);
    onClose();
  }, [assigning, onClose]);

  const handleAdd = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setAssigning(true);
    setProgress({ current: 0, total: selectedIds.size });
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      let done = 0;
      for (const imageId of selectedIds) {
        await customFetch(`/api/images/${imageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId }),
        });
        done++;
        setProgress({ current: done, total: selectedIds.size });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedIds(new Set());
      setProgress(null);
      onAdded();
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t("patient.addFromUnassigned.addError"), err instanceof Error ? err.message : String(err));
    } finally {
      setAssigning(false);
    }
  }, [selectedIds, patientId, onAdded, t]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const selectedCount = selectedIds.size;

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
    selectBar: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: colors.border,
      backgroundColor: colors.card, gap: 8,
    },
    selectBarCount: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    selectAllBtn: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border,
    },
    selectAllBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground },
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
    checkOverlay: {
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center",
    },
    check: {
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: colors.primary,
      alignItems: "center", justifyContent: "center",
    },
    checkEmpty: {
      width: 26, height: 26, borderRadius: 13,
      borderWidth: 2, borderColor: "#fff",
      backgroundColor: "rgba(0,0,0,0.2)",
    },
    emptyBox: {
      flex: 1, alignItems: "center", justifyContent: "center",
      paddingTop: 80, gap: 12,
    },
    emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 32 },
    footer: {
      padding: 16,
      paddingBottom: Platform.OS === "web" ? 16 : insets.bottom + 16,
      borderTopWidth: 1, borderTopColor: colors.border,
      backgroundColor: colors.background, gap: 10,
    },
    progressText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },
    addBtn: {
      height: 52, borderRadius: colors.radius,
      backgroundColor: colors.primary, alignItems: "center",
      justifyContent: "center", flexDirection: "row", gap: 8,
    },
    addBtnDisabled: { opacity: 0.45 },
    addBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    cancelBtn: {
      height: 44, borderRadius: colors.radius, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.card,
      alignItems: "center", justifyContent: "center",
    },
    cancelBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground },
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={s.modal}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{t("patient.addFromUnassigned.title")}</Text>
          <TouchableOpacity style={s.closeBtn} onPress={handleClose} disabled={assigning}>
            <Ionicons name="close" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Selection toolbar */}
        <View style={s.selectBar}>
          <Text style={s.selectBarCount}>
            {t("patient.addFromUnassigned.selectedCount", { count: selectedCount })}
          </Text>
          {imageList.length > 0 && (
            <TouchableOpacity style={s.selectAllBtn} onPress={selectAll} disabled={assigning}>
              <Text style={s.selectAllBtnText}>{t("patient.addFromUnassigned.selectAll")}</Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <View style={s.emptyBox}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : imageList.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="images-outline" size={52} color={colors.mutedForeground} />
            <Text style={s.emptyText}>{t("patient.addFromUnassigned.empty")}</Text>
            <Text style={s.emptySubtext}>{t("patient.addFromUnassigned.emptyHint")}</Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            refreshControl={
              <RefreshControl
                refreshing={isFetching && !isLoading}
                onRefresh={() => refetch()}
                tintColor={colors.primary}
              />
            }
          >
            <View style={s.grid}>
              {imageList.map((img) => {
                const imageUrl = authToken
                  ? `${baseUrl}/api/images/${img.id}/file?token=${encodeURIComponent(authToken)}`
                  : `${baseUrl}/api/images/${img.id}/file`;
                const isSelected = selectedIds.has(img.id);
                return (
                  <TouchableOpacity
                    key={img.id}
                    style={[s.thumb, isSelected && { borderWidth: 3, borderColor: colors.primary }]}
                    onPress={() => toggleSelect(img.id)}
                    activeOpacity={0.8}
                    disabled={assigning}
                  >
                    <Image source={{ uri: imageUrl }} style={s.thumbImg} contentFit="cover" transition={200} />
                    <View style={s.checkOverlay}>
                      {isSelected
                        ? <View style={s.check}><Ionicons name="checkmark" size={16} color="#fff" /></View>
                        : <View style={s.checkEmpty} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        <View style={s.footer}>
          {progress && (
            <Text style={s.progressText}>
              {t("unassigned.batchProgress", { current: progress.current, total: progress.total })}
            </Text>
          )}
          <TouchableOpacity
            style={[s.addBtn, (selectedCount === 0 || assigning) && s.addBtnDisabled]}
            onPress={() => void handleAdd()}
            disabled={selectedCount === 0 || assigning}
            activeOpacity={0.8}
            testID="add-from-unassigned-confirm"
          >
            {assigning ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Ionicons name="person-add-outline" size={18} color={colors.primaryForeground} />
                <Text style={s.addBtnText}>
                  {selectedCount > 0
                    ? t("patient.addFromUnassigned.addBtn", { count: selectedCount })
                    : t("patient.addFromUnassigned.addBtnEmpty")}
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

export default function PatientDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const patientId = Number(id);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [columns, setColumns] = useState<GridColumns>(2);
  const [lightboxImage, setLightboxImage] = useState<PatientImage | null>(null);
  const [isDeletingPatient, setIsDeletingPatient] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  const [addFromUnassignedVisible, setAddFromUnassignedVisible] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(new Set());
  const [moveToPatientVisible, setMoveToPatientVisible] = useState(false);

  const baseUrl = getBaseUrl() ?? "";
  const { token: authToken } = useAuth();

  const { data: patient, isLoading: patientLoading, isError: patientError, error: patientErrorObj } = useGetPatient(patientId);
  const isAccessDenied =
    patientError &&
    typeof patientErrorObj === "object" &&
    patientErrorObj !== null &&
    "status" in patientErrorObj &&
    (patientErrorObj as { status?: number }).status === 403;
  const {
    data: images,
    isLoading: imagesLoading,
    refetch,
    isFetching,
  } = useListPatientImages(patientId);

  const deletePatient = useDeletePatient({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        router.back();
      },
      onError: (e) => {
        if (e instanceof ApiError && e.status === 409) {
          const conflict = (e.data as { presentations?: DeleteConflict })?.presentations ?? [];
          Alert.alert(
            t("patient.delete.usedTitle"),
            conflictMessage(
              t("patient.delete.usedMsg"),
              conflict,
            ),
            [
              { text: t("patient.delete.cancel"), style: "cancel" },
              {
                text: t("patient.delete.deleteAnyway"),
                style: "destructive",
                onPress: () => forceDeletePatient(),
              },
            ],
          );
          return;
        }
        Alert.alert("Error", e instanceof Error ? e.message : t("patient.delete.error"));
      },
    },
  });

  const forceDeletePatient = useCallback(async () => {
    setIsDeletingPatient(true);
    try {
      await customFetch(`/api/patients/${patientId}?force=true`, { method: "DELETE" });
      void queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
      router.back();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : t("patient.delete.error"));
    } finally {
      setIsDeletingPatient(false);
    }
  }, [patientId, queryClient, t]);

  const handleDeletePatient = useCallback(async () => {
    if (!patient) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t("patient.delete.confirmTitle"),
      t("patient.delete.confirmMsg", { name: patient.name }),
      [
        { text: t("patient.delete.cancel"), style: "cancel" },
        {
          text: t("patient.delete.confirm"),
          style: "destructive",
          onPress: () => deletePatient.mutate({ id: patientId }),
        },
      ],
    );
  }, [patient, patientId, deletePatient, t]);

  const deleteImage = useDeleteImage({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(patientId) });
        setLightboxImage(null);
      },
      onError: (e) => {
        if (e instanceof ApiError && e.status === 409) {
          const conflict = (e.data as { presentations?: DeleteConflict })?.presentations ?? [];
          Alert.alert(
            t("patient.deleteImage.usedTitle"),
            conflictMessage(
              t("patient.deleteImage.usedMsg"),
              conflict,
            ),
            [
              { text: t("patient.deleteImage.cancel"), style: "cancel" },
              {
                text: t("patient.deleteImage.deleteAnyway"),
                style: "destructive",
                onPress: () => forceDeleteImage(),
              },
            ],
          );
          return;
        }
        Alert.alert("Error", e instanceof Error ? e.message : t("patient.deleteImage.error"));
      },
    },
  });

  const forceDeleteImage = useCallback(async () => {
    if (!lightboxImage) return;
    setIsDeletingImage(true);
    try {
      await customFetch(`/api/images/${lightboxImage.id}?force=true`, { method: "DELETE" });
      void queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(patientId) });
      setLightboxImage(null);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : t("patient.deleteImage.error"));
    } finally {
      setIsDeletingImage(false);
    }
  }, [lightboxImage, patientId, queryClient, t]);

  const handleDeleteImage = useCallback(async () => {
    if (!lightboxImage) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t("patient.deleteImage.confirmTitle"),
      t("patient.deleteImage.confirmMsg"),
      [
        { text: t("patient.deleteImage.cancel"), style: "cancel" },
        {
          text: t("patient.deleteImage.confirm"),
          style: "destructive",
          onPress: () => deleteImage.mutate({ id: lightboxImage.id }),
        },
      ],
    );
  }, [lightboxImage, deleteImage, t]);

  const handleImagePress = useCallback(async (image: PatientImage) => {
    if (selectMode) {
      setSelectedImageIds((prev) => {
        const next = new Set(prev);
        if (next.has(image.id)) next.delete(image.id); else next.add(image.id);
        return next;
      });
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLightboxImage(image);
  }, [selectMode]);

  const handleImageLongPress = useCallback(async (image: PatientImage) => {
    if (selectMode) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelectedImageIds(new Set([image.id]));
  }, [selectMode]);

  const handleCancelSelect = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectMode(false);
    setSelectedImageIds(new Set());
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedImageIds(new Set((images ?? []).map((img) => img.id)));
  }, [images]);

  const handleMoveToPatient = useCallback(async () => {
    if (selectedImageIds.size === 0) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMoveToPatientVisible(true);
  }, [selectedImageIds]);

  const handleMoveDone = useCallback((destinationPatientId: number) => {
    setMoveToPatientVisible(false);
    setSelectMode(false);
    setSelectedImageIds(new Set());
    void queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(patientId) });
    void queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(destinationPatientId) });
    void queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
  }, [queryClient, patientId]);

  const cycleColumns = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setColumns((c) => (c === 1 ? 2 : c === 2 ? 4 : 1));
  }, []);

  const handleAddFromUnassigned = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddFromUnassignedVisible(true);
  }, []);

  const handleAddFromUnassignedDone = useCallback(() => {
    setAddFromUnassignedVisible(false);
    void queryClient.invalidateQueries({ queryKey: getListPatientImagesQueryKey(patientId) });
    void queryClient.invalidateQueries({ queryKey: getListImagesQueryKey(UNASSIGNED_QUERY_PARAMS) });
    void queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
  }, [queryClient, patientId]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: topInset + 4,
      paddingHorizontal: 12,
      paddingBottom: 12,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 8,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 20,
    },
    headerInfo: { flex: 1 },
    headerName: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    headerCode: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    gridToggle: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: colors.muted,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: bottomInset + 20,
      flexDirection: "row",
      flexWrap: "wrap",
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
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
    countBadge: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.muted,
    },
    retryBtn: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      marginTop: 4,
    },
    countText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    lightbox: {
      flex: 1,
      backgroundColor: "#000",
    },
    lightboxHeader: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      paddingTop: topInset + 8,
      paddingHorizontal: 16,
      paddingBottom: 12,
      zIndex: 10,
      backgroundColor: "rgba(0,0,0,0.6)",
      gap: 12,
    },
    lightboxCloseBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    lightboxTitle: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: "#fff",
    },
    lightboxImage: {
      flex: 1,
    },
    lightboxFooter: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingBottom: bottomInset + 12,
      paddingHorizontal: 20,
      paddingTop: 16,
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    lightboxNotes: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: "rgba(255,255,255,0.85)",
    },
    lightboxDate: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: "rgba(255,255,255,0.5)",
      marginTop: 4,
    },
    selectBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
      gap: 8,
    },
    selectBarCount: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    selectBarBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
    },
    selectBarBtnText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    moveBar: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      paddingBottom: bottomInset + 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    moveBtn: {
      flex: 1,
      height: 50,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    moveBtnDisabled: { opacity: 0.45 },
    moveBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    cancelSelectBtn: {
      height: 50,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    cancelSelectBtnText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
  });

  const imageList = images ?? [];
  const colIcon: Record<GridColumns, string> = { 1: "grid-outline", 2: "apps-outline", 4: "grid" };

  if (patientLoading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (isAccessDenied) {
    return (
      <View style={[s.container, s.centered]}>
        <Ionicons name="lock-closed-outline" size={40} color={colors.mutedForeground} />
        <Text style={s.emptyText}>{t("patient.accessDenied")}</Text>
        <Text style={s.emptySubtext}>{t("patient.accessDeniedMsg")}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => router.back()}>
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_500Medium" }}>{t("patient.goBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={selectMode ? () => void handleCancelSelect() : () => router.back()}>
          <Ionicons name={selectMode ? "close" : "arrow-back"} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          {selectMode ? (
            <Text style={s.headerName} numberOfLines={1}>
              {t("patient.moveToPatient.selectedCount", { count: selectedImageIds.size })}
            </Text>
          ) : (
            <>
              <Text style={s.headerName} numberOfLines={1}>
                {patient?.name ?? t("patient.fallbackName")}
              </Text>
              <Text style={s.headerCode}>{patient?.patientCode}</Text>
            </>
          )}
        </View>
        {!selectMode && (
          <>
            <TouchableOpacity
              style={s.gridToggle}
              onPress={() => void handleAddFromUnassigned()}
              testID="add-from-unassigned-button"
            >
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.gridToggle}
              onPress={handleDeletePatient}
              disabled={isDeletingPatient || patientLoading}
              testID="delete-patient-button"
            >
              {isDeletingPatient ? (
                <ActivityIndicator size="small" color={colors.destructive} />
              ) : (
                <Ionicons name="trash-outline" size={20} color={colors.destructive} />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.gridToggle} onPress={cycleColumns}>
              <Ionicons
                name={colIcon[columns] as "grid-outline" | "apps-outline" | "grid"}
                size={20}
                color={colors.foreground}
              />
            </TouchableOpacity>
          </>
        )}
        {selectMode && imageList.length > 0 && (
          <TouchableOpacity style={s.gridToggle} onPress={handleSelectAll}>
            <Ionicons name="checkmark-done-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {!selectMode && imageList.length > 0 && (
        <View style={s.countBadge}>
          <Text style={s.countText}>
            {t("patient.imageCount", { count: imageList.length })}
          </Text>
        </View>
      )}

      {selectMode && (
        <View style={s.countBadge}>
          <Text style={s.countText}>
            {t("patient.moveToPatient.longPressHint")}
          </Text>
        </View>
      )}

      {imagesLoading ? (
        <View style={s.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : imageList.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="images-outline" size={52} color={colors.mutedForeground} />
          <Text style={s.emptyText}>{t("patient.noImages")}</Text>
          <Text style={s.emptySubtext}>{t("patient.captureHint")}</Text>
        </View>
      ) : (
        <FlatList
          data={imageList}
          keyExtractor={(item) => String(item.id)}
          numColumns={columns}
          key={columns}
          contentContainerStyle={s.listContent}
          columnWrapperStyle={columns > 1 ? { gap: 4 } : undefined}
          renderItem={({ item }) => (
            <ImageGridItem
              image={item}
              columns={columns}
              baseUrl={baseUrl}
              authToken={authToken}
              colors={colors}
              onPress={handleImagePress}
              onLongPress={handleImageLongPress}
              selectMode={selectMode}
              isSelected={selectedImageIds.has(item.id)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !imagesLoading}
              onRefresh={() => refetch()}
              tintColor={colors.primary}
            />
          }
          scrollEnabled={!!imageList.length}
        />
      )}

      {selectMode && (
        <View style={s.moveBar}>
          <TouchableOpacity
            style={[s.moveBtn, selectedImageIds.size === 0 && s.moveBtnDisabled]}
            onPress={() => void handleMoveToPatient()}
            disabled={selectedImageIds.size === 0}
            activeOpacity={0.8}
            testID="move-to-patient-button"
          >
            <Ionicons name="swap-horizontal-outline" size={18} color={colors.primaryForeground} />
            <Text style={s.moveBtnText}>
              {selectedImageIds.size > 0
                ? t("patient.moveToPatient.moveBtn", { count: selectedImageIds.size })
                : t("patient.moveToPatient.moveBtnEmpty")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.cancelSelectBtn}
            onPress={() => void handleCancelSelect()}
            activeOpacity={0.8}
          >
            <Text style={s.cancelSelectBtnText}>{t("patient.moveToPatient.cancel")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <AddFromUnassignedModal
        patientId={patientId}
        visible={addFromUnassignedVisible}
        onClose={() => setAddFromUnassignedVisible(false)}
        onAdded={handleAddFromUnassignedDone}
      />

      <MoveToPatientModal
        sourcePatientId={patientId}
        selectedIds={selectedImageIds}
        visible={moveToPatientVisible}
        onClose={() => setMoveToPatientVisible(false)}
        onMoved={handleMoveDone}
      />

      {lightboxImage && (
        <Modal
          visible={!!lightboxImage}
          animationType="fade"
          onRequestClose={() => setLightboxImage(null)}
          statusBarTranslucent
        >
          <View style={s.lightbox}>
            <View style={s.lightboxHeader}>
              <TouchableOpacity
                style={s.lightboxCloseBtn}
                onPress={() => setLightboxImage(null)}
              >
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
              <Text style={s.lightboxTitle} numberOfLines={1}>
                {lightboxImage.fileName ?? t("patient.lightboxTitle", { id: lightboxImage.id })}
              </Text>
              <TouchableOpacity
                style={s.lightboxCloseBtn}
                onPress={handleDeleteImage}
                disabled={isDeletingImage}
                testID="delete-image-button"
              >
                {isDeletingImage ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="trash-outline" size={22} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            <Image
              source={{
                uri: authToken
                  ? `${baseUrl}/api/images/${lightboxImage.id}/file?token=${encodeURIComponent(authToken)}`
                  : `${baseUrl}/api/images/${lightboxImage.id}/file`,
              }}
              style={s.lightboxImage}
              contentFit="contain"
              transition={150}
            />

            {(lightboxImage.notes || lightboxImage.capturedAt) && (
              <View style={s.lightboxFooter}>
                {lightboxImage.notes ? (
                  <Text style={s.lightboxNotes}>{lightboxImage.notes}</Text>
                ) : null}
                {lightboxImage.capturedAt ? (
                  <Text style={s.lightboxDate}>
                    {new Date(lightboxImage.capturedAt).toLocaleString()}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}
