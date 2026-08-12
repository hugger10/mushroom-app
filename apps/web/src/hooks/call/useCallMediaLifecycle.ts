import { i18n } from "../../i18n";
import { message as antdMessage } from "antd";
import { useCallback, useRef, useState } from "react";
import {
  CALL_MEDIA_TYPE_VIDEO,
  resolveCallParticipationMode,
  type CallMediaType
} from "@mushroom/shared";
import type { CallUiSession } from "../../types/chat";
import { stopMediaStream } from "../useChatHelpers";
import {
  prepareLocalCallMedia as prepareLocalCallMediaCore,
  type PreparedLocalCallMedia
} from "./callMedia";

type UseCallMediaLifecycleOptions = {
  getSession: () => CallUiSession | null;
  setSession: React.Dispatch<React.SetStateAction<CallUiSession | null>>;
};

export type CallMediaLifecycleApi = {
  localCallStream: MediaStream | null;
  getLocalStream: () => MediaStream | null;
  replaceLocalStream: (stream: MediaStream | null) => void;
  prepareLocalMedia: (options: {
    requestedMediaType: CallMediaType;
    context: "start" | "accept";
  }) => Promise<PreparedLocalCallMedia>;
};

/**
 * 负责本地媒体流的获取/替换、以及监听轨道掉线后自动降级 + 文案告警。
 */
export function useCallMediaLifecycle({
  getSession,
  setSession
}: UseCallMediaLifecycleOptions): CallMediaLifecycleApi {
  const [localCallStream, setLocalCallStream] = useState<MediaStream | null>(
    null
  );
  const localCallStreamRef = useRef<MediaStream | null>(null);

  const getLocalStream = useCallback(() => localCallStreamRef.current, []);

  const replaceLocalStream = useCallback((stream: MediaStream | null) => {
    const currentStream = localCallStreamRef.current;
    if (currentStream && currentStream !== stream) {
      stopMediaStream(currentStream);
    }
    localCallStreamRef.current = stream;
    setLocalCallStream(stream);
  }, []);

  const attachLocalTrackLifecycle = useCallback(
    (stream: MediaStream | null) => {
      if (!stream) {
        return;
      }

      const handleTrackStateChange = () => {
        const currentSession = getSession();
        const currentStream = localCallStreamRef.current;
        if (!currentSession || !currentStream || currentStream !== stream) {
          return;
        }

        const activeAudioTracks = currentStream
          .getAudioTracks()
          .filter(track => track.readyState === "live" && track.enabled);
        const activeVideoTracks = currentStream
          .getVideoTracks()
          .filter(track => track.readyState === "live" && track.enabled);
        const nextStream =
          activeAudioTracks.length > 0 || activeVideoTracks.length > 0
            ? new MediaStream([...activeAudioTracks, ...activeVideoTracks])
            : null;

        localCallStreamRef.current = nextStream;
        setLocalCallStream(nextStream);
        setSession(current =>
          current
            ? {
                ...current,
                local_audio_enabled: activeAudioTracks.length > 0,
                local_video_enabled: activeVideoTracks.length > 0,
                local_participation_mode: resolveCallParticipationMode(
                  activeAudioTracks.length > 0,
                  activeVideoTracks.length > 0
                )
              }
            : current
        );

        if (
          currentSession.phase === "ongoing" &&
          currentSession.requested_media_type === CALL_MEDIA_TYPE_VIDEO
        ) {
          if (activeVideoTracks.length === 0 && activeAudioTracks.length > 0) {
            antdMessage.warning(
              i18n.t("callActions.cameraDisconnectedSwitchToAudio")
            );
          } else if (
            activeVideoTracks.length > 0 &&
            activeAudioTracks.length === 0
          ) {
            antdMessage.warning(i18n.t("callActions.micDisconnectedViewOnly"));
          } else if (
            activeVideoTracks.length === 0 &&
            activeAudioTracks.length === 0
          ) {
            antdMessage.warning(
              i18n.t("callActions.devicesDisconnectedListenOnly")
            );
          }
        } else if (
          currentSession.phase === "ongoing" &&
          activeAudioTracks.length === 0
        ) {
          antdMessage.warning(i18n.t("callActions.micDisconnectedListenOnly"));
        }
      };

      for (const track of stream.getTracks()) {
        track.onended = handleTrackStateChange;
        track.onmute = handleTrackStateChange;
        track.onunmute = handleTrackStateChange;
      }
    },
    [getSession, setSession]
  );

  const prepareLocalMedia = useCallback(
    async (options: {
      requestedMediaType: CallMediaType;
      context: "start" | "accept";
    }): Promise<PreparedLocalCallMedia> => {
      replaceLocalStream(null);

      const preparedMedia = await prepareLocalCallMediaCore(options);

      localCallStreamRef.current = preparedMedia.stream;
      setLocalCallStream(preparedMedia.stream);
      attachLocalTrackLifecycle(preparedMedia.stream);

      return preparedMedia;
    },
    [attachLocalTrackLifecycle, replaceLocalStream]
  );

  return {
    localCallStream,
    getLocalStream,
    replaceLocalStream,
    prepareLocalMedia
  };
}
