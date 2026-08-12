import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useAppTheme } from "../../styles/app-styles";

export type VoicePillMode = "pressing" | "recording";

function SwipeHintGroup(props: {
  color: string;
  dragDistance?: SharedValue<number>;
}) {
  const { t } = useTranslation();
  const { styles } = useAppTheme();

  const animatedStyle = useAnimatedStyle(() => {
    const d = props.dragDistance?.value ?? 0;
    return {
      transform: [{ translateX: -d }],
      opacity: interpolate(d, [0, 80], [1, 0], "clamp")
    };
  });

  return (
    <Animated.View style={[styles.voicePillHintGroup, animatedStyle]}>
      <Text style={styles.voicePillSwipeHint} numberOfLines={1}>
        {t("chatMessage.swipeToCancel")}
      </Text>
      <Ionicons name="arrow-back" size={16} color={props.color} />
    </Animated.View>
  );
}

export function VoiceRecordingPill(props: {
  mode: VoicePillMode;
  elapsedMs: number;
  cancelArmed?: boolean;
  dragDistance?: SharedValue<number>;
  breathingProgress?: SharedValue<number>;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const [tick, setTick] = useState(0);
  const latestElapsedMsRef = useRef(props.elapsedMs);
  latestElapsedMsRef.current = props.elapsedMs;
  const [frozenSeconds, setFrozenSeconds] = useState(0);

  useEffect(() => {
    if (props.mode !== "recording" || props.cancelArmed === true) return;
    const interval = setInterval(() => {
      setTick(t => (t + 1) % 30);
    }, 50);
    return () => clearInterval(interval);
  }, [props.mode, props.cancelArmed]);

  useEffect(() => {
    if (props.cancelArmed === true) {
      setFrozenSeconds(Math.floor(latestElapsedMsRef.current / 1000));
    }
  }, [props.cancelArmed]);

  if (props.mode === "pressing") {
    return (
      <View style={styles.voicePillPressingRow}>
        <View style={styles.voicePillPressingDot} />
        <Text style={styles.voicePillPressingText}>
          {t("chatMessage.holdToRecord")}
        </Text>
      </View>
    );
  }

  const cancelArmed = props.cancelArmed === true;
  const seconds = cancelArmed
    ? frozenSeconds
    : Math.floor(props.elapsedMs / 1000);
  const indicatorColor = theme.colors.danger;

  const barsOpacityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      props.dragDistance?.value ?? 0,
      [0, 80],
      [1, 0],
      "clamp"
    )
  }));

  const secondsColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      props.breathingProgress?.value ?? 0,
      [0, 1],
      [theme.colors.dangerSoft, theme.colors.danger]
    )
  }));

  return (
    <View style={styles.voicePillRecordingRow}>
      <Animated.Text
        style={[styles.voicePillDuration, barsOpacityStyle, secondsColorStyle]}
        numberOfLines={1}
      >
        {seconds}"
      </Animated.Text>
      <Animated.View style={[styles.voicePillBarsRow, barsOpacityStyle]}>
        {Array.from({ length: 16 }).map((_, i) => {
          const phase = (tick / 18) * Math.PI * 2;
          const wave = Math.sin(phase + (i / 16) * Math.PI * 2);
          const height = 6 + 14 * (0.5 + 0.5 * wave);
          return (
            <View
              key={i}
              style={[
                styles.voicePillBar,
                {
                  height,
                  backgroundColor: indicatorColor,
                  opacity: 0.6 + 0.4 * (0.5 + 0.5 * wave)
                }
              ]}
            />
          );
        })}
      </Animated.View>
      <SwipeHintGroup
        color={indicatorColor}
        dragDistance={props.dragDistance}
      />
    </View>
  );
}
