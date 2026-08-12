import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import {
  generateFakeWaveform,
  type MessageFileContent
} from "@mushroom/shared";
import type { Message } from "../../types/chat";
import {
  buildMediaCachePayload,
  hasDesktopMediaCache
} from "./messageMediaCache";
import { useTranslation } from "react-i18next";

const VOICE_WAVEFORM_BAR_COUNT = 28;
const DEFAULT_VOICE_WAVEFORM = [
  0.22, 0.44, 0.66, 0.38, 0.76, 0.54, 0.3, 0.62, 0.82, 0.48, 0.34, 0.7, 0.42,
  0.58, 0.86, 0.5, 0.28, 0.64, 0.78, 0.46, 0.32, 0.56, 0.72, 0.4, 0.6, 0.36,
  0.68, 0.52
];

function mapMediaErrorToMessage(
  err: MediaError | null | undefined,
  t: (key: string) => string
) {
  if (!err) {
    return t("messageActions.voicePlaybackFailed");
  }
  switch (err.code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return t("messageActions.voiceLoadFailed");
    case MediaError.MEDIA_ERR_DECODE:
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return t("messageActions.voiceCorrupted");
    default:
      return t("messageActions.voicePlaybackFailed");
  }
}

function formatVoiceDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0:00";
  }

  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function normalizeVoiceWaveformValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.35;
  }

  return Math.min(1, Math.max(0.12, value > 1 ? value / 100 : value));
}

function resolveVoiceWaveform(
  content: MessageFileContent,
  options: { seed: string; durationSeconds: number }
) {
  const waveform = (content as { waveform?: unknown }).waveform;
  if (Array.isArray(waveform) && waveform.length > 0) {
    const source = waveform.map(normalizeVoiceWaveformValue);
    return Array.from({ length: VOICE_WAVEFORM_BAR_COUNT }, (_, index) => {
      const sourceIndex = Math.floor(
        (index / VOICE_WAVEFORM_BAR_COUNT) * source.length
      );
      return (
        source[sourceIndex] ??
        DEFAULT_VOICE_WAVEFORM[index % DEFAULT_VOICE_WAVEFORM.length]
      );
    });
  }

  if (options.seed) {
    return generateFakeWaveform({
      seed: options.seed,
      barCount: VOICE_WAVEFORM_BAR_COUNT,
      durationSeconds: options.durationSeconds
    });
  }

  // 终极兜底：seed 也拿不到时，使用固定常量数组。
  return Array.from({ length: VOICE_WAVEFORM_BAR_COUNT }, (_, index) =>
    normalizeVoiceWaveformValue(
      DEFAULT_VOICE_WAVEFORM[index % DEFAULT_VOICE_WAVEFORM.length]
    )
  );
}

export function AudioMessageCard(props: {
  url: string;
  username: string;
  message: Message;
  content: MessageFileContent;
  title?: string;
  caption?: string;
  durationSeconds?: number;
  compactVoice?: boolean;
}) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [resolvedDurationSeconds, setResolvedDurationSeconds] = useState(
    Number(props.durationSeconds || 0)
  );

  const voiceWaveformSeed = useMemo(() => {
    const message = props.message as
      | {
          client_message_id?: unknown;
          server_message_id?: unknown;
        }
      | undefined;
    const clientId =
      typeof message?.client_message_id === "string"
        ? message.client_message_id
        : "";
    if (clientId) {
      return clientId;
    }
    const serverId =
      typeof message?.server_message_id === "string"
        ? message.server_message_id
        : "";
    if (serverId) {
      return serverId;
    }
    const url = (props.content as { url?: unknown }).url;
    if (typeof url === "string" && url.length > 0) {
      return url;
    }
    return "";
  }, [props.message, props.content]);

  const voiceWaveformDurationSeconds = Number(props.durationSeconds || 0);

  const voiceWaveform = useMemo(
    () =>
      resolveVoiceWaveform(props.content, {
        seed: voiceWaveformSeed,
        durationSeconds: voiceWaveformDurationSeconds
      }),
    [props.content, voiceWaveformSeed, voiceWaveformDurationSeconds]
  );
  const voiceDurationSeconds = Math.max(
    resolvedDurationSeconds,
    Number(props.durationSeconds || 0)
  );
  const voicePlaybackRatio =
    playing && voiceDurationSeconds > 0
      ? Math.min(1, Math.max(0, playbackPosition / voiceDurationSeconds))
      : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleEnded = () => {
      setPlaying(false);
      setPlaybackPosition(0);
      audio.currentTime = 0;
    };
    const handlePause = () => setPlaying(false);
    const handlePlaying = () => {
      setPlaying(true);
      setPlaybackError("");
    };
    const handleTimeUpdate = () => setPlaybackPosition(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setResolvedDurationSeconds(audio.duration);
      }
    };
    const handleError = () => {
      const err = audio.error;
      // 切换 src 时 load() 会中断旧请求并触发 abort，这不属于播放失败。
      if (err && err.code === MediaError.MEDIA_ERR_ABORTED) {
        return;
      }
      setPlaying(false);
      setPlaybackError(mapMediaErrorToMessage(err, t));
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("error", handleError);
    };
  }, [t]);

  async function ensureAudioSource() {
    const audio = audioRef.current;
    if (!audio) {
      throw new Error(t("messageActions.playerNotInitialized"));
    }

    if (objectUrlRef.current) {
      return objectUrlRef.current;
    }

    try {
      if (hasDesktopMediaCache()) {
        const record = await window.electronAPI.downloadMediaCache(
          buildMediaCachePayload({
            message: props.message,
            content: props.content,
            category: "voice"
          })
        );
        audio.src = record.localUrl;
        audio.load();
        return record.localUrl;
      }

      const response = await fetch(props.url);
      if (!response.ok) {
        throw new Error(
          t("messageActions.audioRequestFailed", { status: response.status })
        );
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      audio.src = objectUrl;
      audio.load();
      return objectUrl;
    } catch (err) {
      // 兜底回未鉴权的远端 URL 几乎一定会再次失败，并触发新一轮 <audio> error 事件，
      // 反而让上层难以给出准确文案。这里直接抛出，由调用方统一处理与展示。
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  async function handleTogglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (playing) {
      audio.pause();
      audio.currentTime = 0;
      setPlaybackPosition(0);
      setPlaying(false);
      return;
    }

    try {
      await ensureAudioSource();
      await audio.play();
      setPlaying(true);
      setPlaybackError("");
    } catch (err) {
      setPlaying(false);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setPlaybackError(t("messageActions.clickToPlayAgain"));
      } else {
        setPlaybackError(t("messageActions.voiceLoadFailed"));
      }
    }
  }

  function handleRetryPlayback() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
    setPlaybackError("");
    void handleTogglePlayback();
  }

  return (
    <div
      className={`im-media-message-card ${
        props.compactVoice
          ? "im-media-message-voice-card"
          : "im-media-message-audio-card"
      }`}
    >
      <audio
        ref={audioRef}
        className="im-media-message-audio-hidden"
        preload="none"
      />
      {props.compactVoice ? (
        <button
          type="button"
          className="im-voice-message-button"
          onClick={() => void handleTogglePlayback()}
          aria-label={playing ? "Stop voice message" : "Play voice message"}
        >
          <span
            className={`im-voice-message-play ${playing ? "is-playing" : ""}`}
            aria-hidden="true"
          >
            <span className="im-voice-message-speaker" />
          </span>
          <span
            className={`im-voice-message-waveform ${
              playing ? "im-voice-message-waveform-active" : ""
            }`}
            aria-hidden="true"
          >
            {voiceWaveform.map((value, index) => (
              <span
                key={`${index}-${value}`}
                className={
                  playing &&
                  (index + 1) / voiceWaveform.length <= voicePlaybackRatio
                    ? "is-played"
                    : undefined
                }
                style={{ "--voice-bar-scale": value } as CSSProperties}
              />
            ))}
          </span>
          <span className="im-voice-message-duration">
            {formatVoiceDuration(voiceDurationSeconds)}
          </span>
        </button>
      ) : (
        <button
          type="button"
          className="im-audio-message-button"
          onClick={() => void handleTogglePlayback()}
        >
          <span className="im-audio-message-play-icon" aria-hidden="true">
            {playing ? "■" : "▶"}
          </span>
          <span className="im-audio-message-info">
            <span className="im-audio-message-title">
              {props.title || "Audio"}
            </span>
            <span className="im-media-message-caption">{props.caption}</span>
          </span>
        </button>
      )}
      {playbackError ? (
        <span className="im-media-message-voice-error">
          <span className="im-media-message-caption">{playbackError}</span>
          <button
            type="button"
            className="im-media-message-voice-retry"
            onClick={handleRetryPlayback}
          >
            {t("chat.retry")}
          </button>
        </span>
      ) : null}
    </div>
  );
}
