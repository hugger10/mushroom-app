import { useEffect } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import { AppAvatar } from "../ui";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DISMISS_TRANSLATION = 140;

/**
 * WhatsApp-style avatar viewer for mobile. Pinch to zoom, drag to pan, drag
 * downwards (when not zoomed) to dismiss. Tap to close.
 */
export function AvatarPreviewOverlay(props: {
  visible: boolean;
  avatarUrl?: string | null;
  fallbackLabel?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Reset whenever the overlay opens. We dispatch the reset to the UI thread
  // via scheduleOnUI to avoid racing the gesture worklets that read/write the
  // same shared values on the UI thread.
  useEffect(() => {
    if (props.visible) {
      scheduleOnUI(() => {
        "worklet";
        cancelAnimation(opacity);
        cancelAnimation(scale);
        cancelAnimation(translateX);
        cancelAnimation(translateY);
        scale.value = 1;
        savedScale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
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
    props.visible,
    opacity,
    scale,
    savedScale,
    translateX,
    translateY,
    savedTranslateX,
    savedTranslateY
  ]);

  const closeFromGesture = () => {
    props.onClose();
  };

  const pinch = Gesture.Pinch()
    .onUpdate(event => {
      const next = savedScale.value * event.scale;
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE * 0.5, next));
    })
    .onEnd(() => {
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value));
      scale.value = withTiming(clamped, { duration: 140 });
      savedScale.value = clamped;
      if (clamped <= MIN_SCALE) {
        translateX.value = withTiming(0, { duration: 140 });
        translateY.value = withTiming(0, { duration: 140 });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate(event => {
      if (scale.value > MIN_SCALE + 0.01) {
        translateX.value = savedTranslateX.value + event.translationX;
        translateY.value = savedTranslateY.value + event.translationY;
        return;
      }
      // 未放大时，仅响应竖向拖动用于下滑关闭。
      translateY.value = event.translationY;
      const ratio = Math.min(
        1,
        Math.abs(event.translationY) / (DISMISS_TRANSLATION * 2)
      );
      opacity.value = 1 - ratio * 0.6;
    })
    .onEnd(event => {
      if (scale.value > MIN_SCALE + 0.01) {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        return;
      }
      const shouldDismiss =
        Math.abs(event.translationY) > DISMISS_TRANSLATION ||
        Math.abs(event.velocityY) > 900;
      if (shouldDismiss) {
        opacity.value = withTiming(0, { duration: 160 });
        translateY.value = withTiming(
          event.translationY > 0 ? height : -height,
          { duration: 200 },
          () => {
            scheduleOnRN(closeFromGesture);
          }
        );
      } else {
        translateY.value = withTiming(0, { duration: 180 });
        opacity.value = withTiming(1, { duration: 180 });
      }
    });

  const tap = Gesture.Tap().onEnd(() => {
    scheduleOnRN(closeFromGesture);
  });

  const composed = Gesture.Simultaneous(pinch, pan);
  const tapWithComposed = Gesture.Exclusive(composed, tap);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value
  }));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value }
    ]
  }));

  if (!props.visible) {
    return null;
  }

  const avatarSize = Math.min(width, height) - 80;

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <GestureDetector gesture={tapWithComposed}>
        <Animated.View style={[styles.stage, imageStyle]}>
          {props.avatarUrl ? (
            <Image
              source={{ uri: props.avatarUrl }}
              style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: 24
              }}
              resizeMode="cover"
            />
          ) : (
            <AppAvatar
              label={props.fallbackLabel || "?"}
              imageUrl={null}
              style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: 24,
                backgroundColor: "#1f2937"
              }}
              textStyle={{ fontSize: avatarSize * 0.32, color: "#ffffff" }}
            />
          )}
        </Animated.View>
      </GestureDetector>
      <Pressable
        style={[styles.closeButton, { top: Math.max(insets.top + 8, 16) }]}
        onPress={props.onClose}
        accessibilityRole="button"
        accessibilityLabel={t("ui.closeAvatarPreview")}
      >
        <Ionicons name="close" size={26} color="#ffffff" />
      </Pressable>
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
    zIndex: 70,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center"
  },
  stage: {
    alignItems: "center",
    justifyContent: "center"
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
  }
});
