import { Button } from "antd";
import {
  AudioMutedOutlined,
  AudioOutlined,
  ExpandOutlined,
  MinusOutlined,
  PhoneOutlined,
  VideoCameraOutlined
} from "@ant-design/icons";
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import type {
  CallUiSession,
  GroupCallParticipantMedia
} from "../../types/chat";
import { useAudioLevelSpeaking } from "../../hooks/call/useAudioLevelSpeaking";
import {
  getAvatarInitial,
  getTitle,
  MINI_AUDIO_SIZE,
  MINI_VIDEO_SIZE
} from "./call-modal/callModalUtils";
import { CallStatusText } from "./call-modal/CallStatusText";
import { ParticipantMediaTile } from "./call-modal/ParticipantMediaTile";
import { useCallVideoBinding } from "./call-modal/useCallVideoBinding";
import { useMiniDrag } from "./call-modal/useMiniDrag";
import { useTranslation } from "react-i18next";

interface CallSessionModalProps {
  callSession: CallUiSession | null;
  currentUserId?: number | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  groupParticipantMedia: GroupCallParticipantMedia[];
  groupLocalSpeaking?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onClose: () => void;
  onToggleLocalMedia?: (kind: "audio" | "video") => void;
  /**
   * 呈现形态（见 docs/architecture/realtime-call.md §12.3 / §12.5）：
   *   - "overlay"（默认，Web 浏览器端）：覆盖在主窗内的全屏遮罩 + 可拖拽
   *     in-window 浮窗。行为与历史完全一致。
   *   - "window"（Electron 独立通话窗）：整个 OS 窗口即通话面，无遮罩；
   *     「最小化」改为收缩 OS 窗口（由 onRequestWindowMinimize 驱动主进程），
   *     取代 in-window 浮窗。
   */
  displayMode?: "overlay" | "window";
  /** window 形态：当前 OS 窗口是否处于「缩小悬浮」态。 */
  windowMinimized?: boolean;
  /** window 形态：请求把 OS 窗口收缩为悬浮小窗。 */
  onRequestWindowMinimize?: () => void;
  /** window 形态：请求把 OS 窗口还原为全尺寸通话态。 */
  onRequestWindowRestore?: () => void;
}

export function CallSessionModal({
  callSession,
  localStream,
  remoteStream,
  groupParticipantMedia,
  groupLocalSpeaking = false,
  onAccept,
  onReject,
  onEnd,
  onClose,
  onToggleLocalMedia,
  displayMode = "overlay",
  windowMinimized = false,
  onRequestWindowMinimize,
  onRequestWindowRestore
}: CallSessionModalProps) {
  const { t } = useTranslation();
  const [showRemoteAsMain, setShowRemoteAsMain] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  const isWindowMode = displayMode === "window";
  // 「是否处于最小化呈现」：
  //   - overlay（Web）：由组件内部 isMinimized 驱动 in-window 浮窗；
  //   - window（Electron 独立窗）：由父级 windowMinimized 驱动（OS 窗口已收缩），
  //     组件内部 isMinimized 不参与。
  const effectiveMinimized = isWindowMode ? windowMinimized : isMinimized;

  const isVideoCall = callSession?.media_type === 2;
  const isGroupCall = callSession?.call_scope === 2;
  const miniSize = isVideoCall ? MINI_VIDEO_SIZE : MINI_AUDIO_SIZE;

  // 1:1 calls have no LiveKit active-speaker signal, so derive "is speaking"
  // from the audio stream via the Web Audio API. Group calls read speaking
  // state from LiveKit instead, so disable analysis there to avoid extra
  // AudioContexts.
  const localSpeaking = useAudioLevelSpeaking(isGroupCall ? null : localStream);
  const remoteSpeaking = useAudioLevelSpeaking(
    isGroupCall ? null : remoteStream
  );

  const {
    mainVideoCb,
    previewVideoCb,
    miniVideoCb,
    remoteAudioCb,
    mainVideoStream,
    previewVideoStream
  } = useCallVideoBinding({
    localStream,
    remoteStream,
    showRemoteAsMain,
    effectiveMinimized
  });

  const { miniContainerRef, resetMiniPos, miniStyle, dragProps } = useMiniDrag({
    isWindowMode,
    isMinimized,
    miniSize
  });

  // Reset minimize state whenever a new call starts (call_id changes).
  const callId = callSession?.call_id ?? null;
  useEffect(() => {
    setIsMinimized(false);
    resetMiniPos();
  }, [callId, resetMiniPos]);

  useEffect(() => {
    setShowRemoteAsMain(Boolean(remoteStream));
  }, [remoteStream]);

  // ESC key handling. Mirrors the mask-click behavior to keep keyboard and
  // pointer affordances in sync:
  //   - full screen + ringing/ongoing  -> minimize (avoid accidental hang-up)
  //   - full screen + terminal phase   -> close
  //   - minimized                      -> no-op (avoid accidental hang-up)
  useEffect(() => {
    if (!callSession || effectiveMinimized) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const phase = callSession.phase;
      const active = phase === "ringing" || phase === "ongoing";
      if (active) {
        if (isWindowMode) {
          onRequestWindowMinimize?.();
        } else {
          setIsMinimized(true);
        }
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    callSession,
    effectiveMinimized,
    isWindowMode,
    onRequestWindowMinimize,
    onClose
  ]);

  // window 形态：双击通话面在最大化 / ongoing 尺寸间切换（桌面窗口双击习惯）。
  // 双击落在按钮等交互控件上时不触发（target 命中 button 则忽略）。
  const handleSurfaceDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isWindowMode) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input")) {
      return;
    }
    void window.electronAPI?.callWindowControl?.("toggle-maximize");
  };

  if (!callSession) {
    return null;
  }

  const isIncomingRinging =
    callSession.direction === "incoming" && callSession.phase === "ringing";
  const isOngoing = callSession.phase === "ongoing";
  const canHangUp =
    callSession.phase === "ringing" || callSession.phase === "ongoing";
  const canMinimize = canHangUp;
  const canSwitchVideo = Boolean(localStream && remoteStream);
  const actionLabel = isOngoing
    ? t("ui.callOverlay.hangUp")
    : t("ui.callOverlay.cancelCall");
  const avatarInitial = getAvatarInitial(callSession.conversation_label);

  const callActionBar = (
    <div className="im-call-action-bar">
      {isIncomingRinging ? (
        <>
          <button
            type="button"
            className="im-call-control im-call-control-danger"
            onClick={onReject}
            aria-label={t("ui.callOverlay.reject")}
          >
            <span className="im-call-control-icon">
              <PhoneOutlined />
            </span>
            <span className="im-call-control-label">
              {t("ui.callOverlay.reject")}
            </span>
          </button>
          <button
            type="button"
            className="im-call-control im-call-control-accept"
            onClick={onAccept}
            aria-label={t("ui.callOverlay.accept")}
          >
            <span className="im-call-control-icon">
              <PhoneOutlined />
            </span>
            <span className="im-call-control-label">
              {t("ui.callOverlay.accept")}
            </span>
          </button>
        </>
      ) : canHangUp ? (
        <button
          type="button"
          className="im-call-control im-call-control-danger"
          onClick={onEnd}
          aria-label={actionLabel}
        >
          <span className="im-call-control-icon">
            <PhoneOutlined />
          </span>
          <span className="im-call-control-label">{actionLabel}</span>
        </button>
      ) : (
        <Button type="primary" onClick={onClose}>
          {t("common.close")}
        </Button>
      )}
    </div>
  );

  // Mic/camera toggle controls, shown during an ongoing call. The camera button
  // only appears for video calls (audio calls cannot add a camera mid-call;
  // toggling only flips existing tracks). Mirrors the mobile call overlay.
  const showMediaControls =
    isOngoing && Boolean(onToggleLocalMedia) && !isIncomingRinging;
  const micEnabled = callSession.local_audio_enabled !== false;
  const cameraEnabled = callSession.local_video_enabled !== false;
  const mediaControlBar = showMediaControls ? (
    <div className="im-call-media-bar">
      <button
        type="button"
        className={
          "im-call-media-btn" + (micEnabled ? "" : " im-call-media-btn-off")
        }
        onClick={() => onToggleLocalMedia?.("audio")}
        aria-label={
          micEnabled ? t("ui.callOverlay.micOff") : t("ui.callOverlay.micOn")
        }
        title={
          micEnabled ? t("ui.callOverlay.micOff") : t("ui.callOverlay.micOn")
        }
      >
        {micEnabled ? <AudioOutlined /> : <AudioMutedOutlined />}
      </button>
      {isVideoCall ? (
        <button
          type="button"
          className={
            "im-call-media-btn" +
            (cameraEnabled ? "" : " im-call-media-btn-off")
          }
          onClick={() => onToggleLocalMedia?.("video")}
          aria-label={
            cameraEnabled
              ? t("ui.callOverlay.camOff")
              : t("ui.callOverlay.camOn")
          }
          title={
            cameraEnabled
              ? t("ui.callOverlay.camOff")
              : t("ui.callOverlay.camOn")
          }
        >
          <VideoCameraOutlined />
        </button>
      ) : null}
    </div>
  ) : null;

  const handleMinimizeClick = () => {
    if (!canMinimize) {
      return;
    }
    if (isWindowMode) {
      onRequestWindowMinimize?.();
    } else {
      setIsMinimized(true);
    }
  };
  const handleRestoreClick = () => {
    if (isWindowMode) {
      onRequestWindowRestore?.();
    } else {
      setIsMinimized(false);
    }
  };
  // Clicking the dimmed mask minimizes the call instead of closing it, to
  // avoid accidental hang-up. Matches WeChat/WhatsApp desktop behavior.
  // For terminal phases (no `canMinimize`) we fall back to `onClose`.
  // window 形态没有遮罩，此回调不会被触发。
  const handleOverlayMaskClick = () => {
    if (canMinimize) {
      setIsMinimized(true);
    } else {
      onClose();
    }
  };

  const topbarMinimizeButton = canMinimize ? (
    <button
      type="button"
      className="im-call-minimize-btn"
      onClick={handleMinimizeClick}
      aria-label={t("ui.callOverlay.minimizeCallWindow")}
      title={t("ui.callOverlay.minimize")}
    >
      <MinusOutlined />
    </button>
  ) : null;

  const fullStage = isGroupCall ? (
    <div className="im-call-group-shell">
      {topbarMinimizeButton}
      <div className="im-call-topbar">
        <div>
          <div className="im-call-peer-name">{getTitle(callSession)}</div>
          <div className="im-call-status">
            <CallStatusText callSession={callSession} />
          </div>
        </div>
      </div>
      <div className="im-call-group-grid">
        <ParticipantMediaTile
          label={t("ui.callOverlay.me")}
          stream={localStream}
          muted
          audioEnabled={Boolean(callSession.local_audio_enabled)}
          videoEnabled={Boolean(callSession.local_video_enabled)}
          waitingLabel={
            isVideoCall
              ? t("ui.callOverlay.localCameraNotReady")
              : t("ui.callOverlay.localMicNotReady")
          }
          isSelf
          isSpeaking={groupLocalSpeaking}
        />

        {groupParticipantMedia.map(participant => (
          <ParticipantMediaTile
            key={participant.participant_identity}
            label={participant.display_name}
            stream={participant.stream}
            audioEnabled={participant.audio_enabled}
            videoEnabled={participant.video_enabled}
            isSpeaking={participant.is_speaking}
            waitingLabel={
              participant.video_enabled
                ? t("ui.callOverlay.waitingRemoteVideo")
                : participant.audio_enabled
                  ? t("ui.callOverlay.audioConnectedWaitingVideo")
                  : t("ui.callOverlay.receiveOnlyMode")
            }
          />
        ))}
      </div>
      {mediaControlBar}
      {callActionBar}
    </div>
  ) : isVideoCall ? (
    <div className="im-call-video-stage">
      {topbarMinimizeButton}
      <div className="im-call-topbar">
        <div>
          <div className="im-call-peer-name">
            {callSession.conversation_label}
          </div>
          <div className="im-call-status">
            <CallStatusText callSession={callSession} />
          </div>
        </div>
      </div>

      <div className="im-call-main-video">
        {mainVideoStream ? (
          <video
            ref={mainVideoCb}
            autoPlay
            muted={mainVideoStream === localStream}
            playsInline
            className={
              "im-call-video" +
              ((
                mainVideoStream === localStream ? localSpeaking : remoteSpeaking
              )
                ? " im-call-video-speaking"
                : "")
            }
          />
        ) : (
          <div className="im-call-video-fallback">
            <div className="im-call-avatar">{avatarInitial}</div>
          </div>
        )}
      </div>

      {previewVideoStream ? (
        <button
          type="button"
          className={
            "im-call-self-preview" +
            ((
              previewVideoStream === localStream
                ? localSpeaking
                : remoteSpeaking
            )
              ? " im-call-self-preview-speaking"
              : "")
          }
          onClick={() => canSwitchVideo && setShowRemoteAsMain(value => !value)}
          aria-label={t("ui.callOverlay.toggleCallView")}
        >
          <video
            ref={previewVideoCb}
            autoPlay
            muted={previewVideoStream === localStream}
            playsInline
            className="im-call-video"
          />
        </button>
      ) : null}

      {mediaControlBar}
      {callActionBar}
    </div>
  ) : (
    <div className="im-call-audio-stage">
      {topbarMinimizeButton}
      <audio ref={remoteAudioCb} autoPlay playsInline />
      <div className="im-call-topbar im-call-audio-topbar">
        <AudioOutlined />
      </div>
      <div className="im-call-audio-identity">
        <div
          className={
            "im-call-avatar im-call-audio-avatar" +
            (remoteSpeaking ? " im-call-audio-avatar-speaking" : "")
          }
        >
          {avatarInitial}
        </div>
        <div className="im-call-peer-name">
          {callSession.conversation_label}
        </div>
        <div className="im-call-status im-call-audio-timer">
          <CallStatusText callSession={callSession} />
        </div>
      </div>
      {mediaControlBar}
      {callActionBar}
    </div>
  );

  const overlayClassName =
    "im-call-overlay" + (isMinimized ? " im-call-overlay-hidden" : "");
  const panelVariant = isGroupCall ? "group" : isVideoCall ? "video" : "audio";

  // window 形态（Electron 独立通话窗）：整个 OS 窗口即通话面，不需要遮罩 /
  // 居中容器；最小化由主进程收缩 OS 窗口实现，故 fullStage 在非最小化时直接
  // 平铺填满窗口。
  const overlay = isWindowMode ? (
    !effectiveMinimized ? (
      <div
        className="im-call-window-surface"
        data-variant={panelVariant}
        role="dialog"
        aria-modal="true"
        onDoubleClick={handleSurfaceDoubleClick}
      >
        {fullStage}
      </div>
    ) : null
  ) : (
    <div
      className={overlayClassName}
      role="dialog"
      aria-modal="true"
      aria-hidden={isMinimized}
    >
      <div
        className="im-call-overlay-mask"
        onClick={handleOverlayMaskClick}
        aria-hidden="true"
      />
      <div className="im-call-overlay-panel" data-variant={panelVariant}>
        {fullStage}
      </div>
    </div>
  );

  const miniClassName =
    "im-call-mini" +
    (isVideoCall ? " im-call-mini-video" : " im-call-mini-audio") +
    // window 形态：浮窗内嵌填满 OS 小窗，无 fixed 定位 / 无拖拽。
    (isWindowMode ? " im-call-mini-embedded" : "");

  const miniWindow = effectiveMinimized ? (
    <div
      ref={miniContainerRef}
      className={miniClassName}
      style={miniStyle}
      {...dragProps}
      role="dialog"
      aria-label={t("ui.callOverlay.callFloatingWindow")}
    >
      {isVideoCall ? (
        <div className="im-call-mini-video-wrap">
          {remoteStream ? (
            <video
              ref={miniVideoCb}
              autoPlay
              playsInline
              className="im-call-video"
            />
          ) : (
            <div className="im-call-video-fallback">
              <div className="im-call-avatar">{avatarInitial}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="im-call-mini-audio-body">
          <div className="im-call-avatar im-call-mini-avatar">
            {avatarInitial}
          </div>
        </div>
      )}

      <div className="im-call-mini-meta">
        <div
          className="im-call-mini-name"
          title={callSession.conversation_label}
        >
          {callSession.conversation_label}
        </div>
        <div className="im-call-mini-status">
          <CallStatusText callSession={callSession} />
        </div>
      </div>

      <div className="im-call-mini-actions">
        {isIncomingRinging ? (
          <>
            <button
              type="button"
              className="im-call-mini-btn im-call-mini-btn-danger"
              onClick={onReject}
              aria-label={t("ui.callOverlay.reject")}
              title={t("ui.callOverlay.reject")}
            >
              <PhoneOutlined />
            </button>
            <button
              type="button"
              className="im-call-mini-btn im-call-mini-btn-accept"
              onClick={onAccept}
              aria-label={t("ui.callOverlay.accept")}
              title={t("ui.callOverlay.accept")}
            >
              <PhoneOutlined />
            </button>
          </>
        ) : canHangUp ? (
          <button
            type="button"
            className="im-call-mini-btn im-call-mini-btn-danger"
            onClick={onEnd}
            aria-label={actionLabel}
            title={actionLabel}
          >
            <PhoneOutlined />
          </button>
        ) : null}
        <button
          type="button"
          className="im-call-mini-btn im-call-mini-btn-restore"
          onClick={handleRestoreClick}
          aria-label={t("ui.callOverlay.restoreCallWindow")}
          title={t("ui.callOverlay.restore")}
        >
          <ExpandOutlined />
        </button>
      </div>
    </div>
  ) : null;

  if (typeof document === "undefined") {
    return (
      <>
        {overlay}
        {miniWindow}
      </>
    );
  }

  return createPortal(
    <>
      {overlay}
      {miniWindow}
    </>,
    document.body
  );
}
