jest.mock("../src/services/app-runtime", () => {
  const helpers = jest.requireActual("./helpers/mobile-test-helpers");
  return helpers.mobileAppModuleMock;
});

// 语音播放路径会经 media-cache 解析/下载远端 URL，测试中 mock 为本地缓存目录，
// 避免触达真实下载/SQLite，断言 startPlayer 收到 file:// 前缀。
jest.mock("../src/platform/media-cache", () => ({
  resolveMobileMediaCache: jest.fn(async input => ({
    status: "ready",
    localUri: `file:///tmp/mushroom-cache/${input.username}/voice/${encodeURIComponent(input.remoteUrl)}`,
    localPath: `/tmp/mushroom-cache/${input.username}/voice/${encodeURIComponent(input.remoteUrl)}`,
    record: null
  })),
  downloadMobileMediaCache: jest.fn(async input => ({
    status: "ready",
    localUri: `file:///tmp/mushroom-cache/${input.username}/voice/${encodeURIComponent(input.remoteUrl)}`,
    localPath: `/tmp/mushroom-cache/${input.username}/voice/${encodeURIComponent(input.remoteUrl)}`,
    record: null
  }))
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
  check: jest.fn().mockResolvedValue("granted"),
  request: jest.fn().mockResolvedValue("granted"),
  openSettings: jest.fn().mockResolvedValue(undefined)
}));

jest.mock("../src/platform/voice-recorder", () => ({
  MOBILE_VOICE_AUDIO_SET: { sample: true },
  createVoiceFileName: jest.fn(
    (durationSeconds: number) => `voice-${durationSeconds}.m4a`
  ),
  getVoiceUploadUriCandidates: jest.fn((value: string) => [
    `normalized://${value}`,
    value
  ]),
  getVoiceMimeType: jest.fn(() => "audio/mp4"),
  deleteRecordedFile: jest.fn().mockResolvedValue(undefined),
  normalizeWaveform: jest.fn((samples: number[]) =>
    samples.length ? [0.25, 0.75] : []
  ),
  mobileVoiceRecorder: {
    startRecorder: jest.fn().mockResolvedValue("recording"),
    stopRecorder: jest.fn().mockResolvedValue("/tmp/test.m4a"),
    startPlayer: jest.fn().mockResolvedValue("playing"),
    stopPlayer: jest.fn().mockResolvedValue("stopped"),
    setSubscriptionDuration: jest.fn(),
    addRecordBackListener: jest.fn(),
    removeRecordBackListener: jest.fn(),
    addPlayBackListener: jest.fn(),
    removePlayBackListener: jest.fn(),
    addPlaybackEndListener: jest.fn(),
    removePlaybackEndListener: jest.fn()
  }
}));

import { createMessageActions } from "../src/actions/chat/message-actions";
import { createVoiceActions } from "../src/actions/chat/voice-actions";
import {
  createMockMessage,
  createMockState,
  mobileAppControllerMock,
  mobileRealtimeClientMock,
  resetMobileMocks,
  uploadMobileFileMock
} from "./helpers/mobile-test-helpers";
import {
  getVoiceUploadUriCandidates,
  getVoiceMimeType,
  deleteRecordedFile,
  mobileVoiceRecorder
} from "../src/platform/voice-recorder";

describe("mobile voice actions", () => {
  beforeEach(() => {
    resetMobileMocks();
  });

  test("startVoiceRecording requires microphone permission", async () => {
    const state = createMockState();
    const messageActions = createMessageActions({ state });
    const ensureMediaPermission = jest.fn().mockResolvedValue(false);
    const actions = createVoiceActions({
      state,
      ensureMediaPermission,
      messageActions
    });

    await actions.startVoiceRecording();

    expect(ensureMediaPermission).toHaveBeenCalledWith("microphone");
    expect(state.error).toBe("请先允许麦克风权限，才能录制语音消息。");
    expect(mobileVoiceRecorder.startRecorder).not.toHaveBeenCalled();
  });

  test("startVoiceRecording arms recorder and updates waveform listener", async () => {
    const state = createMockState();
    const messageActions = createMessageActions({ state });
    const actions = createVoiceActions({
      state,
      ensureMediaPermission: jest.fn().mockResolvedValue(true),
      messageActions
    });

    await actions.startVoiceRecording();

    expect(mobileVoiceRecorder.setSubscriptionDuration).toHaveBeenCalledWith(
      0.12
    );
    expect(mobileVoiceRecorder.addRecordBackListener).toHaveBeenCalledTimes(1);
    const listener = (mobileVoiceRecorder.addRecordBackListener as jest.Mock)
      .mock.calls[0][0];
    listener({
      currentPosition: 1400,
      currentMetering: -30
    });
    expect(state.voiceRecordingActive).toBe(true);
    expect(mobileRealtimeClientMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageClassify: "typing",
        active: true,
        activity: "voice",
        sender_user_id: 1,
        conversation_id: "server-conversation-1"
      })
    );
  });

  test("stopVoiceRecordingAndSend cancels short recordings", async () => {
    const state = createMockState({
      voiceRecordingActive: true
    });
    const messageActions = createMessageActions({ state });
    const actions = createVoiceActions({
      state,
      ensureMediaPermission: jest.fn(),
      messageActions
    });

    await actions.stopVoiceRecordingAndSend(900);

    expect(mobileVoiceRecorder.stopRecorder).toHaveBeenCalledTimes(1);
    expect(uploadMobileFileMock).not.toHaveBeenCalled();
  });

  test("stopVoiceRecordingAndSend uploads audio and sends optimistic message", async () => {
    const state = createMockState({
      voiceRecordingActive: true,
      replyTargetId: "reply-voice",
      selectedMessageId: "selected-voice",
      voiceMeteringSamplesRef: { current: [-12, -24, -36] }
    });
    const messageActions = {
      ...createMessageActions({ state }),
      sendPreparedMessage: jest.fn().mockResolvedValue(undefined)
    } as ReturnType<typeof createMessageActions>;
    const optimisticMessage = createMockMessage({
      client_message_id: "voice-message"
    });
    mobileAppControllerMock.createOptimisticVoiceMessage.mockResolvedValue(
      optimisticMessage
    );
    const actions = createVoiceActions({
      state,
      ensureMediaPermission: jest.fn(),
      messageActions
    });

    await actions.stopVoiceRecordingAndSend(2800);

    expect(getVoiceUploadUriCandidates).toHaveBeenCalledWith("/tmp/test.m4a");
    expect(getVoiceMimeType).toHaveBeenCalledWith("normalized:///tmp/test.m4a");
    expect(uploadMobileFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "normalized:///tmp/test.m4a",
        name: "voice-2.m4a",
        type: "audio/mp4"
      })
    );
    expect(
      mobileAppControllerMock.createOptimisticVoiceMessage
    ).toHaveBeenCalledWith({
      clientConversationId: state.activeConversation.client_conversation_id,
      attachment: {
        uploadId: "upload-test-1",
        name: "uploaded.bin",
        url: "https://example.test/uploaded.bin",
        size: 123,
        mimeType: "application/octet-stream",
        durationSeconds: 2,
        waveform: [0.25, 0.75]
      },
      replyToClientMessageId: "reply-voice"
    });
    expect(messageActions.sendPreparedMessage).toHaveBeenCalledWith(
      optimisticMessage,
      ""
    );
    expect(state.replyTargetId).toBeNull();
    expect(state.selectedMessageId).toBeNull();
    expect(state.pending).toBe(false);
  });

  test("cancelVoiceRecording stops recorder and resets state", async () => {
    const state = createMockState({
      voiceRecordingActive: true
    });
    const messageActions = createMessageActions({ state });
    const actions = createVoiceActions({
      state,
      ensureMediaPermission: jest.fn(),
      messageActions
    });

    await actions.cancelVoiceRecording();

    expect(mobileVoiceRecorder.removeRecordBackListener).toHaveBeenCalled();
    expect(mobileVoiceRecorder.stopRecorder).toHaveBeenCalled();
    expect(deleteRecordedFile).toHaveBeenCalledWith("/tmp/test.m4a");
    expect(state.voiceRecordingActive).toBe(false);
    expect(mobileRealtimeClientMock.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messageClassify: "typing",
        active: false,
        activity: "voice",
        sender_user_id: 1,
        conversation_id: "server-conversation-1"
      })
    );
  });

  test("stopVoiceRecordingAndSend clears voice typing state before upload", async () => {
    const state = createMockState({
      voiceRecordingActive: true,
      voiceMeteringSamplesRef: { current: [-12, -24, -36] }
    });
    const messageActions = {
      ...createMessageActions({ state }),
      sendPreparedMessage: jest.fn().mockResolvedValue(undefined)
    } as ReturnType<typeof createMessageActions>;
    const optimisticMessage = createMockMessage({
      client_message_id: "voice-message-stop"
    });
    mobileAppControllerMock.createOptimisticVoiceMessage.mockResolvedValue(
      optimisticMessage
    );
    const actions = createVoiceActions({
      state,
      ensureMediaPermission: jest.fn(),
      messageActions
    });

    await actions.stopVoiceRecordingAndSend(1800);

    expect(mobileRealtimeClientMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageClassify: "typing",
        active: false,
        activity: "voice",
        sender_user_id: 1,
        conversation_id: "server-conversation-1"
      })
    );
  });

  test("handleToggleVoicePlayback stops active message playback", async () => {
    const state = createMockState({
      voicePlayingMessageId: "message-1",
      voicePlayingPositionMs: 400
    });
    const messageActions = createMessageActions({ state });
    const actions = createVoiceActions({
      state,
      ensureMediaPermission: jest.fn(),
      messageActions
    });
    const message = createMockMessage({
      client_message_id: "message-1",
      content: {
        type: 2,
        url: "https://example.test/voice.m4a",
        name: "voice.m4a",
        size: 100,
        mime_type: "audio/m4a"
      }
    });

    await actions.handleToggleVoicePlayback(message);

    expect(mobileVoiceRecorder.stopPlayer).toHaveBeenCalled();
    expect(mobileVoiceRecorder.removePlayBackListener).toHaveBeenCalled();
    expect(state.voicePlayingMessageId).toBeNull();
    expect(state.voicePlayingPositionMs).toBe(0);
  });

  test("handleToggleVoicePlayback starts new playback and clears when ended", async () => {
    const state = createMockState();
    const messageActions = createMessageActions({ state });
    const actions = createVoiceActions({
      state,
      ensureMediaPermission: jest.fn(),
      messageActions
    });
    const message = createMockMessage({
      client_message_id: "voice-2",
      content: {
        type: 2,
        url: "https://example.test/voice-2.m4a",
        name: "voice-2.m4a",
        size: 100,
        mime_type: "audio/m4a"
      }
    });

    await actions.handleToggleVoicePlayback(message);

    expect(mobileVoiceRecorder.startPlayer).toHaveBeenCalledWith(
      expect.stringContaining("file:///tmp/mushroom-cache")
    );
    const playBackListener = (
      mobileVoiceRecorder.addPlayBackListener as jest.Mock
    ).mock.calls[0][0];
    playBackListener({ currentPosition: 1200 });
    expect(state.voicePlayingMessageId).toBe("voice-2");
    expect(state.voicePlayingPositionMs).toBe(1200);

    const endListener = (
      mobileVoiceRecorder.addPlaybackEndListener as jest.Mock
    ).mock.calls[0][0];
    endListener({});
    expect(state.voicePlayingMessageId).toBeNull();
    expect(state.voicePlayingPositionMs).toBe(0);
  });
});
