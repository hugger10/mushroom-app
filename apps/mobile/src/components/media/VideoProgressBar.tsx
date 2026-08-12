import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import Animated, {
  useAnimatedStyle,
  useSharedValue
} from "react-native-reanimated";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { formatMediaDuration } from "@mushroom/shared";

const THUMB_SIZE = 12;

function clampRatio(value: number) {
  return Math.min(1, Math.max(0, value));
}

/**
 * 全屏视频预览底部的播放进度条：
 * - 播放/暂停按钮
 * - 可拖动 / 点击定位的进度轨道（拖动中实时跟随，松手 seek）
 * - 当前时间 / 总时长
 */
export function VideoProgressBar(props: {
  duration: number;
  currentTime: number;
  paused: boolean;
  onSeek: (seconds: number) => void;
  onTogglePlay: () => void;
}) {
  const { t } = useTranslation();
  const trackWidth = useSharedValue(0);
  const fillRatio = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (isDragging.value) return;
    const ratio =
      props.duration > 0 ? clampRatio(props.currentTime / props.duration) : 0;
    fillRatio.value = ratio;
    setScrubSeconds(null);
  }, [props.currentTime, props.duration, fillRatio, isDragging]);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin(() => {
      isDragging.value = true;
    })
    .onUpdate(event => {
      const width = trackWidth.value;
      if (width <= 0) return;
      const ratio = clampRatio(event.x / width);
      fillRatio.value = ratio;
      const dur = props.duration;
      scheduleOnRN(setScrubSeconds, dur > 0 ? Math.round(ratio * dur) : 0);
    })
    .onEnd(() => {
      const ratio = fillRatio.value;
      const dur = props.duration;
      isDragging.value = false;
      scheduleOnRN(props.onSeek, Math.round(ratio * dur));
    })
    .onFinalize(() => {
      isDragging.value = false;
    });

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillRatio.value * 100}%`
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    top: "50%",
    left: `${fillRatio.value * 100}%`,
    transform: [
      { translateX: -THUMB_SIZE / 2 },
      { translateY: -THUMB_SIZE / 2 }
    ]
  }));

  const displayedSeconds =
    scrubSeconds !== null ? scrubSeconds : props.currentTime;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={props.onTogglePlay}
        style={styles.playButton}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={props.paused ? t("ui.play") : t("ui.pause")}
      >
        <Ionicons
          name={props.paused ? "play" : "pause"}
          size={18}
          color="#ffffff"
        />
      </Pressable>

      <GestureDetector gesture={pan}>
        <View
          style={styles.track}
          onLayout={event => {
            trackWidth.value = event.nativeEvent.layout.width;
          }}
        >
          <Animated.View style={[styles.fill, fillStyle]} />
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>

      <Text style={styles.time}>
        {formatMediaDuration(displayedSeconds)} /{" "}
        {formatMediaDuration(props.duration)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  track: {
    flex: 1,
    height: 28,
    justifyContent: "center"
  },
  fill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#22c55e"
  },
  thumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: "#ffffff"
  },
  time: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontVariant: ["tabular-nums"]
  }
});
