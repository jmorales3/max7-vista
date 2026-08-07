import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
  TextInput,
  Platform,
  Alert,
  Linking,
  ScrollView,
} from "react-native";
import DraggablePhotoList from "@/components/DraggablePhotoList";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from "expo-camera";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch, useListPatients } from "@workspace/api-client-react";
import type { Patient } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DRAFT_STORAGE_KEY = "@camera_upload_draft_v1";

type Phase = "capture" | "review";

type QueueItem = {
  uri: string;
  notes: string;
  /** True once the item has been successfully uploaded in a previous attempt. */
  uploaded?: boolean;
};

type DraftData = {
  queue: QueueItem[];
  selectedPatient: Patient | null;
  phase: Phase;
};

export default function CameraScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // --- queue state ---
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [phase, setPhase] = useState<Phase>("capture");
  const [isDragging, setIsDragging] = useState(false);

  // --- upload state ---
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadDone, setUploadDone] = useState(false);

  // --- draft persistence ---
  // true once the initial AsyncStorage load has been applied; prevents the
  // save-effect from overwriting the draft before the load resolves.
  const draftLoaded = useRef(false);
  // Set to true while upload is in-flight so we don't save a partial state.
  const suppressDraftSave = useRef(false);

  // --- patient / notes ---
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showPatientPicker, setShowPatientPicker] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [imageNotes, setImageNotes] = useState("");

  // --- camera viewfinder ---
  const [viewfinderOpen, setViewfinderOpen] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const { data: patients } = useListPatients(
    patientSearch ? { search: patientSearch } : {},
  );

  // ─── helpers ────────────────────────────────────────────────────────────────

  async function uploadOne(uri: string, patientId?: number, notes?: string): Promise<void> {
    // JSON + base64 — Replit deployment proxy silently drops multipart bodies.
    const filename = uri.split("/").pop() ?? "image.jpg";
    const match = /\.(\w+)$/.exec(filename);
    const mimeType = match ? `image/${match[1].toLowerCase().replace("jpg", "jpeg")}` : "image/jpeg";
    const response = await fetch(uri);
    const blob = await response.blob();
    const fileBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    await customFetch("/api/images/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileBase64,
        fileName: filename,
        mimeType,
        patientId: patientId ?? null,
        notes: notes?.trim() || undefined,
        capturedAt: new Date().toISOString(),
      }),
    });
  }

  const reset = useCallback(() => {
    suppressDraftSave.current = false;
    setQueue([]);
    setPhase("capture");
    setIsUploading(false);
    setUploadProgress(null);
    setErrorMsg(null);
    setUploadDone(false);
    setSelectedPatient(null);
    setImageNotes("");
    // Clear persisted draft so a fresh session starts blank.
    void AsyncStorage.removeItem(DRAFT_STORAGE_KEY);
  }, []);

  // ─── draft: load on mount ────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
        if (!raw || cancelled) {
          draftLoaded.current = true;
          return;
        }
        const draft: DraftData = JSON.parse(raw);
        if (!draft.queue || draft.queue.length === 0) {
          draftLoaded.current = true;
          return;
        }
        // Offer to resume the draft via Alert.
        Alert.alert(
          t("camera.draft.resumeTitle"),
          t("camera.draft.resumeMsg", { count: draft.queue.length }),
          [
            {
              text: t("camera.draft.discard"),
              style: "destructive",
              onPress: () => {
                void AsyncStorage.removeItem(DRAFT_STORAGE_KEY);
                draftLoaded.current = true;
              },
            },
            {
              text: t("camera.draft.resume"),
              onPress: () => {
                if (draft.queue.length > 0) setQueue(draft.queue);
                if (draft.selectedPatient) setSelectedPatient(draft.selectedPatient);
                if (draft.phase) setPhase(draft.phase);
                draftLoaded.current = true;
              },
            },
          ],
          { cancelable: false },
        );
      } catch {
        draftLoaded.current = true;
      }
    }
    void loadDraft();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── draft: save on every meaningful change ───────────────────────────────

  useEffect(() => {
    if (!draftLoaded.current) return;
    if (suppressDraftSave.current) return;
    if (queue.length === 0) {
      // Queue cleared — remove stale draft.
      void AsyncStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }
    const draft: DraftData = { queue, selectedPatient, phase };
    void AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [queue, selectedPatient, phase]);

  // ─── camera ─────────────────────────────────────────────────────────────────

  const openCamera = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert(t("camera.permission.webTitle"), t("camera.permission.webMsg"));
      return;
    }
    let permission = cameraPermission;
    if (!permission || !permission.granted) {
      permission = await requestCameraPermission();
    }
    if (!permission.granted) {
      if (!permission.canAskAgain) {
        Alert.alert(
          t("camera.permission.deniedTitle"),
          t("camera.permission.deniedMsg"),
          [
            { text: t("camera.permission.cancel"), style: "cancel" },
            {
              text: t("camera.permission.openSettings"),
              onPress: () => { if (Platform.OS !== "web") void Linking.openSettings(); },
            },
          ],
        );
      } else {
        Alert.alert(t("camera.permission.requireTitle"), t("camera.permission.requireMsg"));
      }
      return;
    }
    setViewfinderOpen(true);
  }, [cameraPermission, requestCameraPermission, t]);

  const takePicture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (photo?.uri) {
        setQueue((prev) => [...prev, { uri: photo.uri, notes: imageNotes }]);
        setErrorMsg(null);
      }
    } catch (err) {
      Alert.alert(t("camera.captureError"), err instanceof Error ? err.message : t("camera.captureErrorMsg"));
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, imageNotes, t]);

  const finishViewfinder = useCallback(() => {
    setViewfinderOpen(false);
  }, []);

  const toggleFacing = useCallback(() => setFacing((p) => (p === "back" ? "front" : "back")), []);
  const cycleFlash = useCallback(() => setFlash((p) => (p === "off" ? "on" : p === "on" ? "auto" : "off")), []);

  // ─── gallery ────────────────────────────────────────────────────────────────

  const openGallery = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("camera.permission.libraryTitle"), t("camera.permission.libraryMsg"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.9,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      setQueue((prev) => [
        ...prev,
        ...result.assets.map((a) => ({ uri: a.uri, notes: imageNotes })),
      ]);
      setErrorMsg(null);
    }
  }, [imageNotes, t]);

  // ─── per-image notes ─────────────────────────────────────────────────────────

  const updateItemNotes = useCallback((idx: number, value: string) => {
    setQueue((prev) => prev.map((item, i) => i === idx ? { ...item, notes: value } : item));
  }, []);

  const applyNotesToAll = useCallback(() => {
    if (!imageNotes.trim()) return;
    setQueue((prev) => prev.map((item) => ({ ...item, notes: imageNotes })));
  }, [imageNotes]);

  // ─── reorder ─────────────────────────────────────────────────────────────────

  const moveItem = useCallback((from: number, to: number) => {
    setQueue((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // ─── upload ──────────────────────────────────────────────────────────────────

  const handleUpload = useCallback(async () => {
    if (queue.length === 0) return;
    // Suppress draft saves while uploading — we don't want to persist a
    // partially-uploaded queue that would confuse the resume prompt.
    suppressDraftSave.current = true;
    setIsUploading(true);
    setErrorMsg(null);

    // On retry, only count items not yet successfully uploaded.
    const pendingCount = queue.filter((item) => !item.uploaded).length;
    setUploadProgress({ current: 0, total: pendingCount });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      let doneCount = 0;
      for (let i = 0; i < queue.length; i++) {
        // Skip items that were successfully uploaded in a prior attempt.
        if (queue[i].uploaded) continue;
        doneCount++;
        setUploadProgress({ current: doneCount, total: pendingCount });
        await uploadOne(queue[i].uri, selectedPatient?.id, queue[i].notes);
        // Mark this item uploaded immediately so the success overlay appears
        // and it will be skipped if the clinician needs to retry after an error.
        setQueue((prev) =>
          prev.map((item, j) => (j === i ? { ...item, uploaded: true } : item)),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["listPatients"] });
      void queryClient.invalidateQueries({ queryKey: ["listPatientImages"] });
      void queryClient.invalidateQueries({ queryKey: ["listImages"] });
      // Draft successfully uploaded — remove it before the success animation.
      await AsyncStorage.removeItem(DRAFT_STORAGE_KEY);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUploadDone(true);
      setTimeout(() => reset(), 2000);
    } catch (err) {
      // Re-enable saving so the current queue (with uploaded flags preserved)
      // can be persisted, letting the clinician retry only the remaining items.
      suppressDraftSave.current = false;
      setErrorMsg(err instanceof Error ? err.message : t("camera.uploadError"));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, [queue, selectedPatient, queryClient, reset, t]);

  // ─── styles ──────────────────────────────────────────────────────────────────

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

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
    headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: colors.foreground },
    body: { padding: 20, gap: 16 },

    // ── capture phase ──
    // paddingBottom must be >= tallest footer height (both rows ~150px)
    captureScrollContent: { padding: 20, paddingBottom: 160, gap: 16 },
    captureFooter: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 16,
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    emptyCard: {
      aspectRatio: 4 / 3,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    emptyCardText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      paddingHorizontal: 24,
    },
    captureRow: { flexDirection: "row", gap: 12 },
    captureBtn: {
      flex: 1, height: 52, borderRadius: colors.radius,
      backgroundColor: colors.primary, alignItems: "center",
      justifyContent: "center", flexDirection: "row", gap: 8,
    },
    galleryBtn: {
      flex: 1, height: 52, borderRadius: colors.radius,
      borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.card, alignItems: "center",
      justifyContent: "center", flexDirection: "row", gap: 8,
    },
    captureBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    galleryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },

    // ── queue strip ──
    queueHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    queueLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6 },
    queueCount: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary },
    queueStrip: { flexDirection: "row", gap: 8 },
    queueThumb: {
      width: 76, height: 76, borderRadius: 10, overflow: "hidden",
      backgroundColor: colors.muted,
    },
    queueThumbImg: { width: "100%", height: "100%" },
    queueRemoveBtn: {
      position: "absolute", top: 3, right: 3,
      width: 20, height: 20, borderRadius: 10,
      backgroundColor: "rgba(0,0,0,0.65)",
      alignItems: "center", justifyContent: "center",
    },
    addMoreRow: { flexDirection: "row", gap: 10 },
    addMoreBtn: {
      flex: 1, height: 44, borderRadius: colors.radius,
      borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.card, alignItems: "center",
      justifyContent: "center", flexDirection: "row", gap: 6,
    },
    addMoreBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground },
    reviewBtn: {
      flex: 1, height: 44, borderRadius: colors.radius,
      backgroundColor: colors.primary, alignItems: "center",
      justifyContent: "center", flexDirection: "row", gap: 6,
    },
    reviewBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },

    // ── review phase ──
    reviewHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 2 },
    backBtn: {
      width: 36, height: 36, borderRadius: 18,
      borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.card, alignItems: "center", justifyContent: "center",
    },
    reviewTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground },

    // ── apply-to-all row ──
    applyAllRow: {
      flexDirection: "row", gap: 8, alignItems: "flex-start",
    },
    applyAllInput: {
      flex: 1,
      backgroundColor: colors.card, borderWidth: 1,
      borderColor: colors.border, borderRadius: colors.radius,
      paddingHorizontal: 14, paddingVertical: 10,
      fontSize: 14, fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    applyAllBtn: {
      height: 42, borderRadius: colors.radius,
      borderWidth: 1, borderColor: colors.primary,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      alignItems: "center", justifyContent: "center",
    },
    applyAllBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary },

    // ── per-photo card ──
    photoCard: {
      flexDirection: "row", gap: 12,
      backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: colors.radius,
      padding: 10,
    },
    photoCardThumb: {
      width: 72, height: 72, borderRadius: 8,
      overflow: "hidden", backgroundColor: colors.muted,
      flexShrink: 0,
    },
    photoCardThumbImg: { width: "100%", height: "100%" },
    photoCardThumbRemoveBtn: {
      position: "absolute", top: 3, right: 3,
      width: 20, height: 20, borderRadius: 10,
      backgroundColor: "rgba(0,0,0,0.65)",
      alignItems: "center", justifyContent: "center",
    },
    photoCardRight: { flex: 1, gap: 4 },
    photoCardLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    photoCardInput: {
      backgroundColor: colors.background,
      borderWidth: 1, borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 8,
      fontSize: 14, fontFamily: "Inter_400Regular",
      color: colors.foreground,
      minHeight: 52, textAlignVertical: "top",
    },
    photoCardSuccessOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(31,137,147,0.18)",
      alignItems: "center", justifyContent: "center",
      borderRadius: 8,
    },

    sectionLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6 },
    patientBtn: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.card, borderWidth: 1,
      borderColor: colors.border, borderRadius: colors.radius,
      paddingHorizontal: 14, paddingVertical: 12, gap: 10,
    },
    patientBtnText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
    actions: { gap: 10, paddingBottom: bottomInset + 90 },
    uploadBtn: {
      height: 54, borderRadius: colors.radius,
      backgroundColor: colors.primary, alignItems: "center",
      justifyContent: "center", flexDirection: "row", gap: 8,
    },
    uploadBtnDisabled: { opacity: 0.5 },
    uploadBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground },
    progressText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },
    errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.destructive, textAlign: "center" },

    // ── viewfinder ──
    viewfinderContainer: { flex: 1, backgroundColor: "#000" },
    viewfinderCamera: { flex: 1 },
    viewfinderTopBar: {
      position: "absolute", top: topInset + 12, left: 0, right: 0,
      flexDirection: "row", justifyContent: "space-between",
      paddingHorizontal: 20, alignItems: "center",
    },
    viewfinderIconBtn: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center", justifyContent: "center",
    },
    viewfinderQueuePill: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.55)", flexDirection: "row", gap: 6, alignItems: "center",
    },
    viewfinderQueueText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
    viewfinderBottomBar: {
      position: "absolute", bottom: bottomInset + 24, left: 0, right: 0,
      flexDirection: "row", alignItems: "center",
      justifyContent: "space-around", paddingHorizontal: 24,
    },
    shutterOuter: {
      width: 78, height: 78, borderRadius: 39,
      borderWidth: 4, borderColor: "#fff",
      alignItems: "center", justifyContent: "center",
    },
    shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#fff" },
    viewfinderSideBtn: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center", justifyContent: "center",
    },
    viewfinderDoneBtn: {
      paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22,
      backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
    },
    viewfinderDoneText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
    permissionOverlay: {
      flex: 1, alignItems: "center", justifyContent: "center",
      gap: 16, backgroundColor: "#000", padding: 24,
    },
    permissionText: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#fff", textAlign: "center" },

    // ── patient modal ──
    modal: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: "row", alignItems: "center",
      paddingTop: topInset + 12, paddingHorizontal: 16,
      paddingBottom: 12, borderBottomWidth: 1,
      borderBottomColor: colors.border, gap: 12,
    },
    modalTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    modalSearch: {
      margin: 16, flexDirection: "row", alignItems: "center",
      backgroundColor: colors.muted, borderRadius: colors.radius,
      paddingHorizontal: 12, height: 42, gap: 8,
    },
    modalSearchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground },
    modalItem: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12,
    },
    modalItemAvatar: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: colors.accent, alignItems: "center", justifyContent: "center",
    },
    modalItemInitials: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.primary },
    modalItemName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    modalItemCode: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    noPatientItem: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12,
    },
    noPatientText: { fontSize: 15, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
  });

  // ─── render: review phase ─────────────────────────────────────────────────

  if (phase === "review") {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{t("camera.title")}</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.body, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled" scrollEnabled={!isDragging}>

          {/* back + title */}
          <View style={s.reviewHeader}>
            <TouchableOpacity style={s.backBtn} onPress={() => setPhase("capture")} disabled={isUploading}>
              <Ionicons name="arrow-back" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={s.reviewTitle}>
              {uploadDone ? t("camera.batch.uploadComplete") : t("camera.batch.reviewTitle", { count: queue.length })}
            </Text>
          </View>

          {/* patient */}
          <View style={{ gap: 8 }}>
            <Text style={s.sectionLabel}>{t("camera.assignToPatient")}</Text>
            <TouchableOpacity style={s.patientBtn} onPress={() => setShowPatientPicker(true)} disabled={isUploading}>
              <Ionicons name="person-outline" size={20} color={colors.mutedForeground} />
              <Text style={[s.patientBtnText, { color: selectedPatient ? colors.foreground : colors.mutedForeground }]}>
                {selectedPatient ? selectedPatient.name : t("camera.selectPatient")}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* apply-to-all notes */}
          <View style={{ gap: 8 }}>
            <Text style={s.sectionLabel}>{t("camera.batch.applyToAllLabel")}</Text>
            <View style={s.applyAllRow}>
              <TextInput
                style={s.applyAllInput}
                placeholder={t("camera.batch.applyToAllPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={imageNotes}
                onChangeText={setImageNotes}
                editable={!isUploading}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[s.applyAllBtn, (!imageNotes.trim() || isUploading) && { opacity: 0.4 }]}
                onPress={applyNotesToAll}
                disabled={!imageNotes.trim() || isUploading}
                activeOpacity={0.7}
              >
                <Text style={s.applyAllBtnText}>{t("camera.batch.applyToAll")}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* per-photo label cards – drag to reorder */}
          <View style={{ gap: 8 }}>
            <Text style={s.sectionLabel}>{t("camera.batch.perPhotoLabels", { count: queue.length })}</Text>
            <DraggablePhotoList
              items={queue}
              isUploading={isUploading}
              uploadDone={uploadDone}
              onReorder={moveItem}
              onRemove={(idx) => setQueue((q) => q.filter((_, i) => i !== idx))}
              onUpdateNotes={updateItemNotes}
              onDragStateChange={setIsDragging}
              cardStyles={{
                photoCard: s.photoCard,
                photoCardThumb: s.photoCardThumb,
                photoCardThumbImg: s.photoCardThumbImg,
                photoCardThumbRemoveBtn: s.photoCardThumbRemoveBtn,
                photoCardSuccessOverlay: s.photoCardSuccessOverlay,
                photoCardRight: s.photoCardRight,
                photoCardLabel: s.photoCardLabel,
                photoCardInput: s.photoCardInput,
              }}
              colors={colors}
              t={t}
            />
          </View>

          <View style={s.actions}>
            {errorMsg && <Text style={s.errorText}>{errorMsg}</Text>}
            {uploadProgress && !uploadDone && (
              <Text style={s.progressText}>
                {t("camera.batch.uploadingProgress", { current: uploadProgress.current, total: uploadProgress.total })}
              </Text>
            )}
            <TouchableOpacity
              style={[s.uploadBtn, (isUploading || uploadDone) && s.uploadBtnDisabled]}
              onPress={handleUpload}
              disabled={isUploading || uploadDone || queue.length === 0}
              activeOpacity={0.8}
            >
              {isUploading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={20} color={colors.primaryForeground} />
                  <Text style={s.uploadBtnText}>
                    {uploadDone
                      ? t("camera.batch.uploadComplete")
                      : t("camera.batch.uploadAll", { count: queue.length })}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* patient picker modal */}
        <Modal visible={showPatientPicker} animationType="slide" onRequestClose={() => setShowPatientPicker(false)}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t("camera.selectPatientTitle")}</Text>
              <TouchableOpacity onPress={() => setShowPatientPicker(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View style={s.modalSearch}>
              <Ionicons name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={s.modalSearchInput}
                value={patientSearch}
                onChangeText={setPatientSearch}
                placeholder={t("camera.searchPatients")}
                placeholderTextColor={colors.mutedForeground}
                autoCorrect={false}
              />
            </View>
            <FlatList
              data={patients ?? []}
              keyExtractor={(item) => String(item.id)}
              ListHeaderComponent={
                <TouchableOpacity style={s.noPatientItem} onPress={() => { setSelectedPatient(null); setShowPatientPicker(false); }}>
                  <Ionicons name="ban" size={20} color={colors.mutedForeground} />
                  <Text style={s.noPatientText}>{t("camera.noPatient")}</Text>
                </TouchableOpacity>
              }
              renderItem={({ item }) => {
                const initials = item.name.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase();
                return (
                  <TouchableOpacity style={s.modalItem} onPress={() => { setSelectedPatient(item); setShowPatientPicker(false); }}>
                    <View style={s.modalItemAvatar}><Text style={s.modalItemInitials}>{initials}</Text></View>
                    <View>
                      <Text style={s.modalItemName}>{item.name}</Text>
                      <Text style={s.modalItemCode}>{item.patientCode}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </Modal>
      </View>
    );
  }

  // ─── render: capture phase ────────────────────────────────────────────────

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t("camera.title")}</Text>
      </View>

      {/* scrollable area: empty state OR thumbnail strip only */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.captureScrollContent}>
        {queue.length === 0 ? (
          /* empty state */
          <View style={s.emptyCard}>
            <Ionicons name="camera-outline" size={56} color={colors.mutedForeground} />
            <Text style={s.emptyCardText}>{t("camera.noImage")}{"\n"}{t("camera.tapHint")}</Text>
          </View>
        ) : (
          /* queue thumbnail strip */
          <>
            <View style={s.queueHeader}>
              <Text style={s.queueLabel}>{t("camera.batch.queueLabel")}</Text>
              <Text style={s.queueCount}>{t("camera.batch.photoCount", { count: queue.length })}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.queueStrip}>
                {queue.map((item, idx) => (
                  <View key={item.uri + idx} style={s.queueThumb}>
                    <Image source={{ uri: item.uri }} style={s.queueThumbImg} contentFit="cover" />
                    <TouchableOpacity style={s.queueRemoveBtn} onPress={() => setQueue((q) => q.filter((_, i) => i !== idx))}>
                      <Ionicons name="close" size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          </>
        )}
      </ScrollView>

      {/* fixed footer — always visible above the tab bar */}
      <View style={s.captureFooter}>
        <View style={s.captureRow}>
          {Platform.OS !== "web" && (
            <TouchableOpacity style={s.captureBtn} onPress={openCamera} activeOpacity={0.8}>
              <Ionicons name="camera" size={20} color={colors.primaryForeground} />
              <Text style={s.captureBtnText}>{t("camera.cameraBtn")}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.galleryBtn} onPress={openGallery} activeOpacity={0.8}>
            <Ionicons name="images" size={20} color={colors.foreground} />
            <Text style={s.galleryBtnText}>{t("camera.galleryBtn")}</Text>
          </TouchableOpacity>
        </View>

        {/* clear all / review row — only when queue has items */}
        {queue.length > 0 && (
          <View style={s.addMoreRow}>
            <TouchableOpacity style={s.addMoreBtn} onPress={() => setQueue([])} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={16} color={colors.foreground} />
              <Text style={s.addMoreBtnText}>{t("camera.batch.clearAll")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.reviewBtn} onPress={() => setPhase("review")} activeOpacity={0.8}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
              <Text style={s.reviewBtnText}>{t("camera.batch.review", { count: queue.length })}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── in-app camera viewfinder ── */}
      <Modal visible={viewfinderOpen} animationType="slide" onRequestClose={finishViewfinder} testID="camera-viewfinder-modal">
        <View style={s.viewfinderContainer}>
          {cameraPermission?.granted ? (
            <>
              <CameraView ref={cameraRef} style={s.viewfinderCamera} facing={facing} flash={flash} testID="camera-viewfinder" />

              {/* top bar */}
              <View style={s.viewfinderTopBar}>
                <TouchableOpacity style={s.viewfinderIconBtn} onPress={finishViewfinder} testID="viewfinder-close">
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
                {queue.length > 0 && (
                  <View style={s.viewfinderQueuePill}>
                    <Ionicons name="images" size={14} color="#fff" />
                    <Text style={s.viewfinderQueueText}>{queue.length}</Text>
                  </View>
                )}
                <TouchableOpacity style={s.viewfinderIconBtn} onPress={cycleFlash} testID="viewfinder-flash">
                  <Ionicons name={flash === "off" ? "flash-off" : flash === "on" ? "flash" : "flash-outline"} size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* bottom bar */}
              <View style={s.viewfinderBottomBar}>
                {queue.length > 0 ? (
                  <TouchableOpacity style={s.viewfinderDoneBtn} onPress={finishViewfinder}>
                    <Text style={s.viewfinderDoneText}>{t("camera.batch.done", { count: queue.length })}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 52 }} />
                )}
                <TouchableOpacity style={s.shutterOuter} onPress={takePicture} disabled={isCapturing} activeOpacity={0.8} testID="viewfinder-shutter">
                  {isCapturing ? <ActivityIndicator color="#000" /> : <View style={s.shutterInner} />}
                </TouchableOpacity>
                <TouchableOpacity style={s.viewfinderSideBtn} onPress={toggleFacing} testID="viewfinder-flip">
                  <Ionicons name="camera-reverse" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={s.permissionOverlay}>
              <Ionicons name="camera-outline" size={48} color="#fff" />
              <Text style={s.permissionText}>{t("camera.permission.overlayMsg")}</Text>
              <TouchableOpacity style={s.captureBtn} onPress={finishViewfinder}>
                <Text style={s.captureBtnText}>{t("camera.permission.close")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}
