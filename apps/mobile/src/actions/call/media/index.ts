import { CALL_SCOPE_GROUP } from "@mushroom/shared";
import type { MobileAppState } from "../../../app/controller/useMobileAppState";
import type { MobileCallUiSession } from "../../../types/app";
import { createStreamReplacers, createIceServerResolver } from "./streams";
import { createGetRemoteParticipant } from "./participants";
import { createPrepareLocalCallMedia } from "./capture";
import { createPeerConnectionLifecycle } from "./peer-connection";
import { createCallSignaling } from "./signaling";
import { createToggleActions } from "./toggle";
import { createGroupRoomActions } from "../group/group-room";
import type { PermissionActions } from "./types";

export type { PreparedLocalCallMedia } from "./types";

export function createCallMediaActions(params: {
  state: MobileAppState;
  permissionActions: PermissionActions;
}) {
  const { state, permissionActions } = params;

  const { replaceLocalCallStream, replaceRemoteCallStream } =
    createStreamReplacers(state);
  const resolveIceServers = createIceServerResolver(state);
  const getRemoteParticipant = createGetRemoteParticipant(state);

  const groupRoomActions = createGroupRoomActions({ state });

  // Route synchronous UI dismissal (`dismissCallSessionNow`) through the single
  // canonical group-room teardown so the LiveKit audio session is always
  // stopped, even on paths that skip `releaseCallMedia` (logout, controller
  // unmount, starting a new call over a lingering session).
  state.liveKitRoomTeardownRef.current = () => {
    void groupRoomActions.disconnectGroupCallRoom();
  };

  const prepareLocalCallMedia = createPrepareLocalCallMedia({
    permissionActions,
    replaceLocalCallStream
  });

  const {
    closePeerConnection,
    ensurePeerConnection,
    flushPendingIceCandidates
  } = createPeerConnectionLifecycle({
    state,
    replaceRemoteCallStream,
    resolveIceServers,
    getRemoteParticipant
  });

  const {
    handleRemoteDescription,
    handleIceCandidate,
    maybeCreateDirectCallOffer
  } = createCallSignaling({
    state,
    ensurePeerConnection,
    flushPendingIceCandidates,
    getRemoteParticipant
  });

  const { toggleLocalCallMedia } = createToggleActions({
    state,
    permissionActions,
    replaceLocalCallStream,
    syncGroupRoomLocalTracks: groupRoomActions.syncLocalTracks,
    getLiveKitRoom: () => state.liveKitRoomRef.current
  });

  function releaseCallMedia() {
    void groupRoomActions.disconnectGroupCallRoom();
    closePeerConnection();
    replaceLocalCallStream(null);
  }

  /**
   * Join the LiveKit SFU room for a group call once it reaches `ongoing` and
   * the local user is JOINED. No-op for direct (1:1) calls, which use the
   * native P2P path via `maybeCreateDirectCallOffer`.
   */
  async function maybeJoinGroupCallRoom(session: MobileCallUiSession) {
    if (
      session.call_scope !== CALL_SCOPE_GROUP ||
      session.phase !== "ongoing" ||
      !groupRoomActions.localParticipantJoined(session)
    ) {
      return;
    }
    await groupRoomActions.ensureGroupCallRoom(session);
  }

  return {
    prepareLocalCallMedia,
    closePeerConnection,
    releaseCallMedia,
    handleRemoteDescription,
    handleIceCandidate,
    maybeCreateDirectCallOffer,
    maybeJoinGroupCallRoom,
    disconnectGroupCallRoom: groupRoomActions.disconnectGroupCallRoom,
    toggleLocalCallMedia
  };
}
