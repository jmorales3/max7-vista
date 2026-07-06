import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Dimensions,
  Platform,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPatient,
  useListPatientImages,
  useDeletePatient,
  useDeleteImage,
  getBaseUrl,
  getListPatientsQueryKey,
  getListPatientImagesQueryKey,
  customFetch,
  ApiError,
} from "@workspace/api-client-react";
import type { Image as PatientImage } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  colors,
  onPress,
}: {
  image: PatientImage;
  columns: GridColumns;
  baseUrl: string;
  colors: ReturnType<typeof useColors>;
  onPress: (image: PatientImage) => void;
}) {
  const gap = 4;
  const padding = 16;
  const totalPad = padding * 2 + gap * (columns - 1);
  const itemSize = (SCREEN_WIDTH - totalPad) / columns;
  const imageUrl = `${baseUrl}/api/images/${image.id}/file`;

  return (
    <TouchableOpacity
      onPress={() => onPress(image)}
      activeOpacity={0.85}
      style={[
        gridStyles.item,
        {
          width: itemSize,
          height: itemSize,
          borderRadius: columns === 1 ? 10 : 6,
          margin: gap / 2,
        },
      ]}
      testID={`image-item-${image.id}`}
    >
      <Image
        source={{ uri: imageUrl }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        transition={200}
      />
      {image.notes ? (
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
});

export default function PatientDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const patientId = Number(id);
  const queryClient = useQueryClient();

  const [columns, setColumns] = useState<GridColumns>(2);
  const [lightboxImage, setLightboxImage] = useState<PatientImage | null>(null);
  const [isDeletingPatient, setIsDeletingPatient] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState(false);

  const baseUrl = getBaseUrl() ?? "";

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
            "Used in presentations",
            conflictMessage(
              "This patient's images are used in saved presentations. Deleting the patient will remove them from these presentations too.",
              conflict,
            ),
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete Anyway",
                style: "destructive",
                onPress: () => forceDeletePatient(),
              },
            ],
          );
          return;
        }
        Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete patient.");
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
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete patient.");
    } finally {
      setIsDeletingPatient(false);
    }
  }, [patientId, queryClient]);

  const handleDeletePatient = useCallback(async () => {
    if (!patient) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Delete patient",
      `Are you sure you want to delete ${patient.name}? This will also delete all of their images.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deletePatient.mutate({ id: patientId }),
        },
      ],
    );
  }, [patient, patientId, deletePatient]);

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
            "Used in presentations",
            conflictMessage(
              "This image is used in saved presentations. Deleting it will remove it from those presentations too.",
              conflict,
            ),
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete Anyway",
                style: "destructive",
                onPress: () => forceDeleteImage(),
              },
            ],
          );
          return;
        }
        Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete image.");
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
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete image.");
    } finally {
      setIsDeletingImage(false);
    }
  }, [lightboxImage, patientId, queryClient]);

  const handleDeleteImage = useCallback(async () => {
    if (!lightboxImage) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Delete image",
      "Are you sure you want to delete this image?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteImage.mutate({ id: lightboxImage.id }),
        },
      ],
    );
  }, [lightboxImage, deleteImage]);

  const handleImagePress = useCallback(async (image: PatientImage) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLightboxImage(image);
  }, []);

  const cycleColumns = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setColumns((c) => (c === 1 ? 2 : c === 2 ? 4 : 1));
  }, []);

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
        <Text style={s.emptyText}>Access denied</Text>
        <Text style={s.emptySubtext}>You don't have access to this patient.</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => router.back()}>
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_500Medium" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerName} numberOfLines={1}>
            {patient?.name ?? "Patient"}
          </Text>
          <Text style={s.headerCode}>{patient?.patientCode}</Text>
        </View>
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
      </View>

      {imageList.length > 0 && (
        <View style={s.countBadge}>
          <Text style={s.countText}>
            {imageList.length} {imageList.length === 1 ? "image" : "images"}
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
          <Text style={s.emptyText}>No images yet</Text>
          <Text style={s.emptySubtext}>Capture images from the Camera tab</Text>
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
              colors={colors}
              onPress={handleImagePress}
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
                {lightboxImage.fileName ?? `Image ${lightboxImage.id}`}
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
              source={{ uri: `${baseUrl}/api/images/${lightboxImage.id}/file` }}
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
