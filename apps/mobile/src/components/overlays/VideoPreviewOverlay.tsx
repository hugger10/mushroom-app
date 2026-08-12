import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Video, { type VideoRef } from "react-native-video";
import Ionicons from "react-native-vector-icons/Ionicons";
import { refreshAttachmentUrlsAndCache } from "../../services/refresh-attachment-urls";
import { hapticMedium } from "../../platform/haptics";
import { VideoProgressBar } from "../media/VideoProgressBar";

const DISMISS_TRANSLATION = 280;

function isLocalUri(uri: string) {
  return (
    uri.startsWith("file:") ||
    uri.startsWith("blob:") ||
    uri.startsWith("data:")
  );
}
export function VideoPreviewOverlay(props: {
  previewVideoUrl: string | null;
  /** 关联的附件 upload_id；URL 过期时用它去 refresh-urls 自愈一次。 */
  uploadId?: string | null;
  /** 自愈成功后回写 SQLite 用。 */
  messageId?: string | null;
  onClose: () => void;
  onSaveToAlbum?: (uri: string) => void;
}) {
  const { t } = useTranslation();
  const animation = useSharedValue(0);
  const dismissTranslateY = useSharedValue(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(false);
  const [currentUri, setCurrentUri] = useState<string | null>(
    props.previewVideoUrl
  );
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const triedRef = useRef(false);
  const videoRef = useRef<VideoRef | null>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;

  const closeFromGesture = useCallback(() => {
    closeRef.current();
  }, []);

  // 播放/暂停切换：已播到结尾时点播放先 seek 回开头，否则从结尾续播无效。
  const handleTogglePlay = useCallback(() => {
    if (duration > 0 && currentTime >= duration - 0.5) {
      videoRef.current?.seek(0);
      setPaused(false);
    } else {
      setPaused(p => !p);
    }
  }, [currentTime, duration]);

  useEffect(() => {
    setCurrentUri(props.previewVideoUrl);
    triedRef.current = false;
    setDuration(0);
    setCurrentTime(0);
    if (props.previewVideoUrl) {
      setPaused(false);
      setError(false);
      dismissTranslateY.value = 0;
      animation.value = withTiming(1, { duration: 200 });
    } else {
      animation.value = 0;
      dismissTranslateY.value = 0;
    }
  }, [animation, dismissTranslateY, props.previewVideoUrl, props.uploadId]);

  async function refreshOnce(): Promise<string | null> {
    const id = props.uploadId;
    if (!id) return null;
    try {
      const messageId = props.messageId ?? null;
      const result = await refreshAttachmentUrlsAndCache(
        [id],
        messageId ? { messageIds: { [id]: messageId } } : undefined
      );
      return result[id]?.url ?? null;
    } catch {
      return null;
    }
  }

  function handleError() {
    if (
      !currentUri ||
      isLocalUri(currentUri) ||
      !props.uploadId ||
      triedRef.current
    ) {
      setError(true);
      return;
    }
    triedRef.current = true;
    void refreshOnce().then(next => {
      if (next) {
        setCurrentUri(next);
        setError(false);
      } else {
        setError(true);
      }
    });
  }

  function handleRetry() {
    triedRef.current = false;
    setError(false);
    void refreshOnce().then(next => {
      if (next) {
        setCurrentUri(next);
      } else {
        setError(true);
      }
    });
  }

  const containerStyle = useAnimatedStyle(() => ({
    opacity: animation.value
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dismissTranslateY.value }]
  }));

  // 下滑关闭：内容跟随手指下移、背景淡化；松手后位移/速度超过阈值
  // 则滑出并关闭，否则回弹（与图片预览 ImagePreviewOverlay 交互一致）。
  const dismissPan = Gesture.Pan()
    .onUpdate(event => {
      dismissTranslateY.value = Math.max(0, event.translationY);
    })
    .onEnd(event => {
      const shouldDismiss =
        event.translationY > DISMISS_TRANSLATION || event.velocityY > 900;
      if (shouldDismiss) {
        scheduleOnRN(hapticMedium);
        animation.value = withTiming(0, { duration: 160 });
        dismissTranslateY.value = withTiming(height, { duration: 200 }, () => {
          scheduleOnRN(closeFromGesture);
        });
      } else {
        dismissTranslateY.value = withTiming(0, { duration: 180 });
        animation.value = withTiming(1, { duration: 180 });
      }
    });

  const toggleTap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      // runOnJS(true) 让手势回调在 JS 线程执行，可直接操作 React state。
      handleTogglePlay();
    });

  const gesture = Gesture.Race(dismissPan, toggleTap);

  if (!props.previewVideoUrl) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {error || !currentUri ? (
        <View style={styles.errorWrap}>
          <Ionicons
            name="alert-circle-outline"
            size={48}
            color="rgba(255,255,255,0.6)"
          />
          <Text style={styles.errorText}>{t("ui.videoPlayFailed")}</Text>
          {props.uploadId ? (
            <Pressable style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryText}>{t("chat.retry")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.videoWrap, contentStyle]}>
            <Video
              ref={videoRef}
              source={{ uri: currentUri }}
              style={{ width, height }}
              resizeMode="contain"
              paused={paused}
              onLoad={data => setDuration(data.duration)}
              onProgress={data => setCurrentTime(data.currentTime)}
              onEnd={() => setPaused(true)}
              onError={handleError}
            />
            {paused ? (
              <View style={styles.pauseOverlay}>
                <Ionicons
                  name="play-circle"
                  size={64}
                  color="rgba(255,255,255,0.85)"
                />
              </View>
            ) : null}
          </Animated.View>
        </GestureDetector>
      )}
      {currentUri && !error ? (
        <View
          style={[
            styles.progressBarWrap,
            { bottom: Math.max(insets.bottom, 12) + 24 }
          ]}
        >
          <VideoProgressBar
            duration={duration}
            currentTime={currentTime}
            paused={paused}
            onSeek={seconds => videoRef.current?.seek(seconds)}
            onTogglePlay={handleTogglePlay}
          />
        </View>
      ) : null}
      <Pressable
        style={[styles.closeButton, { top: Math.max(insets.top + 8, 16) }]}
        onPress={props.onClose}
      >
        <Ionicons name="close" size={26} color="#ffffff" />
      </Pressable>

      {currentUri && !error && props.onSaveToAlbum ? (
        <Pressable
          style={[styles.saveButton, { top: Math.max(insets.top + 8, 16) }]}
          onPress={() => props.onSaveToAlbum!(currentUri)}
          accessibilityRole="button"
          accessibilityLabel={t("ui.saveVideoToAlbum")}
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
    backgroundColor: "#000000"
  },
  videoWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  progressBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 2
  },
  pauseOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12
  },
  errorText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    fontWeight: "600"
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  retryText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600"
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
