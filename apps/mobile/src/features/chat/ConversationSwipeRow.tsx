import type { Conversation, UserPresenceSummary } from "@mushroom/shared";
import type { ForwardedRef } from "react";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Lucide from "@react-native-vector-icons/lucide/static";
import type { LucideIconName } from "@react-native-vector-icons/lucide/static";
import Ionicons from "react-native-vector-icons/Ionicons";
import { ConversationRow } from "../../components/conversation";
import { useAppTheme } from "../../styles/app-styles";

export type ConversationSwipeAction = {
  key: string;
  label: string;
  icon: string;
  iconSet?: "lucide";
  circleColor: string;
  tintColor: string;
  onPress: () => void;
};

export type ConversationSwipeRowHandle = {
  close: () => void;
};

const ACTION_SLOT_WIDTH = 68;

// ---- 滑动手势灵敏度参数 ----
/** 手势启动所需的最小水平位移 (px) */
const SWIPE_START_THRESHOLD = 10;
/** 超出操作区宽度的多少比例时自动吸附打开 (0~1) */
const SWIPE_SNAP_RATIO = 0.55;
/** 松手速度超过此值时触发速度吸附 */
const SWIPE_VELOCITY_THRESHOLD = 0.45;
/** 速度吸附所需的最小偏移量 (px) */
const SWIPE_MIN_OFFSET = 18;

export const ConversationSwipeRow = forwardRef(function ConversationSwipeRow(
  props: {
    conversation: Conversation;
    loginUserId?: number | null;
    peerPresence?: UserPresenceSummary | null;
    /** 群已读高水位 (reader user_id → last_read_seq)。透传至 ConversationRow。 */
    groupReadState?: Record<number, number> | null;
    /**
     * 当前会话的输入中 typer 映射（senderId → activity）。null/undefined 表示
     * 无人输入；ConversationRow 据此决定是否在第二行渲染 "正在输入…"。
     */
    typers?: Record<number, { activity: "text" | "voice" }> | null;
    /** 已读回执是否启用；false 时 ConversationRow 不渲染 ✓✓。 */
    isReceiptsEnabled?: boolean;
    leftActions: ConversationSwipeAction[];
    rightActions: ConversationSwipeAction[];
    onPress: () => void;
    onLongPress: () => void;
    onRequestCloseOthers: () => void;
  },
  ref: ForwardedRef<ConversationSwipeRowHandle>
) {
  const { styles } = useAppTheme();
  const translateX = useSharedValue(0);
  const baseOffset = useSharedValue(0);
  const didSettle = useSharedValue(false);
  const offsetRef = useRef(0);
  const leftWidth = props.leftActions.length * ACTION_SLOT_WIDTH;
  const rightWidth = props.rightActions.length * ACTION_SLOT_WIDTH;

  function clampTranslate(value: number) {
    return Math.max(-rightWidth, Math.min(leftWidth, value));
  }

  function animateTo(target: number) {
    const clamped = clampTranslate(target);
    offsetRef.current = clamped;
    baseOffset.value = clamped;
    translateX.value = withSpring(clamped, {
      dampingRatio: 0.9,
      duration: 250
    });
  }

  useImperativeHandle(
    ref,
    () => ({
      close: () => animateTo(0)
    }),
    [leftWidth, rightWidth]
  );

  function handleActionPress(action: ConversationSwipeAction) {
    animateTo(0);
    action.onPress();
  }

  function handleRowPress() {
    if (offsetRef.current !== 0) {
      animateTo(0);
      return;
    }
    props.onPress();
  }

  function settleAt(current: number, velocityX: number) {
    if (
      current > 0 &&
      (current > leftWidth * SWIPE_SNAP_RATIO ||
        (velocityX > SWIPE_VELOCITY_THRESHOLD && current > SWIPE_MIN_OFFSET))
    ) {
      animateTo(leftWidth);
      return;
    }
    if (
      current < 0 &&
      (Math.abs(current) > rightWidth * SWIPE_SNAP_RATIO ||
        (velocityX < -SWIPE_VELOCITY_THRESHOLD &&
          Math.abs(current) > SWIPE_MIN_OFFSET))
    ) {
      animateTo(-rightWidth);
      return;
    }
    animateTo(0);
  }

  const panGesture = useMemo(() => {
    const onGrant = (capturedOffset: number) => {
      offsetRef.current = capturedOffset;
      props.onRequestCloseOthers();
    };

    const clamp = (value: number) => {
      "worklet";
      return Math.max(-rightWidth, Math.min(leftWidth, value));
    };

    return Gesture.Pan()
      .activeOffsetX([-SWIPE_START_THRESHOLD, SWIPE_START_THRESHOLD])
      .failOffsetY([-SWIPE_START_THRESHOLD, SWIPE_START_THRESHOLD])
      .onStart(() => {
        "worklet";
        cancelAnimation(translateX);
        didSettle.value = false;
        baseOffset.value = clamp(translateX.value);
        scheduleOnRN(onGrant, baseOffset.value);
      })
      .onUpdate(e => {
        "worklet";
        translateX.value = clamp(baseOffset.value + e.translationX);
      })
      .onEnd(e => {
        "worklet";
        const current = clamp(baseOffset.value + e.translationX);
        didSettle.value = true;
        scheduleOnRN(settleAt, current, e.velocityX);
      })
      .onFinalize(e => {
        "worklet";
        if (!didSettle.value) {
          const current = clamp(baseOffset.value + e.translationX);
          scheduleOnRN(settleAt, current, e.velocityX);
        }
        didSettle.value = false;
      });
  }, [leftWidth, rightWidth, props.onRequestCloseOthers]);

  const shellAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }]
  }));

  function renderActionButton(action: ConversationSwipeAction) {
    return (
      <Pressable
        key={action.key}
        onPress={() => handleActionPress(action)}
        style={styles.conversationSwipeAction}
      >
        <View
          style={[
            styles.conversationSwipeActionCircle,
            { backgroundColor: action.circleColor }
          ]}
        >
          {action.iconSet === "lucide" ? (
            <Lucide
              name={action.icon as LucideIconName}
              color={action.tintColor}
              size={20}
            />
          ) : (
            <Ionicons color={action.tintColor} name={action.icon} size={20} />
          )}
        </View>
        <Text style={styles.conversationSwipeActionLabel}>{action.label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.conversationSwipeRow}>
      <View
        pointerEvents="box-none"
        style={styles.conversationSwipeActionsSurface}
      >
        {leftWidth > 0 ? (
          <View
            style={[
              styles.conversationSwipeTrack,
              styles.conversationSwipeTrackLeft,
              { width: leftWidth }
            ]}
          >
            <View style={styles.conversationSwipeTray}>
              {props.leftActions.map(renderActionButton)}
            </View>
          </View>
        ) : null}
        {rightWidth > 0 ? (
          <View
            style={[
              styles.conversationSwipeTrack,
              styles.conversationSwipeTrackRight,
              { width: rightWidth }
            ]}
          >
            <View style={styles.conversationSwipeTray}>
              {props.rightActions.map(renderActionButton)}
            </View>
          </View>
        ) : null}
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[styles.conversationSwipeShell, shellAnimatedStyle]}
        >
          <View style={styles.conversationSwipeCard}>
            <ConversationRow
              conversation={props.conversation}
              loginUserId={props.loginUserId}
              peerPresence={props.peerPresence}
              groupReadState={props.groupReadState}
              typers={props.typers}
              isReceiptsEnabled={props.isReceiptsEnabled}
              onLongPress={props.onLongPress}
              onPress={handleRowPress}
            />
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
});
