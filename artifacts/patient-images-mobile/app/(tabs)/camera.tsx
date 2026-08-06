import React, { useState, useCallback, useRef } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from "expo-camera";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListPatients } from "@workspace/api-client-react";
import type { Patient } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

type UploadState = "idle" | "selecting" | "uploading" | "done" | "error";

export default function CameraScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showPatientPicker, setShowPatientPicker] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imageNotes, setImageNotes] = useState("");

  const [viewfinderOpen, setViewfinderOpen] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const { data: patients } = useListPatients(
    patientSearch ? { search: patientSearch } : {},
  );

  const { mutate: uploadImage } = useMutation({
    mutationFn: async ({ uri, patientId, notes }: { uri: string; patientId?: number; notes?: string }) => {
      // Use JSON + base64 instead of FormData — the Replit deployment proxy silently
      // drops multipart/form-data bodies, so base64 is required for production uploads.
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

      return customFetch("/api/images/upload", {
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
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listPatients"] });
      void queryClient.invalidateQueries({ queryKey: ["listPatientImages"] });
      void queryClient.invalidateQueries({ queryKey: ["listImages"] });
    },
  });

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
              onPress: () => {
                if (Platform.OS !== "web") {
                  void Linking.openSettings();
                }
              },
            },
          ],
        );
      } else {
        Alert.alert(
          t("camera.permission.requireTitle"),
          t("camera.permission.requireMsg"),
        );
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
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });
      if (photo?.uri) {
        setCapturedUri(photo.uri);
        setUploadState("idle");
        setErrorMsg(null);
        setViewfinderOpen(false);
      }
    } catch (err) {
      Alert.alert(t("camera.captureError"), err instanceof Error ? err.message : t("camera.captureErrorMsg"));
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  const toggleFacing = useCallback(() => {
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  }, []);

  const cycleFlash = useCallback(() => {
    setFlash((prev) => (prev === "off" ? "on" : prev === "on" ? "auto" : "off"));
  }, []);

  const openGallery = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("camera.permission.libraryTitle"), t("camera.permission.libraryMsg"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      setCapturedUri(result.assets[0].uri);
      setUploadState("idle");
      setErrorMsg(null);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!capturedUri) return;
    setUploadState("uploading");
    setErrorMsg(null);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    uploadImage(
      { uri: capturedUri, patientId: selectedPatient?.id, notes: imageNotes },
      {
        onSuccess: () => {
          setUploadState("done");
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => {
            setCapturedUri(null);
            setSelectedPatient(null);
            setImageNotes("");
            setUploadState("idle");
          }, 1800);
        },
        onError: (err) => {
          setUploadState("error");
          setErrorMsg(err instanceof Error ? err.message : t("camera.uploadError"));
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    );
  }, [capturedUri, selectedPatient, uploadImage, imageNotes]);

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
    headerTitle: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    body: {
      flex: 1,
      padding: 20,
      gap: 20,
    },
    previewCard: {
      aspectRatio: 4 / 3,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: colors.muted,
    },
    previewImg: { width: "100%", height: "100%" },
    placeholder: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    placeholderText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
    },
    captureRow: {
      flexDirection: "row",
      gap: 12,
    },
    captureBtn: {
      flex: 1,
      height: 52,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    galleryBtn: {
      flex: 1,
      height: 52,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    captureBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    galleryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    patientSection: {
      gap: 8,
    },
    notesSection: {
      gap: 8,
    },
    notesInput: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      minHeight: 80,
      textAlignVertical: "top",
    },
    sectionLabel: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    patientBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    patientBtnText: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: selectedPatient ? colors.foreground : colors.mutedForeground,
    },
    actions: {
      gap: 10,
      paddingBottom: bottomInset + 90,
    },
    uploadBtn: {
      height: 54,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    uploadBtnDisabled: { opacity: 0.5 },
    uploadBtnText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    retakeBtn: {
      height: 44,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    retakeBtnText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    successOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(31,137,147,0.18)",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
    },
    errorText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      textAlign: "center",
    },
    modal: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: topInset + 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    modalTitle: {
      flex: 1,
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    modalSearch: {
      margin: 16,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
      paddingHorizontal: 12,
      height: 42,
      gap: 8,
    },
    modalSearchInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    modalItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    modalItemAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    modalItemInitials: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    modalItemName: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    modalItemCode: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    noPatientItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    noPatientText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    viewfinderContainer: {
      flex: 1,
      backgroundColor: "#000",
    },
    viewfinderCamera: {
      flex: 1,
    },
    viewfinderTopBar: {
      position: "absolute",
      top: topInset + 12,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 20,
    },
    viewfinderIconBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    viewfinderBottomBar: {
      position: "absolute",
      bottom: bottomInset + 24,
      left: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      paddingHorizontal: 32,
    },
    shutterOuter: {
      width: 78,
      height: 78,
      borderRadius: 39,
      borderWidth: 4,
      borderColor: "#fff",
      alignItems: "center",
      justifyContent: "center",
    },
    shutterInner: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: "#fff",
    },
    shutterInnerDisabled: {
      backgroundColor: "rgba(255,255,255,0.5)",
    },
    viewfinderSideBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    permissionOverlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      backgroundColor: "#000",
      padding: 24,
    },
    permissionText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: "#fff",
      textAlign: "center",
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t("camera.title")}</Text>
      </View>

      <View style={s.body}>
        <View style={s.previewCard}>
          {capturedUri ? (
            <>
              <Image source={{ uri: capturedUri }} style={s.previewImg} contentFit="cover" />
              {uploadState === "done" && (
                <View style={s.successOverlay}>
                  <Ionicons name="checkmark-circle" size={64} color={colors.primary} />
                </View>
              )}
            </>
          ) : (
            <View style={s.placeholder}>
              <Ionicons name="camera-outline" size={56} color={colors.mutedForeground} />
              <Text style={s.placeholderText}>{t("camera.noImage")}{"\n"}{t("camera.tapHint")}</Text>
            </View>
          )}
        </View>

        {!capturedUri ? (
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
        ) : (
          <>
            <View style={s.patientSection}>
              <Text style={s.sectionLabel}>{t("camera.assignToPatient")}</Text>
              <TouchableOpacity
                style={s.patientBtn}
                onPress={() => setShowPatientPicker(true)}
                disabled={uploadState === "uploading"}
              >
                <Ionicons name="person-outline" size={20} color={colors.mutedForeground} />
                <Text style={s.patientBtnText}>
                  {selectedPatient ? selectedPatient.name : t("camera.selectPatient")}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={s.notesSection}>
              <Text style={s.sectionLabel}>{t("camera.imageDescription")}</Text>
              <TextInput
                style={s.notesInput}
                placeholder={t("camera.notesPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={imageNotes}
                onChangeText={setImageNotes}
                multiline
                numberOfLines={3}
                editable={uploadState !== "uploading"}
              />
            </View>

            <View style={s.actions}>
              {errorMsg && <Text style={s.errorText}>{errorMsg}</Text>}
              <TouchableOpacity
                style={[s.uploadBtn, uploadState === "uploading" && s.uploadBtnDisabled]}
                onPress={handleUpload}
                disabled={uploadState === "uploading" || uploadState === "done"}
                activeOpacity={0.8}
                testID="upload-button"
              >
                {uploadState === "uploading" ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={20} color={colors.primaryForeground} />
                    <Text style={s.uploadBtnText}>{t("camera.upload")}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={s.retakeBtn}
                onPress={() => {
                  setCapturedUri(null);
                  setUploadState("idle");
                  setErrorMsg(null);
                }}
                disabled={uploadState === "uploading"}
              >
                <Text style={s.retakeBtnText}>{t("camera.discard")}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <Modal
        visible={viewfinderOpen}
        animationType="slide"
        onRequestClose={() => setViewfinderOpen(false)}
        testID="camera-viewfinder-modal"
      >
        <View style={s.viewfinderContainer}>
          {cameraPermission?.granted ? (
            <>
              <CameraView
                ref={cameraRef}
                style={s.viewfinderCamera}
                facing={facing}
                flash={flash}
                testID="camera-viewfinder"
              />
              <View style={s.viewfinderTopBar}>
                <TouchableOpacity
                  style={s.viewfinderIconBtn}
                  onPress={() => setViewfinderOpen(false)}
                  testID="viewfinder-close"
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.viewfinderIconBtn}
                  onPress={cycleFlash}
                  testID="viewfinder-flash"
                >
                  <Ionicons
                    name={flash === "off" ? "flash-off" : flash === "on" ? "flash" : "flash-outline"}
                    size={22}
                    color="#fff"
                  />
                </TouchableOpacity>
              </View>
              <View style={s.viewfinderBottomBar}>
                <View style={{ width: 52 }} />
                <TouchableOpacity
                  style={s.shutterOuter}
                  onPress={takePicture}
                  disabled={isCapturing}
                  activeOpacity={0.8}
                  testID="viewfinder-shutter"
                >
                  {isCapturing ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <View style={s.shutterInner} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.viewfinderSideBtn}
                  onPress={toggleFacing}
                  testID="viewfinder-flip"
                >
                  <Ionicons name="camera-reverse" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={s.permissionOverlay}>
              <Ionicons name="camera-outline" size={48} color="#fff" />
              <Text style={s.permissionText}>
                {t("camera.permission.overlayMsg")}
              </Text>
              <TouchableOpacity style={s.captureBtn} onPress={() => setViewfinderOpen(false)}>
                <Text style={s.captureBtnText}>{t("camera.permission.close")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      <Modal
        visible={showPatientPicker}
        animationType="slide"
        onRequestClose={() => setShowPatientPicker(false)}
      >
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
              <TouchableOpacity
                style={s.noPatientItem}
                onPress={() => {
                  setSelectedPatient(null);
                  setShowPatientPicker(false);
                }}
              >
                <Ionicons name="ban" size={20} color={colors.mutedForeground} />
                <Text style={s.noPatientText}>{t("camera.noPatient")}</Text>
              </TouchableOpacity>
            }
            renderItem={({ item }) => {
              const initials = item.name
                .split(" ")
                .slice(0, 2)
                .map((n: string) => n[0])
                .join("")
                .toUpperCase();
              return (
                <TouchableOpacity
                  style={s.modalItem}
                  onPress={() => {
                    setSelectedPatient(item);
                    setShowPatientPicker(false);
                  }}
                >
                  <View style={s.modalItemAvatar}>
                    <Text style={s.modalItemInitials}>{initials}</Text>
                  </View>
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
