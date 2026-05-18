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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useGetPatient, useListPatientImages } from "@workspace/api-client-react";
import type { Image as PatientImage } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
      {columns === 1 && image.notes ? (
        <View style={[gridStyles.noteBanner, { backgroundColor: colors.card }]}>
          <Text style={[gridStyles.noteText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {image.notes}
          </Text>
        </View>
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
});

export default function PatientDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const patientId = Number(id);

  const [columns, setColumns] = useState<GridColumns>(2);
  const [lightboxImage, setLightboxImage] = useState<PatientImage | null>(null);

  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  const { data: patient, isLoading: patientLoading } = useGetPatient(patientId);
  const {
    data: images,
    isLoading: imagesLoading,
    refetch,
    isFetching,
  } = useListPatientImages(patientId);

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
