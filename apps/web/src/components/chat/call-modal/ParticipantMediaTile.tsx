import { AudioMutedOutlined, VideoCameraOutlined } from "@ant-design/icons";
import { useEffect, useRef } from "react";
import { hasTrack } from "./callModalUtils";
import { useTranslation } from "react-i18next";

export interface ParticipantMediaTileProps {
  label: string;
  stream: MediaStream | null;
  muted?: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  waitingLabel: string;
  isSelf?: boolean;
  isSpeaking?: boolean;
}

/**
 * 群通话网格中的单个成员瓦片：有 live 视频轨且未关摄像头时渲染视频，否则回退
 * 头像 + 等待文案；语音轨在不显示视频时单独挂 `<audio>` 播放。
 */
export function ParticipantMediaTile({
  label,
  stream,
  muted = false,
  audioEnabled,
  videoEnabled,
  waitingLabel,
  isSelf = false,
  isSpeaking = false
}: ParticipantMediaTileProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const showVideo = hasTrack(stream, "video") && videoEnabled;
  const showAudio = hasTrack(stream, "audio");

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    if (audioRef.current) {
      audioRef.current.srcObject = showVideo ? null : stream;
    }
  }, [showVideo, stream]);

  return (
    <div
      className={"im-call-tile" + (isSpeaking ? " im-call-tile-speaking" : "")}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted={muted}
          playsInline
          className="im-call-tile-video"
        />
      ) : (
        <div className="im-call-tile-fallback">
          <div className="im-call-avatar">
            {(label || "?").trim().slice(0, 1).toUpperCase()}
          </div>
          <div className="im-call-tile-waiting">{waitingLabel}</div>
        </div>
      )}
      {!showVideo && showAudio && !muted ? (
        <audio ref={audioRef} autoPlay playsInline />
      ) : null}

      {isSelf ? (
        <span className="im-call-tile-self-badge">
          {t("ui.callOverlay.me")}
        </span>
      ) : null}

      <div className="im-call-tile-footer">
        <span className="im-call-tile-name">{label}</span>
        <span className="im-call-tile-mute-group">
          {!audioEnabled ? (
            <span
              className="im-call-tile-mute-badge"
              title={t("ui.callOverlay.micOff")}
              aria-label={t("ui.callOverlay.micOff")}
            >
              <AudioMutedOutlined />
            </span>
          ) : null}
          {!videoEnabled ? (
            <span
              className="im-call-tile-mute-badge"
              title={t("ui.callOverlay.camOff")}
              aria-label={t("ui.callOverlay.camOff")}
            >
              <VideoCameraOutlined />
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
