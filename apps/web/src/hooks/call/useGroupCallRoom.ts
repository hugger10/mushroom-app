import { i18n } from "../../i18n";
import { message as antdMessage } from "antd";
import log from "@/utils/log";
import type { Room } from "livekit-client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from "react";
import {
  CALL_PARTICIPANT_STATUS_JOINED,
  CALL_SCOPE_GROUP
} from "@mushroom/shared";
import type {
  CallUiSession,
  Conversation,
  GroupCallParticipantMedia
} from "../../types/chat";
import type { LoginUser } from "../../types/user";
import {
  buildLiveKitParticipantStream,
  parseLiveKitParticipantIdentity,
  parseLiveKitParticipantMetadata
} from "./callParticipant";
import {
  disconnectGroupCallRoom as disconnectGroupCallRoomCore,
  ensureGroupCallRoom as ensureGroupCallRoomCore,
  syncGroupRoomLocalTracks as syncGroupRoomLocalTracksCore
} from "./callGroupRoom";
import {
  getLocalCallParticipant,
  resolveCallParticipantDisplayName as resolveCallParticipantName
} from "./callSession";

const callLog = log.scope("call");

type UseGroupCallRoomOptions = {
  loginUser: LoginUser | null;
  conversationsRef: RefObject<Conversation[]>;
  callSession: CallUiSession | null;
  getSession: () => CallUiSession | null;
  getLocalStream: () => MediaStream | null;
  localCallStream: MediaStream | null;
  getCurrentDeviceId: () => string | null;
};

export type GroupCallRoomApi = {
  groupParticipantMedia: GroupCallParticipantMedia[];
  localIsSpeaking: boolean;
  ensureRoom: (session: CallUiSession) => Promise<Room | null>;
  disconnect: () => Promise<void>;
  hasRoom: () => boolean;
  syncLocalTracksToRoom: () => Promise<void>;
  getLocalParticipant: (
    session: CallUiSession | null
  ) => ReturnType<typeof getLocalCallParticipant>;
};

/**
 * 负责 LiveKit 群通房间编排：连接/断开、参与者镜像、本地轨道同步。
 */
export function useGroupCallRoom({
  loginUser,
  conversationsRef,
  callSession,
  getSession,
  getLocalStream,
  localCallStream,
  getCurrentDeviceId
}: UseGroupCallRoomOptions): GroupCallRoomApi {
  const [groupParticipantMedia, setGroupParticipantMedia] = useState<
    GroupCallParticipantMedia[]
  >([]);
  // Whether the local user is currently speaking, from LiveKit's
  // `activeSpeakersChanged` event. Drives the local tile's active-speaker ring.
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false);
  const liveKitRoomRef = useRef<Room | null>(null);
  const liveKitRoomCallIdRef = useRef<string | null>(null);
  const liveKitRoomConnectPromiseRef = useRef<Promise<Room | null> | null>(
    null
  );
  /** Cache MediaStream instances per participant identity to avoid
   *  recreating them on every LiveKit event (trackPublished,
   *  activeSpeakersChanged, etc.), which would cause the video element
   *  to flicker due to repeated srcObject reassignment. */
  const streamCacheRef = useRef<Map<string, MediaStream>>(new Map());

  const clearGroupParticipantMedia = useCallback(() => {
    setGroupParticipantMedia([]);
    setLocalIsSpeaking(false);
    streamCacheRef.current.clear();
  }, []);

  const handleActiveSpeakersChanged = useCallback((room: Room) => {
    setLocalIsSpeaking(room.localParticipant.isSpeaking);
  }, []);

  const resolveCallParticipantDisplayName = useCallback(
    (options: {
      conversationId: string;
      userId: number | null;
      deviceId: string | null;
      participantName?: string;
    }) => {
      return resolveCallParticipantName({
        conversations: conversationsRef.current ?? [],
        ...options
      });
    },
    [conversationsRef]
  );

  const syncGroupParticipantMedia = useCallback(
    (room: Room) => {
      const currentSession = getSession();
      if (!currentSession || currentSession.call_scope !== CALL_SCOPE_GROUP) {
        clearGroupParticipantMedia();
        return;
      }

      const nextParticipants = Array.from(room.remoteParticipants.values())
        .map(participant => {
          const metadata = parseLiveKitParticipantMetadata(
            participant.metadata
          );
          const identity = parseLiveKitParticipantIdentity(
            participant.identity
          );
          const userId = metadata.userId ?? identity.userId;
          const deviceId = metadata.deviceId ?? identity.deviceId;

          // Reuse cached MediaStream when tracks haven't changed so the
          // ParticipantMediaTile's useEffect doesn't re-bind srcObject.
          const freshStream = buildLiveKitParticipantStream(participant);
          const cachedStream = streamCacheRef.current.get(participant.identity);
          let stream: MediaStream | null;
          if (cachedStream && freshStream) {
            const oldIds = new Set(cachedStream.getTracks().map(t => t.id));
            const newIds = new Set(freshStream.getTracks().map(t => t.id));
            const sameTracks =
              oldIds.size === newIds.size &&
              [...oldIds].every(id => newIds.has(id));
            stream = sameTracks ? cachedStream : freshStream;
          } else {
            stream = freshStream;
          }
          if (stream) {
            streamCacheRef.current.set(participant.identity, stream);
          } else {
            streamCacheRef.current.delete(participant.identity);
          }

          return {
            participant_identity: participant.identity,
            user_id: userId,
            device_id: deviceId,
            display_name: resolveCallParticipantDisplayName({
              conversationId: currentSession.conversation_id,
              userId,
              deviceId,
              participantName: participant.name
            }),
            stream,
            audio_enabled: participant.isMicrophoneEnabled,
            video_enabled: participant.isCameraEnabled,
            is_speaking: participant.isSpeaking
          } satisfies GroupCallParticipantMedia;
        })
        .sort((left, right) => {
          const leftUserId = left.user_id ?? Number.MAX_SAFE_INTEGER;
          const rightUserId = right.user_id ?? Number.MAX_SAFE_INTEGER;
          if (leftUserId !== rightUserId) {
            return leftUserId - rightUserId;
          }

          return left.display_name.localeCompare(right.display_name, "zh-Hans");
        });

      setGroupParticipantMedia(nextParticipants);
    },
    [clearGroupParticipantMedia, getSession, resolveCallParticipantDisplayName]
  );

  const disconnect = useCallback(async () => {
    await disconnectGroupCallRoomCore({
      liveKitRoomRef,
      liveKitRoomCallIdRef,
      liveKitRoomConnectPromiseRef,
      clearGroupParticipantMedia
    });
  }, [clearGroupParticipantMedia]);

  const syncGroupRoomLocalTracks = useCallback(
    async (room: Room) => {
      await syncGroupRoomLocalTracksCore({
        room,
        localCallStream: getLocalStream()
      });
    },
    [getLocalStream]
  );

  const ensureRoom = useCallback(
    async (session: CallUiSession) => {
      return ensureGroupCallRoomCore({
        session,
        liveKitRoomRef,
        liveKitRoomCallIdRef,
        liveKitRoomConnectPromiseRef,
        disconnectGroupCallRoom: disconnect,
        syncGroupRoomLocalTracks,
        syncGroupParticipantMedia,
        onActiveSpeakersChanged: handleActiveSpeakersChanged,
        clearGroupParticipantMedia
      });
    },
    [
      clearGroupParticipantMedia,
      disconnect,
      handleActiveSpeakersChanged,
      syncGroupParticipantMedia,
      syncGroupRoomLocalTracks
    ]
  );

  const getLocalParticipant = useCallback(
    (session: CallUiSession | null) => {
      return getLocalCallParticipant({
        session,
        loginUserId: loginUser?.userId,
        currentDeviceId: getCurrentDeviceId()
      });
    },
    [getCurrentDeviceId, loginUser?.userId]
  );

  // Reflect a local mic/camera toggle to the SFU by re-aligning published
  // tracks with the current local capture state (publish newly added live
  // tracks, unpublish removed ones). Mirrors the mobile `toggle.ts` group path.
  // The bare `track.enabled` flip done by the caller already mutes/unmutes the
  // outgoing media; this keeps the SFU publication set in sync without going
  // through LiveKit's `setMicrophoneEnabled/setCameraEnabled`, which would
  // republish a duplicate device track (group tracks are published with an
  // unknown source, so those helpers cannot resolve the existing publication).
  const syncLocalTracksToRoom = useCallback(async () => {
    const room = liveKitRoomRef.current;
    if (!room) {
      return;
    }
    try {
      await syncGroupRoomLocalTracks(room);
    } catch (error) {
      callLog.warn("Failed to sync LiveKit local tracks after toggle", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }, [syncGroupRoomLocalTracks]);

  // 群通进入 ongoing 后加入 LiveKit 房间；仅在通话真正终态时断开。
  // 注意：不能因为 phase !== "ongoing" 就断开——因为可能收到旧的
  // call.state-sync（状态为 ringing）在 ongoing 之后到达，导致非预期的断开。
  useEffect(() => {
    if (
      !callSession ||
      callSession.call_scope !== CALL_SCOPE_GROUP ||
      callSession.phase === "ended" ||
      callSession.phase === "timeout" ||
      callSession.phase === "rejected" ||
      callSession.phase === "busy"
    ) {
      void disconnect();
      return;
    }

    // 过渡态（例如状态同步乱序导致的 ringing），保持 LiveKit 连接不断开。
    if (callSession.phase !== "ongoing") {
      return;
    }

    const localParticipant = getLocalParticipant(callSession);
    if (
      localParticipant?.participant_status !== CALL_PARTICIPANT_STATUS_JOINED
    ) {
      return;
    }

    // 房间已存在且 call_id 匹配时跳过，避免重复进入 LiveKit 房间
    // 导致不必要的 syncGroupParticipantMedia 调用和 DOM 重排。
    if (
      liveKitRoomRef.current &&
      liveKitRoomCallIdRef.current === callSession.call_id
    ) {
      return;
    }

    void ensureRoom(callSession).catch(error => {
      callLog.warn("Failed to join LiveKit room for group call", {
        callId: callSession.call_id,
        error: error instanceof Error ? error.message : String(error)
      });
      antdMessage.error(
        error instanceof Error
          ? error.message
          : i18n.t("callActions.joinRoomFailed")
      );
    });
  }, [callSession, disconnect, ensureRoom, getLocalParticipant]);

  // 本地媒体变化时把轨道同步到 LiveKit 房间。
  useEffect(() => {
    const room = liveKitRoomRef.current;
    if (
      !callSession ||
      callSession.call_scope !== CALL_SCOPE_GROUP ||
      callSession.phase !== "ongoing" ||
      !room ||
      liveKitRoomCallIdRef.current !== callSession.call_id
    ) {
      return;
    }

    void syncGroupRoomLocalTracks(room).catch(error => {
      callLog.warn("Failed to sync local group call tracks", {
        callId: callSession.call_id,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, [callSession, localCallStream, syncGroupRoomLocalTracks]);

  return {
    groupParticipantMedia,
    localIsSpeaking,
    ensureRoom,
    disconnect,
    hasRoom: () => liveKitRoomRef.current !== null,
    syncLocalTracksToRoom,
    getLocalParticipant
  };
}
