/**
 * DraggablePhotoList
 *
 * Vertically-scrollable list of photo-review cards with long-press-to-drag
 * reordering.
 *
 * Built on react-native-gesture-handler v2 + react-native-reanimated v4.
 *
 * Drop-slot semantics
 * -------------------
 * `dropSlot` ranges 0..items.length (inclusive):
 *   - slot k means "dragged item will be inserted BEFORE original item[k]"
 *   - slot items.length means "insert after the last item"
 * A slot of `dragFrom` or `dragFrom+1` is a no-op (item stays in place).
 *
 * Mapping slot → moveItem(from, to)
 * -----------------------------------
 * After splicing out `from`, indices shift:
 *   - downward (from < slot): effective target = slot - 1
 *   - upward   (from > slot): effective target = slot
 *
 * Shared-value safety
 * -------------------
 * The drop slot is stored in a Reanimated shared value (`dropSlotSV`) so that
 * the gesture `onEnd` worklet can read it directly — avoiding the "stale React
 * ref in a worklet closure" problem.  Item layout positions are also stored in
 * a shared value (`itemPosSV`) so the slot computation can happen on the UI
 * thread without a `runOnJS` round-trip.
 */

import React, { useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  type ImageStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

// ─── public types ──────────────────────────────────────────────────────────────

export type QueueItem = {
  uri: string;
  notes: string;
  /** True once the item has been successfully uploaded in a previous attempt. */
  uploaded?: boolean;
};

interface CardStyles {
  photoCard: ViewStyle;
  photoCardThumb: ViewStyle;
  photoCardThumbImg: ImageStyle;
  photoCardThumbRemoveBtn: ViewStyle;
  photoCardSuccessOverlay: ViewStyle;
  photoCardRight: ViewStyle;
  photoCardLabel: TextStyle;
  photoCardInput: ViewStyle | TextStyle;
}

interface Colors {
  foreground: string;
  mutedForeground: string;
  border: string;
  background: string;
  card: string;
  primary: string;
  muted: string;
  radius: number;
}

export interface Props {
  items: QueueItem[];
  isUploading: boolean;
  uploadDone: boolean;
  /** Called when user drops at a new position: (fromIndex, toIndex) */
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (index: number) => void;
  onUpdateNotes: (index: number, value: string) => void;
  /** Parent can disable its own ScrollView while this list is dragging */
  onDragStateChange?: (dragging: boolean) => void;
  cardStyles: CardStyles;
  colors: Colors;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

// ─── constants ─────────────────────────────────────────────────────────────────

const CARD_GAP = 10;
const LONG_PRESS_MS = 400;
const DROP_BAR_H = 3;

// ─── component ─────────────────────────────────────────────────────────────────

export default function DraggablePhotoList({
  items,
  isUploading,
  uploadDone,
  onReorder,
  onRemove,
  onUpdateNotes,
  onDragStateChange,
  cardStyles,
  colors,
  t,
}: Props) {
  // ── container position (pageY from top of screen) ──────────────────────────
  const containerRef = useRef<View>(null);
  /** Stored in a shared value so it's readable inside worklets. */
  const containerPageYSV = useSharedValue(0);

  // ── item layout positions ──────────────────────────────────────────────────
  /**
   * Shared-value array: [[y0, h0], [y1, h1], …] – content-relative positions.
   * Written from the JS thread in onLayout; read in the UI-thread worklet.
   */
  const itemPosSV = useSharedValue<number[][]>([]);

  const updateItemPos = useCallback((idx: number, y: number, h: number) => {
    const copy = itemPosSV.value.slice();
    copy[idx] = [y, h];
    itemPosSV.value = copy;
  }, [itemPosSV]);

  // ── scroll offset ──────────────────────────────────────────────────────────
  const scrollYSV = useSharedValue(0);

  // ── drag state ─────────────────────────────────────────────────────────────
  /** Index of the card being dragged (-1 = none). Written by worklet. */
  const dragFromSV = useSharedValue(-1);
  /**
   * Current drop slot (0..items.length). Written directly by the worklet in
   * onUpdate so onEnd can read a consistent value without a runOnJS round-trip.
   */
  const dropSlotSV = useSharedValue(-1);

  // React-state mirrors for rendering
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Scale spring for the dragged card
  const dragScale = useSharedValue(1);

  // ── JS-thread callbacks ────────────────────────────────────────────────────

  const jsStartDrag = useCallback((idx: number) => {
    setDragFrom(idx);
    setDropSlot(idx); // no-op slot → no indicator yet
    setScrollEnabled(false);
    onDragStateChange?.(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [onDragStateChange]);

  /** Called from worklet on every update to keep React state in sync for UI. */
  const jsSetDropSlot = useCallback((slot: number) => {
    setDropSlot(slot);
  }, []);

  const jsEndDrag = useCallback((cancelled: boolean, slot: number) => {
    const from = dragFromSV.value; // safe: dragFromSV written before this call
    setDragFrom(null);
    setDropSlot(null);
    setScrollEnabled(true);
    onDragStateChange?.(false);
    dragFromSV.value = -1;
    dropSlotSV.value = -1;

    if (!cancelled && from >= 0 && slot >= 0) {
      // No-op slots: slot === from (item stays) or slot === from+1 (insert right after removal = same spot)
      const isNoop = slot === from || slot === from + 1;
      if (!isNoop) {
        // After removing `from`, the target index shifts for downward moves
        const effectiveTo = from < slot ? slot - 1 : slot;
        onReorder(from, effectiveTo);
      }
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [dragFromSV, dropSlotSV, onDragStateChange, onReorder]);

  // ── gesture factory ────────────────────────────────────────────────────────
  // Memoised on item count; individual gesture closures capture their index.

  const gestures = useMemo(
    () =>
      items.map((_, idx) =>
        Gesture.Pan()
          .activateAfterLongPress(LONG_PRESS_MS)
          .onStart(() => {
            "worklet";
            dragFromSV.value = idx;
            dropSlotSV.value = idx;
            dragScale.value = withSpring(1.04, { damping: 15, stiffness: 300 });
            runOnJS(jsStartDrag)(idx);
          })
          .onUpdate((e) => {
            "worklet";
            // Convert screen Y → content Y (scroll locked during drag, so
            // scrollYSV is the value captured at drag-start; it won't change).
            const contentY =
              e.absoluteY - containerPageYSV.value + scrollYSV.value;

            // Find the insertion slot
            const positions = itemPosSV.value;
            let slot = positions.length; // default: after last
            for (let i = 0; i < positions.length; i++) {
              const [y, h] = positions[i] ?? [0, 0];
              if (contentY < y + h / 2) {
                slot = i;
                break;
              }
            }

            dropSlotSV.value = slot;
            runOnJS(jsSetDropSlot)(slot);
          })
          .onEnd(() => {
            "worklet";
            const slot = dropSlotSV.value;
            dragScale.value = withSpring(1, { damping: 15, stiffness: 300 });
            runOnJS(jsEndDrag)(false, slot);
          })
          .onFinalize((_e, success) => {
            "worklet";
            if (!success) {
              dragScale.value = withSpring(1, { damping: 15, stiffness: 300 });
              runOnJS(jsEndDrag)(true, dropSlotSV.value);
            }
          }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length],
  );

  // ── animated style for the dragged card ───────────────────────────────────

  const draggedCardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dragScale.value }],
  }));

  // ── local styles ──────────────────────────────────────────────────────────

  const s = useMemo(
    () =>
      StyleSheet.create({
        dragHandle: {
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 6,
          paddingVertical: 8,
        },
        dropBar: {
          height: DROP_BAR_H,
          borderRadius: DROP_BAR_H / 2,
          backgroundColor: colors.primary,
          marginHorizontal: 4,
        },
        dropBarAbove: { marginBottom: CARD_GAP / 2 },
        dropBarBelow: { marginTop: CARD_GAP / 2 },
      }),
    [colors.primary],
  );

  const canDrag = !isUploading && !uploadDone && items.length > 1;

  // ── helpers ────────────────────────────────────────────────────────────────

  const isNoop = (slot: number | null, from: number | null) =>
    slot === null ||
    from === null ||
    slot === from ||
    slot === from + 1;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <View
      ref={containerRef}
      onLayout={() => {
        containerRef.current?.measure((_x, _y, _w, _h, _px, py) => {
          containerPageYSV.value = py;
        });
      }}
    >
      <ScrollView
        scrollEnabled={scrollEnabled}
        onScroll={(e) => {
          scrollYSV.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={{ gap: CARD_GAP }}>
          {items.map((item, idx) => {
            const isBeingDragged = dragFrom === idx;
            const noOp = isNoop(dropSlot, dragFrom);

            // Show insertion bar above this item when it's the drop slot
            const showBarAbove =
              canDrag &&
              !noOp &&
              dropSlot === idx;

            // Show bar below last item when slot === items.length
            const showBarBelow =
              canDrag &&
              !noOp &&
              idx === items.length - 1 &&
              dropSlot === items.length;

            return (
              <View
                key={item.uri + String(idx)}
                onLayout={(e) => {
                  updateItemPos(
                    idx,
                    e.nativeEvent.layout.y,
                    e.nativeEvent.layout.height,
                  );
                }}
              >
                {showBarAbove && (
                  <View style={[s.dropBar, s.dropBarAbove]} />
                )}

                <Animated.View
                  style={[
                    cardStyles.photoCard,
                    isBeingDragged && { opacity: 0.35 },
                    isBeingDragged && draggedCardAnimStyle,
                  ]}
                >
                  {/* drag handle */}
                  {canDrag ? (
                    <GestureDetector gesture={gestures[idx]}>
                      <View style={s.dragHandle} hitSlop={8}>
                        <Ionicons
                          name="reorder-three"
                          size={24}
                          color={colors.mutedForeground}
                        />
                      </View>
                    </GestureDetector>
                  ) : null}

                  {/* thumbnail */}
                  <View style={cardStyles.photoCardThumb}>
                    <Image
                      source={{ uri: item.uri }}
                      style={cardStyles.photoCardThumbImg}
                      contentFit="cover"
                    />
                    {!isUploading && !uploadDone && !item.uploaded && (
                      <TouchableOpacity
                        style={cardStyles.photoCardThumbRemoveBtn}
                        onPress={() => onRemove(idx)}
                      >
                        <Ionicons name="close" size={12} color="#fff" />
                      </TouchableOpacity>
                    )}
                    {(uploadDone || item.uploaded) && (
                      <View style={cardStyles.photoCardSuccessOverlay}>
                        <Ionicons
                          name="checkmark-circle"
                          size={24}
                          color={colors.primary}
                        />
                      </View>
                    )}
                  </View>

                  {/* notes */}
                  <View style={cardStyles.photoCardRight}>
                    <Text style={cardStyles.photoCardLabel}>
                      {t("camera.batch.photoN", {
                        n: idx + 1,
                        total: items.length,
                      })}
                    </Text>
                    <TextInput
                      style={cardStyles.photoCardInput as TextStyle}
                      placeholder={t("camera.notesPlaceholder")}
                      placeholderTextColor={colors.mutedForeground}
                      value={item.notes}
                      onChangeText={(v) => onUpdateNotes(idx, v)}
                      multiline
                      editable={!isUploading}
                    />
                  </View>
                </Animated.View>

                {showBarBelow && (
                  <View style={[s.dropBar, s.dropBarBelow]} />
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
