import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput
} from "react-native-vision-camera";

const QUICK_VIDEO_MAX_SECONDS = 30;
const QUICK_VIDEO_MIN_DURATION_MS = 1000;
const QUICK_VIDEO_BITRATE = 2_000_000;
const QUICK_VIDEO_MAX_DURATION_MS = QUICK_VIDEO_MAX_SECONDS * 1000;
const PROGRESS_GREEN = "#22c55e";

type CameraOverlayPhase = "idle" | "recording" | "processing";

export function QuickVideoCamera(props: {
  visible: boolean;
  onClose: () => void;
  onCapture: (videoPath: string, durationMs: number) => void;
  onError: (error: Error) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { hasPermission: hasCam, requestPermission: reqCam } =
    useCameraPermission();
  const { hasPermission: hasMic, requestPermission: reqMic } =
    useMicrophonePermission();
  const [permsOk, setPermsOk] = useState(false);
  const [permsCheckDone, setPermsCheckDone] = useState(false);

  useEffect(() => {
    if (!props.visible) {
      setPermsOk(false);
      setPermsCheckDone(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const camGranted = hasCam || (await reqCam());
      if (cancelled) return;
      const micGranted = hasMic || (await reqMic());
      if (cancelled) return;
      if (camGranted && micGranted) {
        setPermsOk(true);
      } else {
        propsRef.current.onError(new Error(t("ui.quickVideoPermission")));
        propsRef.current.onClose();
      }
      setPermsCheckDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.visible, hasCam, hasMic, reqCam, reqMic]);

  const device = useCameraDevice("back");

  const videoOutput = useVideoOutput({
    targetResolution: CommonResolutions.HD_16_9,
    enableAudio: true,
    targetBitRate: QUICK_VIDEO_BITRATE,
    fileType: "mp4"
  });

  const [phase, setPhase] = useState<CameraOverlayPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const phaseRef = useRef<CameraOverlayPhase>("idle");
  phaseRef.current = phase;
  const elapsedRef = useRef(0);
  const recorderRef = useRef<
    import("react-native-vision-camera").Recorder | null
  >(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const propsRef = useRef(props);
  propsRef.current = props;
  const dotOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (phase !== "recording") {
      dotOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, {
          toValue: 0.2,
          duration: 500,
          useNativeDriver: true
        }),
        Animated.timing(dotOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      dotOpacity.setValue(1);
    };
  }, [phase, dotOpacity]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, []);

  // 创建 recorder 并开始录制。
  useEffect(() => {
    if (phase !== "recording") {
      return;
    }
    let cancelled = false;
    let recorder: import("react-native-vision-camera").Recorder | null = null;

    (async () => {
      try {
        recorder = await videoOutput.createRecorder({
          maxDuration: QUICK_VIDEO_MAX_SECONDS
        });
        if (cancelled) {
          await recorder.cancelRecording().catch(() => undefined);
          return;
        }
        await recorder.startRecording(
          (filePath, reason) => {
            if (reason === "stopped" || reason === "max-duration-reached") {
              const dur = elapsedRef.current;
              setPhase("processing");
              requestAnimationFrame(() => {
                propsRef.current.onCapture(filePath, dur);
              });
            }
          },
          error => {
            propsRef.current.onError(
              error instanceof Error ? error : new Error(String(error ?? ""))
            );
            setPhase("idle");
          }
        );
        recorderRef.current = recorder;
      } catch (error) {
        propsRef.current.onError(
          error instanceof Error ? error : new Error(String(error ?? ""))
        );
        setPhase("idle");
      }
    })();

    return () => {
      cancelled = true;
      if (recorder && phaseRef.current === "recording") {
        void recorder.cancelRecording().catch(() => undefined);
      }
    };
  }, [phase, videoOutput]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    setElapsedMs(0);
    elapsedRef.current = 0;
  }, []);

  const startRecording = useCallback(() => {
    if (phaseRef.current !== "idle") return;
    clearTimer();
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 100;
      setElapsedMs(elapsedRef.current);
    }, 100);
    setPhase("recording");
  }, [clearTimer]);

  const stopRecording = useCallback(() => {
    if (phaseRef.current !== "recording") return;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    const recorder = recorderRef.current;
    if (!recorder || elapsedRef.current < QUICK_VIDEO_MIN_DURATION_MS) {
      clearTimer();
      if (recorder) {
        void recorder.cancelRecording().catch(() => undefined);
      }
      setPhase("idle");
      return;
    }
    void recorder.stopRecording().catch(() => undefined);
    setPhase("processing");
  }, [clearTimer]);

  const handleShutterPress = useCallback(() => {
    if (phaseRef.current === "idle") {
      startRecording();
    } else if (phaseRef.current === "recording") {
      stopRecording();
    }
  }, [startRecording, stopRecording]);

  const handleClose = useCallback(() => {
    if (phaseRef.current === "recording") {
      void recorderRef.current?.cancelRecording().catch(() => undefined);
      recorderRef.current = null;
      clearTimer();
    }
    setPhase("idle");
    propsRef.current.onClose();
  }, [clearTimer]);

  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={sheet.container}>
        {!permsCheckDone ? (
          <View style={sheet.loadingWrap}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : permsOk ? (
          <>
            {/* 相机预览 */}
            <Camera
              style={StyleSheet.absoluteFill}
              device={device ?? "back"}
              outputs={[videoOutput]}
              isActive
              onError={error => {
                propsRef.current.onError(
                  error instanceof Error
                    ? error
                    : new Error(String(error ?? ""))
                );
                setPhase("idle");
              }}
              resizeMode="cover"
            />

            {/* 顶部栏 */}
            <View style={[sheet.topBar, { paddingTop: insets.top + 12 }]}>
              <Pressable
                style={[sheet.closeButton, { top: insets.top + 20 }]}
                onPress={handleClose}
                testID="quick-video-close"
              >
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
              {phase === "recording" ? (
                <View style={sheet.timerPill}>
                  <Animated.View
                    style={[sheet.timerDot, { opacity: dotOpacity }]}
                  />
                  <Text style={sheet.timerText}>{formatTime(elapsedMs)}</Text>
                </View>
              ) : null}
            </View>

            {/* 底部 快门按钮 + 提示 */}
            <View
              style={[sheet.bottomBar, { paddingBottom: insets.bottom + 24 }]}
            >
              {phase === "processing" ? (
                <View style={sheet.shutterRow}>
                  <ActivityIndicator color="#fff" size="large" />
                </View>
              ) : (
                <>
                  <View style={sheet.shutterRingWrap}>
                    {phase === "recording" ? (
                      <View style={sheet.shutterBgCircle} />
                    ) : null}
                    <Pressable
                      onPress={handleShutterPress}
                      style={[
                        sheet.shutterBtn,
                        phase === "recording" ? sheet.shutterBtnRecording : null
                      ]}
                      testID="quick-video-shutter"
                    >
                      <View
                        style={[
                          sheet.shutterInner,
                          phase === "recording"
                            ? sheet.shutterInnerRecording
                            : null
                        ]}
                      />
                    </Pressable>
                    {phase === "recording" ? (
                      <ProgressRing
                        progress={Math.min(
                          elapsedMs / QUICK_VIDEO_MAX_DURATION_MS,
                          1
                        )}
                      />
                    ) : null}
                  </View>
                  <Text style={sheet.shutterHint}>
                    {phase === "idle" ? t("ui.tapToRecord") : ""}
                  </Text>
                </>
              )}
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function ProgressRing(props: { progress: number }) {
  const p = props.progress;
  const borderTop = p >= 0.25 ? PROGRESS_GREEN : "transparent";
  const borderRight = p >= 0.5 ? PROGRESS_GREEN : "transparent";
  const borderBottom = p >= 0.75 ? PROGRESS_GREEN : "transparent";
  const borderLeft = p >= 1.0 ? PROGRESS_GREEN : "transparent";

  return (
    <View
      style={[
        ringStyle.ring,
        {
          borderTopColor: borderTop,
          borderRightColor: borderRight,
          borderBottomColor: borderBottom,
          borderLeftColor: borderLeft
        }
      ]}
    />
  );
}

const ringStyle = StyleSheet.create({
  ring: {
    position: "absolute",
    top: -12,
    left: -12,
    right: -12,
    bottom: -12,
    borderRadius: 57,
    borderWidth: 4,
    borderColor: "transparent",
    pointerEvents: "none"
  }
});

const sheet = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000"
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000"
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  closeButton: {
    position: "absolute",
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    gap: 10
  },
  timerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444"
  },
  timerText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 32
  },
  shutterRingWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center"
  },
  shutterBgCircle: {
    position: "absolute",
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 49,
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  shutterRow: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center"
  },
  shutterBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  shutterBtnRecording: {
    borderColor: "transparent",
    width: 90,
    height: 90,
    borderRadius: 45
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff"
  },
  shutterInnerRecording: {
    width: 32,
    height: 32,
    borderRadius: 0,
    backgroundColor: "#EF4444"
  },
  shutterHint: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 12
  }
});
