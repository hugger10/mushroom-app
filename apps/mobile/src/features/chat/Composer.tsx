import { useEffect, useMemo, useRef, useState } from "react";
import i18next from "i18next";
import {
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputSelectionChangeEvent
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  interpolateColor,
  runOnJS,
  withRepeat,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming
} from "react-native-reanimated";
import { hapticDelete, hapticMedium } from "../../platform/haptics";
import { recordingSoundPlayer } from "../../platform/recording-sounds";
import { useAppTheme } from "../../styles/app-styles";
import { useLocalVoiceRecording } from "./useLocalVoiceRecording";
import { VoiceRecordingPill } from "./VoiceRecordingPill";

export type MobileComposerMode = "normal" | "muted-all" | "muted-self";
export type VoiceRecordingState =
  | "idle"
  | "recording"
  | "sliding"
  | "cancelled";

const SWIPE_CANCEL_THRESHOLD_PX = 120;
const LONG_PRESS_DELAY_MS = 1000;
const CANCEL_ANIMATION_MS = 1650;
const MIC_DROP_ANIMATION_MS = 1600;

const AnimatedMicIcon = Animated.createAnimatedComponent(Ionicons);

export function Composer(props: {
  composerText: string;
  onChangeComposerText: (value: string) => void;
  onComposerSelectionChange: (event: TextInputSelectionChangeEvent) => void;
  pending: boolean;
  canSendText: boolean;
  composerMode?: MobileComposerMode;
  onSendMessage: () => void;
  onStartVoiceRecording: () => void;
  onStopVoiceRecording: (durationMs: number) => void;
  onCancelVoiceRecording: () => void;
  onOpenAttachments: () => void;
}) {
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const recording = useLocalVoiceRecording({
    onStart: props.onStartVoiceRecording,
    onStop: props.onStopVoiceRecording,
    onCancel: props.onCancelVoiceRecording
  });
  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  const [pressing, setPressing] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const longPressActivatedRef = useRef(false);
  const cancelArmedRef = useRef(false);
  const cancelingRef = useRef(false);
  const cancelTriggeredRef = useRef(false);
  const cancelingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const dragDistance = useSharedValue(0);
  const cancelProgress = useSharedValue(0);
  const breathingProgress = useSharedValue(0);

  const voiceState: VoiceRecordingState = canceling
    ? "cancelled"
    : recording.active
      ? cancelArmed
        ? "sliding"
        : "recording"
      : pressing
        ? "recording"
        : "idle";
  const showRecordingVisual = voiceState !== "idle";

  const recordingMicAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          interpolate(cancelProgress.value, [0, 0.23], [0, -64], "clamp") +
          interpolate(cancelProgress.value, [0.45, 0.67], [0, 56], "clamp")
      },
      {
        rotate: `${interpolate(cancelProgress.value, [0.2, 0.45], [0, 180], "clamp")}deg`
      }
    ],
    opacity: interpolate(
      cancelProgress.value,
      [0.62, 0.75, 1],
      [1, 0, 0],
      "clamp"
    )
  }));

  const micColorAnimatedStyle = useAnimatedStyle(() => ({
    color:
      cancelProgress.value > 0
        ? theme.colors.danger
        : interpolateColor(
            breathingProgress.value,
            [0, 1],
            [theme.colors.dangerSoft, theme.colors.danger]
          )
  }));

  const trashTargetAnimatedStyle = useAnimatedStyle(() => {
    const dropProgress = cancelProgress.value;
    const appearProgress = interpolate(
      dropProgress,
      [0.28, 0.45],
      [0, 1],
      "clamp"
    );
    const disappearProgress = interpolate(
      dropProgress,
      [0.8, 1],
      [1, 0],
      "clamp"
    );
    return {
      opacity: appearProgress * disappearProgress,
      transform: [{ scale: 0.9 + dropProgress * 0.1 }]
    };
  });

  const trashLidAnimatedStyle = useAnimatedStyle(() => {
    const openProgress = interpolate(
      cancelProgress.value,
      [0.28, 0.45],
      [0, 1],
      "clamp"
    );
    const closeProgress = interpolate(
      cancelProgress.value,
      [0.75, 0.9],
      [0, 1],
      "clamp"
    );
    return {
      transform: [
        { translateX: -2 },
        { rotate: `${-60 * openProgress * (1 - closeProgress)}deg` }
      ]
    };
  });

  useEffect(() => {
    cancelingRef.current = canceling;
  }, [canceling]);

  useEffect(() => {
    const isBreathing = voiceState === "recording";
    if (!isBreathing) {
      cancelAnimation(breathingProgress);
      breathingProgress.value = 0;
      return;
    }

    breathingProgress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 650, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 650, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    return () => cancelAnimation(breathingProgress);
  }, [breathingProgress, voiceState]);

  useEffect(() => {
    return () => {
      if (cancelingTimerRef.current) {
        clearTimeout(cancelingTimerRef.current);
      }
    };
  }, []);

  const voiceGesture = useMemo(() => {
    const resetCancelState = () => {
      setCanceling(false);
      cancelingRef.current = false;
      // 注意：不重置 cancelTriggeredRef，它仅在 onStart 重置，
      // 防止同一次手势在复位后再次触发取消动画
      cancelArmedRef.current = false;
      setCancelArmed(false);
      longPressActivatedRef.current = false;
      dragDistance.value = 0;
      cancelProgress.value = 0;
    };

    const startCancelFlow = () => {
      if (cancelTriggeredRef.current) return;
      cancelTriggeredRef.current = true;
      cancelingRef.current = true;
      setCanceling(true);
      breathingProgress.value = 0;
      longPressActivatedRef.current = false;
      requestAnimationFrame(() => setPressing(false));
      hapticDelete();
      void recordingSoundPlayer.playRecordCancel();
      recordingRef.current.cancel();
      cancelProgress.value = withTiming(
        1,
        {
          duration: MIC_DROP_ANIMATION_MS,
          easing: Easing.linear
        },
        isFinished => {
          if (isFinished) {
            runOnJS(resetCancelState)();
          }
        }
      );
      if (cancelingTimerRef.current) {
        clearTimeout(cancelingTimerRef.current);
      }
      cancelingTimerRef.current = setTimeout(
        resetCancelState,
        CANCEL_ANIMATION_MS
      );
    };

    return Gesture.Pan()
      .runOnJS(true)
      .activateAfterLongPress(LONG_PRESS_DELAY_MS)
      .onTouchesDown(() => {
        setPressing(true);
      })
      .onTouchesUp(() => {
        if (!longPressActivatedRef.current) {
          requestAnimationFrame(() => setPressing(false));
        }
      })
      .onStart(() => {
        longPressActivatedRef.current = true;
        if (cancelingTimerRef.current) {
          clearTimeout(cancelingTimerRef.current);
          cancelingTimerRef.current = undefined;
        }
        setPressing(false);
        cancelArmedRef.current = false;
        setCancelArmed(false);
        setCanceling(false);
        cancelingRef.current = false;
        cancelTriggeredRef.current = false;
        dragDistance.value = 0;
        cancelProgress.value = 0;
        hapticMedium();
        recordingRef.current.start();
      })
      .onUpdate(e => {
        if (cancelTriggeredRef.current) return;
        const distance = Math.max(0, -e.translationX);
        dragDistance.value = distance;
        const armed = distance >= SWIPE_CANCEL_THRESHOLD_PX;
        if (armed !== cancelArmedRef.current) {
          cancelArmedRef.current = armed;
          setCancelArmed(armed);
          if (armed) {
            startCancelFlow();
          }
        }
      })
      .onEnd(e => {
        if (cancelTriggeredRef.current) {
          cancelArmedRef.current = false;
          setCancelArmed(false);
          longPressActivatedRef.current = false;
          requestAnimationFrame(() => setPressing(false));
          return;
        }
        if (e.translationX <= -SWIPE_CANCEL_THRESHOLD_PX) {
          startCancelFlow();
        } else {
          recordingRef.current.stop();
          dragDistance.value = withSpring(0);
          cancelProgress.value = withSpring(0);
        }
        cancelArmedRef.current = false;
        setCancelArmed(false);
        longPressActivatedRef.current = false;
        requestAnimationFrame(() => setPressing(false));
      })
      .onFinalize(() => {
        if (longPressActivatedRef.current) {
          recordingRef.current.cancel();
        }
        if (!cancelTriggeredRef.current) {
          dragDistance.value = withSpring(0);
          cancelProgress.value = withSpring(0);
        }
        cancelArmedRef.current = false;
        setCancelArmed(false); //
        longPressActivatedRef.current = false;
        requestAnimationFrame(() => setPressing(false));
      });
  }, []);

  const iconColor = theme.colors.composerIconMuted;
  const showSecondaryIcons = !props.canSendText;
  const composerMode: MobileComposerMode = props.composerMode ?? "normal";
  const isMuted = composerMode !== "normal";
  const mutedBannerText =
    composerMode === "muted-all"
      ? i18next.t("chat.composerMutedAll")
      : composerMode === "muted-self"
        ? i18next.t("chat.composerMutedSelf")
        : "";
  const sendDisabled = props.pending || isMuted;
  const handleSendPress = () => {
    if (isMuted || recording.active || !props.canSendText) return;
    props.onSendMessage();
  };
  const handleOpenAttachments = () => {
    if (isMuted) return;
    Keyboard.dismiss();
    props.onOpenAttachments();
  };

  return (
    <View style={{ paddingBottom: Math.max(insets.bottom, 6) }}>
      {isMuted ? (
        <View
          style={styles.composerMutedBanner}
          accessibilityRole="alert"
          testID="chat-composer-muted-banner"
        >
          <Text style={styles.composerMutedBannerText}>{mutedBannerText}</Text>
        </View>
      ) : null}
      <View style={styles.composerRow} testID="chat-composer-row">
        {showRecordingVisual ? (
          <View style={styles.composerVoiceTarget} testID="chat-voice-trash">
            <Animated.View
              style={[styles.composerVoiceMic, recordingMicAnimatedStyle]}
            >
              <AnimatedMicIcon
                name="mic"
                size={22}
                style={micColorAnimatedStyle}
              />
            </Animated.View>
            <Animated.View
              style={[styles.composerTrashTarget, trashTargetAnimatedStyle]}
            >
              <Animated.View
                style={[styles.composerTrashLid, trashLidAnimatedStyle]}
              >
                <Ionicons name="remove" size={18} color={theme.colors.danger} />
              </Animated.View>
              <Ionicons
                name="trash-outline"
                size={25}
                color={theme.colors.danger}
              />
            </Animated.View>
          </View>
        ) : null}
        <View style={styles.composerPill}>
          {showRecordingVisual ? (
            <VoiceRecordingPill
              key={
                voiceState === "recording" && !recording.active
                  ? "pressing"
                  : "recording"
              }
              mode={
                voiceState === "recording" && !recording.active
                  ? "pressing"
                  : "recording"
              }
              elapsedMs={recording.elapsedMs}
              cancelArmed={cancelArmed}
              dragDistance={dragDistance}
              breathingProgress={breathingProgress}
            />
          ) : (
            <>
              <TextInput
                value={props.composerText}
                onChangeText={props.onChangeComposerText}
                onSelectionChange={props.onComposerSelectionChange}
                multiline
                placeholder={i18next.t("chat.placeholder")}
                placeholderTextColor={theme.colors.inputPlaceholder}
                style={styles.pillInput}
                textAlignVertical="center"
                testID="chat-composer-input"
              />
              {showSecondaryIcons ? (
                <Pressable
                  style={styles.pillIcon}
                  disabled={props.pending || isMuted}
                  onPress={handleOpenAttachments}
                  testID="chat-composer-attach"
                >
                  <Ionicons
                    name="attach"
                    size={24}
                    color={iconColor}
                    style={{ transform: [{ rotate: "45deg" }] }}
                  />
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        {props.canSendText && !recording.active && !canceling ? (
          <Pressable
            style={[
              styles.primaryCircle,
              sendDisabled ? styles.primaryCircleDisabled : null
            ]}
            disabled={sendDisabled}
            onPress={handleSendPress}
            testID="chat-send-button"
          >
            <Ionicons
              name="send"
              size={20}
              color={theme.colors.textInverse}
              style={{ marginLeft: 2 }}
            />
          </Pressable>
        ) : isMuted ? (
          <View
            style={[
              styles.primaryCircle,
              sendDisabled ? styles.primaryCircleDisabled : null
            ]}
            testID="chat-voice-button"
          >
            <Ionicons name="mic" size={22} color={theme.colors.textInverse} />
          </View>
        ) : (
          <GestureDetector gesture={voiceGesture}>
            <View
              style={[
                styles.primaryCircle,
                recording.active || pressing || canceling
                  ? styles.primaryCircleRecording
                  : null,
                sendDisabled ? styles.primaryCircleDisabled : null
              ]}
              testID="chat-voice-button"
            >
              {showRecordingVisual ? null : (
                <Ionicons
                  name="mic"
                  size={22}
                  color={theme.colors.textInverse}
                />
              )}
            </View>
          </GestureDetector>
        )}
      </View>
    </View>
  );
}
