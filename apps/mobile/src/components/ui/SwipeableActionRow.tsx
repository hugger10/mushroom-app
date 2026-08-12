import { useMemo, useRef, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { hapticLight } from "../../platform/haptics";
import { useAppTheme } from "../../styles/app-styles";

const SWIPE_ACTION_WIDTH = 96;
const SWIPE_START_THRESHOLD = 10;
const SWIPE_SNAP_RATIO = 0.44;

export function SwipeableActionRow(props: {
  actionLabel: string;
  onAction: () => void;
  actionTestID?: string;
  children: ReactNode;
}) {
  const { styles } = useAppTheme();
  const translateX = useSharedValue(0);
  const baseOffset = useSharedValue(0);
  const didSettle = useSharedValue(false);
  const offsetRef = useRef(0);

  const clamp = (value: number) => {
    "worklet";
    return Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, value));
  };

  function animateTo(target: number) {
    const clamped = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, target));
    offsetRef.current = clamped;
    baseOffset.value = clamped;
    translateX.value = withSpring(clamped, {
      dampingRatio: 0.9,
      duration: 250
    });
  }

  function onSwipeGrant(capturedOffset: number) {
    offsetRef.current = capturedOffset;
  }

  function onSwipeEnd(current: number) {
    if (current <= -SWIPE_ACTION_WIDTH * SWIPE_SNAP_RATIO) {
      hapticLight();
      animateTo(-SWIPE_ACTION_WIDTH);
    } else {
      animateTo(0);
    }
  }

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-SWIPE_START_THRESHOLD, 0])
      .failOffsetY([-SWIPE_START_THRESHOLD, SWIPE_START_THRESHOLD])
      .onStart(() => {
        "worklet";
        cancelAnimation(translateX);
        didSettle.value = false;
        baseOffset.value = clamp(translateX.value);
        scheduleOnRN(onSwipeGrant, baseOffset.value);
      })
      .onUpdate(e => {
        "worklet";
        translateX.value = clamp(baseOffset.value + e.translationX);
      })
      .onEnd(e => {
        "worklet";
        const current = clamp(baseOffset.value + e.translationX);
        didSettle.value = true;
        scheduleOnRN(onSwipeEnd, current);
      })
      .onFinalize(() => {
        "worklet";
        if (!didSettle.value) {
          scheduleOnRN(animateTo, 0);
        }
        didSettle.value = false;
      });
  }, []);

  const shellAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }]
  }));

  return (
    <View
      style={[styles.chatInfoCompactRowSwipeShell, { position: "relative" }]}
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: SWIPE_ACTION_WIDTH
        }}
      >
        <Pressable
          style={styles.chatInfoMemberSwipeRemoveButton}
          onPress={() => {
            animateTo(0);
            props.onAction();
          }}
          testID={props.actionTestID}
        >
          <Text style={styles.chatInfoMemberSwipeRemoveText}>
            {props.actionLabel}
          </Text>
        </Pressable>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[shellAnimatedStyle, styles.chatInfoCompactRowSurface]}
        >
          {props.children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
