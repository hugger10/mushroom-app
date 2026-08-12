jest.mock("../src/services/app-runtime", () => {
  const helpers = jest.requireActual("./helpers/mobile-test-helpers");
  return helpers.mobileAppModuleMock;
});

jest.mock("@react-native-camera-roll/camera-roll", () => ({
  CameraRoll: { saveAsset: jest.fn() }
}));

jest.mock("react-native-permissions", () => ({
  PERMISSIONS: { IOS: { PHOTO_LIBRARY: "photo" } },
  RESULTS: { GRANTED: "granted", DENIED: "denied" },
  check: jest.fn().mockResolvedValue("granted"),
  request: jest.fn().mockResolvedValue("granted"),
  openSettings: jest.fn()
}));

jest.mock("@react-native-clipboard/clipboard", () => ({
  setString: jest.fn(),
  getString: jest.fn().mockResolvedValue("")
}));

import { buildChatScreenProps } from "../src/app/view-props/chat-screen-props";
import {
  createMockMessage,
  createMockState,
  mobileAppControllerMock,
  resetMobileMocks
} from "./helpers/mobile-test-helpers";

type BuildParams = Parameters<typeof buildChatScreenProps>[0];

const CHAT_ACTION_KEYS = [
  "handleSelectMessage",
  "handleClearConversation",
  "loadOlderMessages",
  "handleComposerTextChange",
  "handleSendMessage",
  "handleToggleFavorite",
  "handleTogglePin",
  "handleRecall",
  "handleToggleReaction",
  "handleToggleVoicePlayback",
  "handleSendImageFromGallery",
  "handleSendImageFromCamera",
  "handleSendAttachment",
  "handleConfirmSendImage",
  "handleCancelImagePreview",
  "handleRetryAttachment",
  "handleReselectAttachment",
  "handleDeleteFailedAttachment",
  "handleForwardToConversation",
  "handleBatchForwardToConversation",
  "openImagePreview",
  "openVideoPreview",
  "openAttachmentInSystem",
  "startVoiceRecording",
  "stopVoiceRecordingAndSend",
  "cancelVoiceRecording",
  "canRecallMessage",
  "closeConversationDetail"
];

function buildProps(state: Record<string, unknown>) {
  const chatActions = Object.fromEntries(
    CHAT_ACTION_KEYS.map(key => [key, jest.fn()])
  );
  const callActions = { handleStartCall: jest.fn() };
  return buildChatScreenProps({
    state: state as unknown as BuildParams["state"],
    chatActions: chatActions as unknown as BuildParams["chatActions"],
    callActions: callActions as unknown as BuildParams["callActions"]
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("chat-screen-props highlight race", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetMobileMocks();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test("tapping a reply quote clears the previous highlight immediately", async () => {
    const messageA = createMockMessage({
      client_message_id: "msg-a",
      server_message_id: "srv-a"
    });
    const state = createMockState({ activeMessages: [messageA] });
    const props = buildProps(state);
    expect(props).not.toBeNull();

    props!.onJumpToReply("srv-a");

    expect(state.highlightedMessageId).toBeNull();
    await flushMicrotasks();
    expect(state.highlightedMessageId).toBe("msg-a");
  });

  test("a stale out-of-order reply jump cannot override the newest highlight", async () => {
    const messageA = createMockMessage({
      client_message_id: "msg-a",
      server_message_id: "srv-a"
    });
    const messageB = createMockMessage({
      client_message_id: "msg-b",
      server_message_id: "srv-b"
    });
    const state = createMockState({ activeMessages: [messageA, messageB] });
    const props = buildProps(state);
    expect(props).not.toBeNull();

    const resolveA = deferred();
    const resolveB = deferred();
    mobileAppControllerMock.ensureMessageVisible
      .mockReturnValueOnce(resolveA.promise)
      .mockReturnValueOnce(resolveB.promise);

    props!.onJumpToReply("srv-a");
    props!.onJumpToReply("srv-b");

    // Newest request (B) resolves first: B is highlighted.
    resolveB.resolve();
    await flushMicrotasks();
    expect(state.highlightedMessageId).toBe("msg-b");

    // Older request (A) resolves later: must NOT stomp B's highlight.
    resolveA.resolve();
    await flushMicrotasks();
    expect(state.highlightedMessageId).toBe("msg-b");
  });

  test("re-tapping the same quote replays the highlight via false->true", async () => {
    const messageA = createMockMessage({
      client_message_id: "msg-a",
      server_message_id: "srv-a"
    });
    const state = createMockState({ activeMessages: [messageA] });
    const props = buildProps(state);
    expect(props).not.toBeNull();

    props!.onJumpToReply("srv-a");
    await flushMicrotasks();
    expect(state.highlightedMessageId).toBe("msg-a");

    // Re-tap before the 2s clear timer fires.
    props!.onJumpToReply("srv-a");
    expect(state.highlightedMessageId).toBeNull();
    await flushMicrotasks();
    expect(state.highlightedMessageId).toBe("msg-a");
  });

  test("search next clears the previous highlight and is superseded by a newer reply jump", async () => {
    const messageA = createMockMessage({
      client_message_id: "msg-a",
      server_message_id: "srv-a"
    });
    const messageB = createMockMessage({
      client_message_id: "msg-b",
      server_message_id: "srv-b"
    });
    const state = createMockState({
      activeMessages: [messageA, messageB],
      searchResults: [
        { message: { client_message_id: "msg-a", sequence: 1 } },
        { message: { client_message_id: "msg-b", sequence: 2 } }
      ]
    });
    state.highlightedMessageId = "msg-a";
    const props = buildProps(state);
    expect(props).not.toBeNull();

    const searchJump = deferred();
    const replyJump = deferred();
    mobileAppControllerMock.ensureMessageVisible
      .mockReturnValueOnce(searchJump.promise)
      .mockReturnValueOnce(replyJump.promise);

    props!.onSearchNext();

    expect(state.highlightedMessageId).toBeNull();
    expect(state.isSearchNavigating).toBe(true);

    // A newer reply jump supersedes the in-flight search navigation.
    props!.onJumpToReply("srv-a");

    replyJump.resolve();
    await flushMicrotasks();
    expect(state.highlightedMessageId).toBe("msg-a");

    // The now-stale search next resolution must not override the jump.
    searchJump.resolve();
    await flushMicrotasks();
    expect(state.highlightedMessageId).toBe("msg-a");
  });
});
