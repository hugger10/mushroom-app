jest.mock("../src/services/app-runtime", () => {
  const helpers = jest.requireActual("./helpers/mobile-test-helpers");
  return helpers.mobileAppModuleMock;
});

jest.mock("../src/platform/notification-center", () => ({
  clearIncomingCallNotification: jest.fn().mockResolvedValue(undefined),
  displayIncomingCallNotification: jest.fn().mockResolvedValue(undefined)
}));

jest.mock("../src/platform/system-call", () => ({
  endSystemCall: jest.fn().mockResolvedValue(undefined),
  markSystemCallActive: jest.fn().mockResolvedValue(undefined),
  reportIncomingSystemCall: jest.fn().mockResolvedValue(undefined)
}));

jest.mock("../src/platform/call-sound-player", () => ({
  mobileCallSoundPlayer: {
    playLoop: jest.fn().mockResolvedValue(undefined),
    playOnce: jest.fn().mockResolvedValue(undefined),
    stopAll: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock("react-native-permissions", () => ({
  PERMISSIONS: {
    IOS: {
      MICROPHONE: "ios.permission.MICROPHONE",
      CAMERA: "ios.permission.CAMERA"
    },
    ANDROID: {
      RECORD_AUDIO: "android.permission.RECORD_AUDIO",
      CAMERA: "android.permission.CAMERA"
    }
  },
  RESULTS: {
    GRANTED: "granted",
    LIMITED: "limited",
    DENIED: "denied",
    BLOCKED: "blocked",
    UNAVAILABLE: "unavailable"
  },
  check: jest.fn(),
  request: jest.fn(),
  openSettings: jest.fn().mockResolvedValue(undefined)
}));

jest.mock("@livekit/react-native-webrtc", () => ({
  MediaStream: class MockMediaStream {
    toURL() {
      return "stream://mock";
    }
    getTracks() {
      return [];
    }
    getAudioTracks() {
      return [];
    }
    getVideoTracks() {
      return [];
    }
    addTrack() {}
    release() {}
  },
  RTCPeerConnection: class MockPeerConnection {
    localDescription: unknown = null;
    remoteDescription: unknown = null;
    signalingState = "stable";
    connectionState = "new";
    iceConnectionState = "new";
    ontrack = null;
    onicecandidate = null;
    onconnectionstatechange = null;
    oniceconnectionstatechange = null;
    addTrack() {
      return null;
    }
    addTransceiver() {
      return null;
    }
    getSenders() {
      return [];
    }
    async createOffer() {
      return { type: "offer", sdp: "offer-sdp" };
    }
    async createAnswer() {
      return { type: "answer", sdp: "answer-sdp" };
    }
    async setLocalDescription(description: unknown) {
      this.localDescription = description;
    }
    async setRemoteDescription(description: unknown) {
      this.remoteDescription = description;
    }
    async addIceCandidate() {}
    close() {}
  },
  RTCIceCandidate: class MockIceCandidate {
    constructor(init: unknown) {
      Object.assign(this, init);
    }
  },
  RTCSessionDescription: class MockSessionDescription {
    constructor(init: unknown) {
      Object.assign(this, init);
    }
  },
  RTCView: "RTCView",
  mediaDevices: {
    getUserMedia: jest.fn(),
    enumerateDevices: jest.fn()
  },
  registerGlobals: jest.fn()
}));

// LiveKit group-call SFU bindings pull in native modules; mock them so the
// media action factory (which imports the group-room module) can load under
// Jest without the native runtime.
jest.mock("@livekit/react-native", () => ({
  registerGlobals: jest.fn(),
  AudioSession: {
    startAudioSession: jest.fn().mockResolvedValue(undefined),
    stopAudioSession: jest.fn().mockResolvedValue(undefined)
  }
}));

import { Alert, Platform } from "react-native";
import {
  RESULTS,
  check,
  openSettings,
  request
} from "react-native-permissions";
import {
  CALL_MEDIA_TYPE_AUDIO,
  CALL_MEDIA_TYPE_VIDEO,
  CALL_PARTICIPANT_ROLE_INVITEE,
  CALL_PARTICIPANT_STATUS_INVITED,
  CALL_PARTICIPANT_STATUS_JOINED,
  CALL_SCOPE_DIRECT,
  CALL_STATUS_ENDED
} from "@mushroom/shared";
import {
  clearIncomingCallNotification,
  displayIncomingCallNotification
} from "../src/platform/notification-center";
import { createCallPermissionActions } from "../src/actions/call/call-permissions";
import { createCallRealtimeActions } from "../src/actions/call/call-realtime-actions";
import { createCallSessionActions } from "../src/actions/call/call-session-actions";
import {
  endSystemCall,
  markSystemCallActive,
  reportIncomingSystemCall
} from "../src/platform/system-call";
import { mobileCallSoundPlayer } from "../src/platform/call-sound-player";
import {
  createMockCallSession,
  createMockConversation,
  createMockFriend,
  createMockState,
  flushMicrotasks,
  mobileAppControllerMock,
  mobileRealtimeClientMock,
  mobileServerApiMock,
  resetMobileMocks
} from "./helpers/mobile-test-helpers";

function createMediaActions(overrides: Record<string, unknown> = {}) {
  return {
    prepareLocalCallMedia: jest.fn().mockResolvedValue({
      effectiveMediaType: CALL_MEDIA_TYPE_AUDIO,
      localAudioEnabled: true,
      localVideoEnabled: false,
      localParticipationMode: "audio_only"
    }),
    toggleLocalCallMedia: jest.fn().mockResolvedValue({
      localAudioEnabled: false,
      localVideoEnabled: false,
      localParticipationMode: "receive_only"
    }),
    maybeCreateDirectCallOffer: jest.fn().mockResolvedValue(undefined),
    maybeJoinGroupCallRoom: jest.fn().mockResolvedValue(undefined),
    disconnectGroupCallRoom: jest.fn().mockResolvedValue(undefined),
    handleRemoteDescription: jest.fn().mockResolvedValue(undefined),
    handleIceCandidate: jest.fn().mockResolvedValue(undefined),
    closePeerConnection: jest.fn(),
    releaseCallMedia: jest.fn(),
    ...overrides
  };
}

describe("mobile call actions", () => {
  beforeEach(() => {
    resetMobileMocks();
    jest.useRealTimers();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    (clearIncomingCallNotification as jest.Mock).mockClear();
    (displayIncomingCallNotification as jest.Mock).mockClear();
    (endSystemCall as jest.Mock).mockClear();
    (markSystemCallActive as jest.Mock).mockClear();
    (reportIncomingSystemCall as jest.Mock).mockClear();
    (mobileCallSoundPlayer.playLoop as jest.Mock).mockClear();
    (mobileCallSoundPlayer.playOnce as jest.Mock).mockClear();
    (mobileCallSoundPlayer.stopAll as jest.Mock).mockClear();
    (check as jest.Mock).mockReset();
    (request as jest.Mock).mockReset();
    (openSettings as jest.Mock).mockReset();
    (openSettings as jest.Mock).mockResolvedValue(undefined);
  });

  test("ensureMediaPermission returns true for granted permission", async () => {
    (check as jest.Mock).mockResolvedValue(RESULTS.GRANTED);
    const actions = createCallPermissionActions();

    await expect(actions.ensureMediaPermission("microphone")).resolves.toBe(
      true
    );
    expect(request).not.toHaveBeenCalled();
  });

  test("resolveCallLocalMediaCapability requests missing permission", async () => {
    (check as jest.Mock).mockResolvedValue(RESULTS.DENIED);
    (request as jest.Mock).mockResolvedValue(RESULTS.LIMITED);
    const actions = createCallPermissionActions();

    const capability = await actions.resolveCallLocalMediaCapability({
      requestedMediaType: CALL_MEDIA_TYPE_VIDEO,
      context: "start"
    });

    expect(check).toHaveBeenCalled();
    expect(request).toHaveBeenCalled();
    expect(capability.localAudioEnabled).toBe(true);
    expect(capability.localVideoEnabled).toBe(true);
    expect(capability.effectiveMediaType).toBe(CALL_MEDIA_TYPE_VIDEO);
  });

  test("ensureMediaPermission opens settings guidance when blocked", async () => {
    (check as jest.Mock).mockResolvedValue(RESULTS.DENIED);
    (request as jest.Mock).mockResolvedValue(RESULTS.BLOCKED);
    const actions = createCallPermissionActions();

    await expect(actions.ensureMediaPermission("microphone")).resolves.toBe(
      false
    );

    expect(Alert.alert).toHaveBeenCalledWith(
      "麦克风权限已关闭",
      "请前往系统设置开启麦克风权限后再继续。",
      expect.any(Array)
    );

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    await buttons[1].onPress();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  test("resolveCallLocalMediaCapability throws unavailable-device message", async () => {
    (check as jest.Mock).mockResolvedValue(RESULTS.UNAVAILABLE);
    const actions = createCallPermissionActions();

    await expect(
      actions.resolveCallLocalMediaCapability({
        requestedMediaType: CALL_MEDIA_TYPE_AUDIO,
        context: "start"
      })
    ).rejects.toThrow("当前设备或模拟器没有可用的麦克风能力，无法发起语音通话");
  });

  test("handleStartCall creates optimistic direct-call session and fetches ICE config", async () => {
    const state = createMockState();
    const conversation = createMockConversation({
      client_conversation_id: "conversation-direct",
      server_conversation_id: "server-direct",
      peer_id: 99,
      type: 1,
      name: "",
      display_name: ""
    });
    state.conversations = [conversation];
    state.friends = [
      createMockFriend({
        user_id: 99,
        nickname: "Robin",
        avatar_url: "https://example.test/robin.png"
      })
    ];
    const mediaActions = createMediaActions({
      prepareLocalCallMedia: jest.fn().mockResolvedValue({
        effectiveMediaType: CALL_MEDIA_TYPE_AUDIO,
        localAudioEnabled: true,
        localVideoEnabled: false,
        localParticipationMode: "audio_only",
        notice: "已自动准备麦克风"
      })
    });
    const actions = createCallSessionActions({
      state,
      permissionActions: {} as never,
      mediaActions
    } as never);

    await actions.handleStartCall(conversation, CALL_MEDIA_TYPE_AUDIO);
    await flushMicrotasks();

    expect(mediaActions.prepareLocalCallMedia).toHaveBeenCalledWith({
      requestedMediaType: CALL_MEDIA_TYPE_AUDIO,
      context: "start"
    });
    expect(mobileRealtimeClientMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageClassify: "call.invite.request",
        conversation_id: "server-direct",
        media_type: CALL_MEDIA_TYPE_AUDIO,
        target_user_ids: [99]
      })
    );
    expect(state.callSession).toEqual(
      expect.objectContaining({
        conversation_id: "server-direct",
        conversation_label: "Robin",
        conversation_avatar_url: "https://example.test/robin.png",
        direction: "outgoing",
        phase: "ringing",
        local_audio_enabled: true
      })
    );
    expect(mobileCallSoundPlayer.playLoop).toHaveBeenCalledWith("outgoing");
    expect(mobileServerApiMock.getCallIceConfig).toHaveBeenCalledTimes(1);
    expect(state.callIceInfo).toEqual({
      ice_servers: [{ urls: "stun:127.0.0.1:3478" }]
    });
  });

  test("handleStartCall rejects empty target list", async () => {
    const state = createMockState();
    const conversation = createMockConversation({
      type: 1,
      peer_id: 0,
      members: []
    });
    const mediaActions = createMediaActions();
    const actions = createCallSessionActions({
      state,
      permissionActions: {} as never,
      mediaActions
    } as never);

    await actions.handleStartCall(conversation, CALL_MEDIA_TYPE_AUDIO);

    expect(mediaActions.prepareLocalCallMedia).not.toHaveBeenCalled();
    expect(state.error).toBe("当前会话没有可呼叫的成员。");
  });

  test("accept, reject, end and toggle local media update session state", async () => {
    jest.useFakeTimers();
    const currentSession = createMockCallSession({
      direction: "incoming",
      requested_media_type: CALL_MEDIA_TYPE_VIDEO,
      local_audio_enabled: true,
      local_video_enabled: true,
      local_participation_mode: "audio_video"
    });
    const state = createMockState({
      callSession: currentSession,
      callSessionRef: { current: currentSession }
    });
    const mediaActions = createMediaActions({
      prepareLocalCallMedia: jest.fn().mockResolvedValue({
        effectiveMediaType: CALL_MEDIA_TYPE_VIDEO,
        localAudioEnabled: true,
        localVideoEnabled: false,
        localParticipationMode: "audio_only"
      })
    });
    const actions = createCallSessionActions({
      state,
      permissionActions: {} as never,
      mediaActions
    } as never);

    await actions.handleAcceptCall();
    expect(clearIncomingCallNotification).toHaveBeenCalledWith(
      currentSession.call_id
    );
    expect(mobileCallSoundPlayer.stopAll).toHaveBeenCalled();
    expect(mobileRealtimeClientMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageClassify: "call.accept.request",
        call_id: currentSession.call_id,
        local_video_enabled: false
      })
    );
    expect(state.callSession).toEqual(
      expect.objectContaining({
        phase: "ongoing",
        local_video_enabled: false,
        local_participation_mode: "audio_only"
      })
    );
    expect(mobileCallSoundPlayer.playOnce).toHaveBeenCalledWith("connected");

    state.callSessionRef.current = state.callSession;
    await actions.handleToggleLocalCallMedia("audio");
    expect(mediaActions.toggleLocalCallMedia).toHaveBeenCalledWith("audio");
    expect(state.callSession).toEqual(
      expect.objectContaining({
        local_audio_enabled: false,
        local_video_enabled: false,
        local_participation_mode: "receive_only"
      })
    );

    state.callSessionRef.current = state.callSession;
    await actions.handleEndCall();
    expect(state.callSession).toEqual(
      expect.objectContaining({
        phase: "ended"
      })
    );
    expect(mobileAppControllerMock.syncNow).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1200);
    expect(state.dismissCallSessionNow).toHaveBeenCalledTimes(1);

    const nextSession = createMockCallSession({
      direction: "incoming"
    });
    state.callSession = nextSession;
    state.callSessionRef.current = nextSession;
    await actions.handleRejectCall();
    expect(clearIncomingCallNotification).toHaveBeenCalledWith(
      nextSession.call_id
    );
    expect(mobileCallSoundPlayer.playOnce).toHaveBeenCalledWith("rejected");
    expect(mobileRealtimeClientMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageClassify: "call.reject.request",
        call_id: nextSession.call_id
      })
    );
    expect(state.dismissCallSessionNow).toHaveBeenCalledTimes(2);
  });

  test("realtime invited and media-state messages update current call session", async () => {
    const callSession = createMockCallSession({
      call_id: "call-rt",
      participants: [
        {
          call_id: "call-rt",
          conversation_id: "server-conversation-1",
          user_id: 2,
          device_id: "peer-device",
          participant_role: CALL_PARTICIPANT_ROLE_INVITEE,
          participant_status: CALL_PARTICIPANT_STATUS_JOINED,
          audio_enabled: true,
          video_enabled: false,
          participation_mode: "audio_only",
          created_at: "2026-04-08T00:00:00.000Z",
          updated_at: "2026-04-08T00:00:00.000Z"
        }
      ]
    });
    const state = createMockState({
      callSession,
      callSessionRef: { current: callSession }
    });
    const sessionActions = {
      upsertCallSession: jest.fn(() => {
        state.callSessionRef.current = {
          ...callSession,
          phase: "ended"
        };
      }),
      handleStartCall: jest.fn(),
      handleAcceptCall: jest.fn(),
      handleRejectCall: jest.fn(),
      handleEndCall: jest.fn(),
      handleToggleLocalCallMedia: jest.fn()
    };
    const mediaActions = createMediaActions();
    const actions = createCallRealtimeActions({
      state,
      sessionActions,
      mediaActions
    } as never);

    await actions.handleRealtimeSocketMessage({
      messageClassify: "call.invited",
      call_id: "call-new",
      conversation_id: "server-conversation-1",
      call_scope: CALL_SCOPE_DIRECT,
      media_type: CALL_MEDIA_TYPE_AUDIO,
      sender_user_id: 2,
      sender_device_id: "peer-device",
      timestamp: "2026-04-08T00:00:00.000Z",
      timeout_seconds: 30,
      participants: [
        {
          call_id: "call-new",
          conversation_id: "server-conversation-1",
          user_id: 1,
          device_id: "device-1",
          participant_role: CALL_PARTICIPANT_ROLE_INVITEE,
          participant_status: CALL_PARTICIPANT_STATUS_INVITED,
          created_at: "2026-04-08T00:00:00.000Z",
          updated_at: "2026-04-08T00:00:00.000Z"
        }
      ],
      session: createMockCallSession().session
    });

    expect(sessionActions.upsertCallSession).toHaveBeenCalledWith(
      "incoming",
      expect.objectContaining({
        messageClassify: "call.invited",
        call_id: "call-new"
      })
    );
    expect(reportIncomingSystemCall).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call-new"
      })
    );
    expect(mobileCallSoundPlayer.playLoop).not.toHaveBeenCalled();
    if (Platform.OS === "android") {
      expect(displayIncomingCallNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "call.invite",
          callId: "call-new"
        })
      );
    } else {
      expect(displayIncomingCallNotification).not.toHaveBeenCalled();
    }

    await actions.handleRealtimeSocketMessage({
      messageClassify: "call.media-state",
      call_id: "call-rt",
      conversation_id: "server-conversation-1",
      call_scope: CALL_SCOPE_DIRECT,
      media_type: CALL_MEDIA_TYPE_AUDIO,
      sender_user_id: 2,
      sender_device_id: "peer-device",
      timestamp: "2026-04-08T00:00:00.000Z",
      audio_enabled: false,
      video_enabled: true,
      participation_mode: "audio_video"
    });

    expect(state.callSession?.participants[0]).toEqual(
      expect.objectContaining({
        audio_enabled: false,
        video_enabled: true,
        participation_mode: "audio_video"
      })
    );
  });

  test("realtime ended message syncs and auto dismisses active session", async () => {
    jest.useFakeTimers();
    const callSession = createMockCallSession({
      call_id: "call-end",
      direction: "outgoing",
      phase: "ongoing"
    });
    const state = createMockState({
      callSession,
      callSessionRef: { current: callSession }
    });
    const sessionActions = {
      upsertCallSession: jest.fn(() => {
        state.callSessionRef.current = {
          ...callSession,
          phase: "ended"
        };
      }),
      handleStartCall: jest.fn(),
      handleAcceptCall: jest.fn(),
      handleRejectCall: jest.fn(),
      handleEndCall: jest.fn(),
      handleToggleLocalCallMedia: jest.fn()
    };
    const mediaActions = createMediaActions();
    const actions = createCallRealtimeActions({
      state,
      sessionActions,
      mediaActions
    } as never);

    await actions.handleRealtimeSocketMessage({
      messageClassify: "call.ended",
      call_id: "call-end",
      conversation_id: "server-conversation-1",
      call_scope: CALL_SCOPE_DIRECT,
      media_type: CALL_MEDIA_TYPE_AUDIO,
      sender_user_id: 2,
      sender_device_id: "peer-device",
      timestamp: "2026-04-08T00:00:00.000Z",
      session: {
        ...callSession.session,
        status: CALL_STATUS_ENDED,
        ended_at: "2026-04-08T00:00:05.000Z"
      }
    });

    expect(sessionActions.upsertCallSession).toHaveBeenCalledWith(
      "outgoing",
      expect.objectContaining({
        messageClassify: "call.ended",
        call_id: "call-end"
      })
    );
    expect(clearIncomingCallNotification).toHaveBeenCalledWith("call-end");
    expect(endSystemCall).toHaveBeenCalledWith("call-end");
    expect(mobileCallSoundPlayer.playOnce).toHaveBeenCalledWith("hangup");
    expect(mobileAppControllerMock.syncNow).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1200);
    expect(state.dismissCallSessionNow).toHaveBeenCalledTimes(1);
  });

  test("realtime error message dismisses matching call session", async () => {
    const callSession = createMockCallSession({
      call_id: "call-error"
    });
    const state = createMockState({
      callSession,
      callSessionRef: { current: callSession }
    });
    const sessionActions = {
      upsertCallSession: jest.fn()
    };
    const mediaActions = createMediaActions();
    const actions = createCallRealtimeActions({
      state,
      sessionActions,
      mediaActions
    } as never);

    await actions.handleRealtimeSocketMessage({
      messageClassify: "call.error",
      call_id: "call-error",
      conversation_id: "server-conversation-1",
      code: "ICE_FAILED",
      timestamp: "2026-04-08T00:00:00.000Z",
      message: "ice failed"
    });

    expect(state.error).toBe("ice failed");
    expect(state.status.text).toBe("通话操作失败");
    expect(state.dismissCallSessionNow).toHaveBeenCalledTimes(1);
  });

  test("realtime call.accepted triggers direct offer creation for active session", async () => {
    const callSession = createMockCallSession({
      call_id: "call-accepted",
      direction: "outgoing",
      phase: "ringing",
      session: {
        ...createMockCallSession().session,
        call_id: "call-accepted",
        initiator_user_id: 1
      }
    });
    const state = createMockState({
      callSession,
      callSessionRef: { current: callSession }
    });
    const sessionActions = {
      upsertCallSession: jest.fn(() => {
        state.callSessionRef.current = {
          ...callSession,
          phase: "ongoing"
        };
      })
    };
    const mediaActions = createMediaActions();
    const actions = createCallRealtimeActions({
      state,
      sessionActions,
      mediaActions
    } as never);

    await actions.handleRealtimeSocketMessage({
      messageClassify: "call.accepted",
      call_id: "call-accepted",
      conversation_id: "server-conversation-1",
      call_scope: CALL_SCOPE_DIRECT,
      media_type: CALL_MEDIA_TYPE_AUDIO,
      sender_user_id: 2,
      sender_device_id: "peer-device",
      timestamp: "2026-04-08T00:00:00.000Z",
      participant: {
        call_id: "call-accepted",
        conversation_id: "server-conversation-1",
        user_id: 2,
        device_id: "peer-device",
        participant_role: CALL_PARTICIPANT_ROLE_INVITEE,
        participant_status: CALL_PARTICIPANT_STATUS_JOINED,
        audio_enabled: true,
        video_enabled: false,
        participation_mode: "audio_only",
        created_at: "2026-04-08T00:00:00.000Z",
        updated_at: "2026-04-08T00:00:00.000Z"
      },
      session: {
        ...callSession.session,
        status: 1
      }
    });

    expect(mediaActions.maybeCreateDirectCallOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        call_id: "call-accepted"
      })
    );
    expect(clearIncomingCallNotification).toHaveBeenCalledWith("call-accepted");
    expect(markSystemCallActive).toHaveBeenCalledWith("call-accepted");
    expect(mobileCallSoundPlayer.playOnce).toHaveBeenCalledWith("connected");
  });

  test("acceptCallById accepts directly when the session is already in memory", async () => {
    const callSession = createMockCallSession({ call_id: "call-mem" });
    const state = createMockState({
      callSession,
      callSessionRef: { current: callSession }
    });
    const sessionActions = {
      upsertCallSession: jest.fn(),
      handleStartCall: jest.fn(),
      handleAcceptCall: jest.fn().mockResolvedValue(undefined),
      handleRejectCall: jest.fn().mockResolvedValue(undefined),
      handleEndCall: jest.fn().mockResolvedValue(undefined),
      handleToggleLocalCallMedia: jest.fn()
    };
    const actions = createCallRealtimeActions({
      state,
      sessionActions,
      mediaActions: createMediaActions()
    } as never);

    await actions.acceptCallById("call-mem");

    // No server round-trip needed when the session is already present.
    expect(mobileServerApiMock.getCallState).not.toHaveBeenCalled();
    expect(sessionActions.handleAcceptCall).toHaveBeenCalledTimes(1);
  });

  test("acceptCallById rebuilds the session from the server when not in memory (offline answer)", async () => {
    const state = createMockState({
      callSession: null,
      callSessionRef: { current: null }
    });
    mobileServerApiMock.getCallState.mockResolvedValueOnce({
      data: {
        session: { ...createMockCallSession().session, call_id: "call-cold" },
        participants: createMockCallSession({ call_id: "call-cold" })
          .participants
      }
    });
    const sessionActions = {
      // Emulate the real upsert: it returns the freshly built session (and the
      // real implementation also populates the ref synchronously).
      upsertCallSession: jest.fn(() => {
        const rebuilt = createMockCallSession({
          call_id: "call-cold",
          phase: "ringing",
          direction: "incoming"
        });
        state.callSessionRef.current = rebuilt;
        return rebuilt;
      }),
      handleStartCall: jest.fn(),
      handleAcceptCall: jest.fn().mockResolvedValue(undefined),
      handleRejectCall: jest.fn().mockResolvedValue(undefined),
      handleEndCall: jest.fn().mockResolvedValue(undefined),
      handleToggleLocalCallMedia: jest.fn()
    };
    const actions = createCallRealtimeActions({
      state,
      sessionActions,
      mediaActions: createMediaActions()
    } as never);

    await actions.acceptCallById("call-cold");

    expect(mobileServerApiMock.getCallState).toHaveBeenCalledWith({
      callId: "call-cold"
    });
    expect(sessionActions.upsertCallSession).toHaveBeenCalled();
    expect(sessionActions.handleAcceptCall).toHaveBeenCalledTimes(1);
  });

  test("acceptCallById uses the upsert return value even if the session ref is not yet populated (deferred updater)", async () => {
    const state = createMockState({
      callSession: null,
      callSessionRef: { current: null }
    });
    mobileServerApiMock.getCallState.mockResolvedValueOnce({
      data: {
        session: { ...createMockCallSession().session, call_id: "call-defer" },
        participants: createMockCallSession({ call_id: "call-defer" })
          .participants
      }
    });
    const rebuiltSession = createMockCallSession({
      call_id: "call-defer",
      phase: "ringing",
      direction: "incoming"
    });
    const sessionActions = {
      // Simulate React deferring the functional updater to render: the ref is
      // NOT updated synchronously, but the freshly built session is returned.
      // The fix must rely on the return value, not a ref read-back.
      upsertCallSession: jest.fn(() => rebuiltSession),
      handleStartCall: jest.fn(),
      handleAcceptCall: jest.fn().mockResolvedValue(undefined),
      handleRejectCall: jest.fn().mockResolvedValue(undefined),
      handleEndCall: jest.fn().mockResolvedValue(undefined),
      handleToggleLocalCallMedia: jest.fn()
    };
    const actions = createCallRealtimeActions({
      state,
      sessionActions,
      mediaActions: createMediaActions()
    } as never);

    await actions.acceptCallById("call-defer");

    expect(state.callSessionRef.current).toBeNull();
    expect(sessionActions.upsertCallSession).toHaveBeenCalled();
    expect(sessionActions.handleAcceptCall).toHaveBeenCalledTimes(1);
  });

  test("acceptCallById is a no-op when the call no longer exists server-side", async () => {
    const state = createMockState({
      callSession: null,
      callSessionRef: { current: null }
    });
    mobileServerApiMock.getCallState.mockRejectedValueOnce(
      new Error("call ended")
    );
    const sessionActions = {
      upsertCallSession: jest.fn(),
      handleStartCall: jest.fn(),
      handleAcceptCall: jest.fn().mockResolvedValue(undefined),
      handleRejectCall: jest.fn().mockResolvedValue(undefined),
      handleEndCall: jest.fn().mockResolvedValue(undefined),
      handleToggleLocalCallMedia: jest.fn()
    };
    const actions = createCallRealtimeActions({
      state,
      sessionActions,
      mediaActions: createMediaActions()
    } as never);

    await actions.acceptCallById("call-gone");

    expect(sessionActions.handleAcceptCall).not.toHaveBeenCalled();
  });

  test("rejectOrEndCallById rejects a still-ringing incoming call", async () => {
    const callSession = createMockCallSession({
      call_id: "call-ring",
      direction: "incoming",
      phase: "ringing"
    });
    const state = createMockState({
      callSession,
      callSessionRef: { current: callSession }
    });
    const sessionActions = {
      upsertCallSession: jest.fn(),
      handleStartCall: jest.fn(),
      handleAcceptCall: jest.fn().mockResolvedValue(undefined),
      handleRejectCall: jest.fn().mockResolvedValue(undefined),
      handleEndCall: jest.fn().mockResolvedValue(undefined),
      handleToggleLocalCallMedia: jest.fn()
    };
    const actions = createCallRealtimeActions({
      state,
      sessionActions,
      mediaActions: createMediaActions()
    } as never);

    await actions.rejectOrEndCallById("call-ring");

    expect(sessionActions.handleRejectCall).toHaveBeenCalledTimes(1);
    expect(sessionActions.handleEndCall).not.toHaveBeenCalled();
  });

  test("rejectOrEndCallById ends an ongoing call", async () => {
    const callSession = createMockCallSession({
      call_id: "call-live",
      direction: "incoming",
      phase: "ongoing"
    });
    const state = createMockState({
      callSession,
      callSessionRef: { current: callSession }
    });
    const sessionActions = {
      upsertCallSession: jest.fn(),
      handleStartCall: jest.fn(),
      handleAcceptCall: jest.fn().mockResolvedValue(undefined),
      handleRejectCall: jest.fn().mockResolvedValue(undefined),
      handleEndCall: jest.fn().mockResolvedValue(undefined),
      handleToggleLocalCallMedia: jest.fn()
    };
    const actions = createCallRealtimeActions({
      state,
      sessionActions,
      mediaActions: createMediaActions()
    } as never);

    await actions.rejectOrEndCallById("call-live");

    expect(sessionActions.handleEndCall).toHaveBeenCalledTimes(1);
    expect(sessionActions.handleRejectCall).not.toHaveBeenCalled();
  });
});
