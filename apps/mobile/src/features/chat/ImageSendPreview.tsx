import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Video, { ViewType, type VideoRef } from "react-native-video";
import { bytesToMB } from "@mushroom/shared";
import type { PickedMediaAsset } from "../../platform/native-pickers";
import { extractVideoThumbnail } from "../../media/extractVideoThumbnail";
import { VideoProgressBar } from "../../components/media/VideoProgressBar";

/**
 * Fullscreen "preview & confirm send" screen for images / videos picked from
 * the gallery or shot with the camera. Mirrors WeChat/Telegram behaviour:
 *
 * - Tap the back arrow at the top-left to cancel (silent — no toast)
 * - Toggle "原图（X.X MB）" at the bottom-left for image assets (videos hide it)
 * - Tap the green "发送" button at the bottom-right to upload + send
 * - Videos play in place: tap the ▶ badge to start, tap the video to pause/resume
 *
 * 短视频在确认预览页内就地播放，不再跳转到其它页面。
 * 顶部"返回 / 发送"始终常驻，播放不阻塞发送。Android 上使用
 * `viewType={ViewType.TEXTURE}` 让 ExoPlayer 以 TextureView 渲染，
 * 避免 Dialog 内 SurfaceView 合成黑屏。
 * 首帧缩略图通过 `extractVideoThumbnail` 异步抽取。
 *
 * Visibility, the pending asset and the "send as original" flag are all
 * managed in `useChatInteractionState` so this component stays presentational.
 */
export function ImageSendPreview(props: {
  visible: boolean;
  asset: PickedMediaAsset | null;
  sendImageAsOriginal: boolean;
  pending: boolean;
  sendButtonPlacement?: "bottom" | "top";
  onToggleSendImageAsOriginal: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const asset = props.asset;
  const isVideo = Boolean(asset?.type?.startsWith("video/"));
  const sendButtonPlacement = props.sendButtonPlacement ?? "bottom";
  const originalSizeText =
    asset?.size && asset.size > 0
      ? `（${bytesToMB(asset.size).toFixed(1)} MB）`
      : "";

  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef<VideoRef | null>(null);

  useEffect(() => {
    setPlaying(false);
    setPaused(false);
    setVideoFailed(false);
    setThumbUri(null);
    setDuration(0);
    setCurrentTime(0);
    if (!props.visible || !isVideo || !asset?.uri) {
      return;
    }
    let cancelled = false;
    void extractVideoThumbnail(asset.uri).then(thumb => {
      if (!cancelled && thumb?.uri) {
        setThumbUri(thumb.uri);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props.visible, isVideo, asset?.uri]);

  const startPlayback = () => {
    setVideoFailed(false);
    setPaused(false);
    setPlaying(true);
  };

  // 播放/暂停切换：已播到结尾时点播放先 seek 回开头，否则从结尾续播无效。
  const handleTogglePlay = useCallback(() => {
    if (duration > 0 && currentTime >= duration - 0.5) {
      videoRef.current?.seek(0);
      setPaused(false);
    } else {
      setPaused(p => !p);
    }
  }, [currentTime, duration]);

  return (
    <Modal
      visible={props.visible && asset !== null}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onCancel}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.container} testID="chat-image-send-preview">
        <View
          style={[styles.topBar, { paddingTop: insets.top + 8 }]}
          pointerEvents="box-none"
        >
          <Pressable
            style={styles.iconButton}
            onPress={props.onCancel}
            disabled={props.pending}
            testID="chat-image-send-preview-cancel"
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          {sendButtonPlacement === "top" ? (
            <View style={styles.topBarSpacer} />
          ) : null}
          {sendButtonPlacement === "top" ? (
            <Pressable
              onPress={props.onConfirm}
              disabled={props.pending || !asset}
              style={[
                styles.sendButton,
                (props.pending || !asset) && styles.sendButtonDisabled
              ]}
              testID="chat-image-send-preview-send"
            >
              {props.pending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendButtonText}>{t("chat.send")}</Text>
              )}
            </Pressable>
          ) : null}
        </View>

        {isVideo ? (
          playing && !videoFailed ? (
            <View style={styles.videoPlayerWrap}>
              <Pressable
                style={styles.videoPlayerPressable}
                onPress={handleTogglePlay}
                testID="chat-image-send-preview-video-player"
              >
                <Video
                  ref={videoRef}
                  source={{ uri: asset!.uri }}
                  style={styles.videoPlayer}
                  resizeMode="contain"
                  paused={paused}
                  viewType={ViewType.TEXTURE}
                  onLoad={data => setDuration(data.duration)}
                  onProgress={data => setCurrentTime(data.currentTime)}
                  onEnd={() => setPaused(true)}
                  onError={() => {
                    setPaused(false);
                    setVideoFailed(true);
                  }}
                />
                {paused ? (
                  <View style={styles.videoPausedOverlay}>
                    <Ionicons
                      name="play-circle"
                      size={64}
                      color="rgba(255,255,255,0.85)"
                    />
                  </View>
                ) : null}
              </Pressable>
              <View
                style={[
                  styles.progressBarWrap,
                  {
                    bottom:
                      sendButtonPlacement === "top"
                        ? Math.max(insets.bottom, 12) + 20
                        : Math.max(insets.bottom, 12) + 64
                  }
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
            </View>
          ) : (
            <View style={styles.imageWrap}>
              {thumbUri ? (
                <Image
                  source={{ uri: thumbUri }}
                  style={styles.image}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              {videoFailed ? (
                <Pressable
                  style={styles.videoFailedWrap}
                  onPress={startPlayback}
                  testID="chat-image-send-preview-play-retry"
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={40}
                    color="rgba(255,255,255,0.7)"
                  />
                  <Text style={styles.videoFailedText}>
                    {t("chatMessage.videoPlayFailedRetry")}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.videoBadge,
                    pressed && { opacity: 0.7 }
                  ]}
                  onPress={startPlayback}
                  testID="chat-image-send-preview-play"
                >
                  <Ionicons name="play" size={28} color="#fff" />
                </Pressable>
              )}
            </View>
          )
        ) : (
          <View style={styles.imageWrap}>
            {asset?.uri ? (
              <Image
                source={{ uri: asset.uri }}
                style={styles.image}
                resizeMode="contain"
              />
            ) : null}
          </View>
        )}

        {sendButtonPlacement === "bottom" ? (
          <View
            style={[
              styles.bottomBar,
              { paddingBottom: Math.max(insets.bottom, 12) + 12 }
            ]}
          >
            {isVideo ? (
              <View style={styles.originalToggleSpacer} />
            ) : (
              <Pressable
                onPress={props.onToggleSendImageAsOriginal}
                disabled={props.pending}
                style={styles.originalToggle}
                testID="chat-image-send-preview-original-toggle"
              >
                <Ionicons
                  name={
                    props.sendImageAsOriginal ? "checkbox" : "square-outline"
                  }
                  size={20}
                  color={props.sendImageAsOriginal ? "#22c55e" : "#fff"}
                />
                <Text style={styles.originalToggleText}>
                  {t("chat.openOriginal")}
                  {originalSizeText}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={props.onConfirm}
              disabled={props.pending || !asset}
              style={[
                styles.sendButton,
                (props.pending || !asset) && styles.sendButtonDisabled
              ]}
              testID="chat-image-send-preview-send"
            >
              {props.pending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendButtonText}>{t("chat.send")}</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000"
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center"
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  topBarSpacer: {
    flex: 1
  },
  imageWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  image: {
    width: "100%",
    height: "100%"
  },
  imagePlaceholder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000"
  },
  videoPlayerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  videoPlayerPressable: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  videoPlayer: {
    width: "100%",
    height: "100%"
  },
  progressBarWrap: {
    position: "absolute",
    left: 0,
    right: 0
  },
  videoPausedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  videoBadge: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center"
  },
  videoFailedWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#000"
  },
  videoFailedText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    fontWeight: "600"
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  originalToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4
  },
  originalToggleSpacer: {
    flex: 0
  },
  originalToggleText: {
    color: "#fff",
    fontSize: 14
  },
  sendButton: {
    minWidth: 64,
    height: 32,
    borderRadius: 6,
    paddingHorizontal: 14,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center"
  },
  sendButtonDisabled: {
    opacity: 0.6
  },
  sendButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600"
  }
});
