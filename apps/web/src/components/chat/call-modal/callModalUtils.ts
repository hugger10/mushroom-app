import type { CallUiSession } from "../../../types/chat";
import { i18n } from "../../../i18n";

export type MiniPosition = { x: number; y: number };

export const MINI_MARGIN = 16;
export const MINI_VIDEO_SIZE = { width: 288, height: 200 };
export const MINI_AUDIO_SIZE = { width: 288, height: 132 };

export function getPhaseLabel(callSession: CallUiSession) {
  switch (callSession.phase) {
    case "ringing":
      return callSession.direction === "incoming"
        ? i18n.t("ui.callStatus.incoming")
        : i18n.t("ui.callStatus.waiting");
    case "ongoing":
      return i18n.t("ui.callStatus.ongoing");
    case "busy":
      return i18n.t("ui.callStatus.busy");
    case "rejected":
      return i18n.t("ui.callStatus.rejected");
    case "timeout":
      return i18n.t("ui.callStatus.timeout");
    default:
      return i18n.t("ui.callStatus.ended");
  }
}

export function getTitle(callSession: CallUiSession) {
  const mediaLabel =
    callSession.media_type === 1
      ? i18n.t("ui.callMedia.voice")
      : i18n.t("ui.callMedia.video");
  return `${mediaLabel} · ${callSession.conversation_label}`;
}

export function hasTrack(stream: MediaStream | null, kind: "audio" | "video") {
  if (!stream) {
    return false;
  }

  return stream
    .getTracks()
    .some(track => track.kind === kind && track.readyState === "live");
}

export function getCallTimerAnchor(callSession: CallUiSession) {
  return callSession.session.answered_at || callSession.session.started_at;
}

export function formatCallDuration(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

export function getAvatarInitial(label: string) {
  return (label || "?").trim().slice(0, 1).toUpperCase();
}

export function clampMiniPosition(
  pos: MiniPosition,
  size: { width: number; height: number }
): MiniPosition {
  if (typeof window === "undefined") {
    return pos;
  }
  const maxX = Math.max(
    MINI_MARGIN,
    window.innerWidth - size.width - MINI_MARGIN
  );
  const maxY = Math.max(
    MINI_MARGIN,
    window.innerHeight - size.height - MINI_MARGIN
  );
  return {
    x: Math.min(Math.max(pos.x, MINI_MARGIN), maxX),
    y: Math.min(Math.max(pos.y, MINI_MARGIN), maxY)
  };
}

export function getDefaultMiniPosition(size: {
  width: number;
  height: number;
}): MiniPosition {
  if (typeof window === "undefined") {
    return { x: MINI_MARGIN, y: MINI_MARGIN };
  }
  return {
    x: Math.max(MINI_MARGIN, window.innerWidth - size.width - MINI_MARGIN),
    y: Math.max(MINI_MARGIN, window.innerHeight - size.height - MINI_MARGIN)
  };
}
