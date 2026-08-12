import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import { refreshAttachmentUrlsAndCache } from "../../services/refresh-attachment-urls";
import { hapticMedium } from "../../platform/haptics";
import type { PreviewImageItem } from "../../app/controller/state/useChatInteractionState";

const PAGE_GAP = 16;
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DISMISS_TRANSLATION = 280;
const NAVIGATE_THRESHOLD = 0.25;
const NAVIGATE_VELOCITY = 500;
const DIRECTION_LOCK_PX = 10;
const BOUNDARY_RESISTANCE = 0.3;

const LOCAL_URI_PREFIXES = ["file:", "content:", "ph:", "asset:", "data:"];

function isLocalUri(uri: string | null): boolean {
  if (!uri) return false;
  return LOCAL_URI_PREFIXES.some(prefix => uri.startsWith(prefix));
}

const noop = () => {};

const PreviewImageItem = memo(
  function PreviewImageItem({
    uri,
    width,
    height,
    onLoadStart,
    onLoad,
    onError
  }: {
    uri: string;
    width: number;
    height: number;
    onLoadStart: () => void;
    onLoad: () => void;
    onError: () => void;
  }) {
    const source = useMemo(() => ({ uri }), [uri]);
    return (
      <Image
        source={source}
        style={{ width, height }}
        resizeMode="contain"
        onLoadStart={onLoadStart}
        onLoad={onLoad}
        onError={onError}
      />
    );
  },
  (prev, next) => {
    return (
      prev.uri === next.uri &&
      prev.width === next.width &&
      prev.height === next.height
    );
  }
);

export function ImagePreviewOverlay(props: {
  images: PreviewImageItem[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onUrlRefreshed: (index: number, nextUrl: string) => void;
  onSaveToAlbum?: (uri: string) => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const pageWidth = width + PAGE_GAP;
  const insets = useSafeAreaInsets();
  const totalCount = props.images.length;
  const visible = totalCount > 0;

  const currentImage = props.images[props.currentIndex] ?? null;
  const previewImageUrl = currentImage?.url ?? null;
  const previewImageContent = currentImage?.content ?? null;

  const triedRefreshRef = useRef(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loadStarted, setLoadStarted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    triedRefreshRef.current = false;
    setUnavailable(false);
    setLoadStarted(false);
    setLoaded(false);
  }, [props.images]);

  const handleLoadStart = useCallback(() => {
    setLoadStarted(true);
  }, []);
  const handleLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  const handleImageErrorRef = useRef<() => void>(noop);
  const stableHandleImageError = useCallback(() => {
    handleImageErrorRef.current();
  }, []);

  const handleImageError = () => {
    const uri = previewImageUrl;
    if (!uri || isLocalUri(uri)) {
      setUnavailable(true);
      return;
    }
    const uploadId = previewImageContent?.upload_id;
    if (!uploadId) {
      setUnavailable(true);
      return;
    }
    if (triedRefreshRef.current) {
      setUnavailable(true);
      return;
    }
    triedRefreshRef.current = true;
    const messageId = previewImageContent?.message_id ?? null;
    void refreshAttachmentUrlsAndCache(
      [uploadId],
      messageId ? { messageIds: { [uploadId]: messageId } } : undefined
    )
      .then(map => {
        const info = map[uploadId];
        if (!info?.url) {
          setUnavailable(true);
          return;
        }
        setUnavailable(false);
        setLoadStarted(false);
        setLoaded(false);
        props.onUrlRefreshed(props.currentIndex, info.url);
      })
      .catch(() => {
        setUnavailable(true);
      });
  };
  handleImageErrorRef.current = handleImageError;

  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const zoomTranslateX = useSharedValue(0);
  const zoomTranslateY = useSharedValue(0);
  const savedZoomTranslateX = useSharedValue(0);
  const savedZoomTranslateY = useSharedValue(0);
  const dismissTranslateY = useSharedValue(0);
  const pageTranslateX = useSharedValue(0);
  const currentPage = useSharedValue(props.currentIndex);
  const directionLocked = useSharedValue(false);
  const isHorizontalGesture = useSharedValue(false);

  useEffect(() => {
    if (visible) {
      scheduleOnUI(() => {
        "worklet";
        cancelAnimation(opacity);
        cancelAnimation(scale);
        cancelAnimation(zoomTranslateX);
        cancelAnimation(zoomTranslateY);
        cancelAnimation(dismissTranslateY);
        cancelAnimation(pageTranslateX);
        scale.value = 1;
        savedScale.value = 1;
        zoomTranslateX.value = 0;
        zoomTranslateY.value = 0;
        savedZoomTranslateX.value = 0;
        savedZoomTranslateY.value = 0;
        dismissTranslateY.value = 0;
        pageTranslateX.value = 0;
        currentPage.value = props.currentIndex;
        directionLocked.value = false;
        isHorizontalGesture.value = false;
        opacity.value = withTiming(1, { duration: 180 });
      });
    } else {
      scheduleOnUI(() => {
        "worklet";
        cancelAnimation(opacity);
        opacity.value = 0;
      });
    }
  }, [
    visible,
    opacity,
    scale,
    savedScale,
    zoomTranslateX,
    zoomTranslateY,
    savedZoomTranslateX,
    savedZoomTranslateY,
    dismissTranslateY,
    pageTranslateX,
    currentPage,
    directionLocked,
    isHorizontalGesture,
    props.currentIndex
  ]);

  const closeFromGesture = () => {
    props.onClose();
  };

  const pinch = Gesture.Pinch()
    .onUpdate(event => {
      const next = savedScale.value * event.scale;
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE * 0.5, next));
      scale.value = clamped;
      // 缩小过程中按比例缩减偏移，保持相对视觉位置
      if (clamped < savedScale.value && clamped > MIN_SCALE) {
        const ratio = clamped / savedScale.value;
        savedZoomTranslateX.value = savedZoomTranslateX.value * ratio;
        savedZoomTranslateY.value = savedZoomTranslateY.value * ratio;
        zoomTranslateX.value = savedZoomTranslateX.value;
        zoomTranslateY.value = savedZoomTranslateY.value;
      }
    })
    .onEnd(() => {
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value));
      savedScale.value = clamped;
      if (clamped <= MIN_SCALE) {
        scale.value = withSpring(1, { damping: 18, stiffness: 200 });
        zoomTranslateX.value = withSpring(0, { damping: 18, stiffness: 200 });
        zoomTranslateY.value = withSpring(0, { damping: 18, stiffness: 200 });
        savedZoomTranslateX.value = 0;
        savedZoomTranslateY.value = 0;
      } else {
        scale.value = withTiming(clamped, { duration: 140 });
        const maxOX = (width * (clamped - 1)) / 2;
        const maxOY = (height * (clamped - 1)) / 2;
        const ctx = Math.max(
          -maxOX,
          Math.min(maxOX, savedZoomTranslateX.value)
        );
        const cty = Math.max(
          -maxOY,
          Math.min(maxOY, savedZoomTranslateY.value)
        );
        savedZoomTranslateX.value = ctx;
        savedZoomTranslateY.value = cty;
        zoomTranslateX.value = withTiming(ctx, { duration: 140 });
        zoomTranslateY.value = withTiming(cty, { duration: 140 });
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onUpdate(event => {
      if (scale.value > MIN_SCALE + 0.01) {
        zoomTranslateX.value = savedZoomTranslateX.value + event.translationX;
        zoomTranslateY.value = savedZoomTranslateY.value + event.translationY;
        return;
      }

      if (!directionLocked.value) {
        const absDx = Math.abs(event.translationX);
        const absDy = Math.abs(event.translationY);
        if (absDx > DIRECTION_LOCK_PX || absDy > DIRECTION_LOCK_PX) {
          directionLocked.value = true;
          isHorizontalGesture.value = absDx > absDy;
        }
        if (!directionLocked.value) return;
      }

      if (isHorizontalGesture.value) {
        cancelAnimation(currentPage);
        currentPage.value = Math.round(currentPage.value);
        cancelAnimation(pageTranslateX);
        let dx = event.translationX;
        if (currentPage.value <= 0 && dx > 0) {
          dx = dx * BOUNDARY_RESISTANCE;
        } else if (currentPage.value >= totalCount - 1 && dx < 0) {
          dx = dx * BOUNDARY_RESISTANCE;
        }
        pageTranslateX.value = dx;
        dismissTranslateY.value = 0;
      } else {
        dismissTranslateY.value = event.translationY;
        const ratio = Math.min(
          1,
          Math.abs(event.translationY) / (DISMISS_TRANSLATION * 2)
        );
        opacity.value = 1 - ratio * 0.6;
      }
    })
    .onEnd(event => {
      if (scale.value > MIN_SCALE + 0.01) {
        savedZoomTranslateX.value = zoomTranslateX.value;
        savedZoomTranslateY.value = zoomTranslateY.value;
        directionLocked.value = false;
        isHorizontalGesture.value = false;
        return;
      }

      if (directionLocked.value && isHorizontalGesture.value) {
        directionLocked.value = false;
        isHorizontalGesture.value = false;
        const absDx = Math.abs(event.translationX);
        const threshold = pageWidth * NAVIGATE_THRESHOLD;
        const canGoNext = currentPage.value < totalCount - 1;
        const canGoPrev = currentPage.value > 0;

        if (
          (absDx > threshold ||
            Math.abs(event.velocityX) > NAVIGATE_VELOCITY) &&
          event.translationX < 0 &&
          canGoNext
        ) {
          scale.value = 1;
          savedScale.value = 1;
          zoomTranslateX.value = 0;
          zoomTranslateY.value = 0;
          savedZoomTranslateX.value = 0;
          savedZoomTranslateY.value = 0;
          const fromPage = currentPage.value;
          currentPage.value = withTiming(
            fromPage + 1,
            { duration: 200 },
            finished => {
              if (finished) {
                pageTranslateX.value = withTiming(0, { duration: 1 });
                scheduleOnRN(props.onNavigate, Math.round(currentPage.value));
              }
            }
          );
          pageTranslateX.value = withTiming(0, { duration: 200 });
        } else if (
          (absDx > threshold ||
            Math.abs(event.velocityX) > NAVIGATE_VELOCITY) &&
          event.translationX > 0 &&
          canGoPrev
        ) {
          scale.value = 1;
          savedScale.value = 1;
          zoomTranslateX.value = 0;
          zoomTranslateY.value = 0;
          savedZoomTranslateX.value = 0;
          savedZoomTranslateY.value = 0;
          const fromPage = currentPage.value;
          currentPage.value = withTiming(
            fromPage - 1,
            { duration: 200 },
            finished => {
              if (finished) {
                pageTranslateX.value = withTiming(0, { duration: 1 });
                scheduleOnRN(props.onNavigate, Math.round(currentPage.value));
              }
            }
          );
          pageTranslateX.value = withTiming(0, { duration: 200 });
        } else {
          pageTranslateX.value = withTiming(0, { duration: 180 });
        }
        return;
      }

      directionLocked.value = false;
      isHorizontalGesture.value = false;

      const shouldDismiss =
        Math.abs(event.translationY) > DISMISS_TRANSLATION ||
        Math.abs(event.velocityY) > 900;
      if (shouldDismiss) {
        scheduleOnRN(hapticMedium);
        opacity.value = withTiming(0, { duration: 160 });
        dismissTranslateY.value = withTiming(
          event.translationY > 0 ? height : -height,
          { duration: 200 },
          () => {
            scheduleOnRN(closeFromGesture);
          }
        );
      } else {
        dismissTranslateY.value = withTiming(0, { duration: 180 });
        opacity.value = withTiming(1, { duration: 180 });
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > MIN_SCALE + 0.01) {
        scale.value = withTiming(MIN_SCALE, { duration: 180 });
        savedScale.value = MIN_SCALE;
        zoomTranslateX.value = withTiming(0, { duration: 180 });
        zoomTranslateY.value = withTiming(0, { duration: 180 });
        savedZoomTranslateX.value = 0;
        savedZoomTranslateY.value = 0;
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: 180 });
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan);
  const gesture = Gesture.Simultaneous(composed, doubleTap);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value
  }));

  const stripStyle = useAnimatedStyle(() => {
    const baseOffset =
      (pageWidth * totalCount - width) / 2 - currentPage.value * pageWidth;
    return {
      width: pageWidth * totalCount,
      height,
      position: "relative" as const,
      transform: [
        { translateX: baseOffset + pageTranslateX.value },
        { translateY: dismissTranslateY.value }
      ]
    };
  });

  const pageZoomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: zoomTranslateX.value },
      { translateY: zoomTranslateY.value },
      { scale: scale.value }
    ]
  }));

  const showLoading =
    !unavailable && (!previewImageUrl || (loadStarted && !loaded));

  if (!visible) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={stripStyle}>
          {props.images.map((img, i) => {
            const isCurrent = i === props.currentIndex;
            const dist = Math.abs(i - props.currentIndex);
            if (dist > 2 && !img.url) return null;
            if (dist > 2 && !isCurrent) return null;

            const baseStyle = {
              position: "absolute" as const,
              left: i * pageWidth,
              width,
              height,
              alignItems: "center" as const,
              justifyContent: "center" as const
            };

            return (
              <Animated.View
                key={img.content.upload_id ?? `item-${i}`}
                style={isCurrent ? [baseStyle, pageZoomStyle] : baseStyle}
              >
                {img.url ? (
                  <PreviewImageItem
                    uri={img.url}
                    width={width}
                    height={height}
                    onLoadStart={handleLoadStart}
                    onLoad={handleLoad}
                    onError={stableHandleImageError}
                  />
                ) : null}
              </Animated.View>
            );
          })}
        </Animated.View>
      </GestureDetector>

      {showLoading ? (
        <Animated.View style={styles.statusOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#ffffff" />
        </Animated.View>
      ) : null}

      {unavailable ? (
        <Animated.View style={styles.statusOverlay} pointerEvents="none">
          <Text style={styles.statusText}>{t("ui.imageLoadFailed")}</Text>
        </Animated.View>
      ) : null}

      <Pressable
        style={[styles.closeButton, { top: Math.max(insets.top + 8, 16) }]}
        onPress={props.onClose}
        accessibilityRole="button"
        accessibilityLabel={t("ui.closeImagePreview")}
      >
        <Ionicons name="close" size={26} color="#ffffff" />
      </Pressable>

      {previewImageUrl && props.onSaveToAlbum ? (
        <Pressable
          style={[styles.saveButton, { top: Math.max(insets.top + 8, 16) }]}
          onPress={() => props.onSaveToAlbum!(previewImageUrl!)}
          accessibilityRole="button"
          accessibilityLabel={t("ui.saveImageToAlbum")}
        >
          <Ionicons name="download-outline" size={24} color="#ffffff" />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 60,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center"
  },
  statusOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  statusText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14
  },
  closeButton: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  saveButton: {
    position: "absolute",
    right: 64,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)"
  }
});
