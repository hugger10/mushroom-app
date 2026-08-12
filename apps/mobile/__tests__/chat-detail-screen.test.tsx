import React from "react";
import ReactTestRenderer from "react-test-renderer";
import type {
  MobileMessageSearchFilter,
  MobileMessageSearchResult
} from "@mushroom/app-core";
import type { Message } from "@mushroom/shared";
import { ChatDetailScreen } from "../src/screens/ChatDetailScreen";
import {
  createMockConversation,
  createMockMessage,
  createMockState,
  createMockFriend
} from "./helpers/mobile-test-helpers";

jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");
jest.mock("react-native-vector-icons/FontAwesome", () => "FontAwesome");

function createMockPinnedResult(message: Message): MobileMessageSearchResult {
  return {
    conversation: createMockConversation(),
    message,
    summary: "置顶消息摘要"
  };
}

function createScreenProps(
  overrides: Partial<React.ComponentProps<typeof ChatDetailScreen>> = {}
) {
  const state = createMockState();
  return {
    activeConversation: createMockConversation(),
    activeMessages: [createMockMessage()],
    onLoadOlderMessages: jest.fn(),
    isLoadingOlderMessages: false,
    hasMoreHistory: false,
    peerPresence: null,
    isPeerTyping: false,
    peerTypingActivity: null,
    selectedMessageId: null,
    highlightedMessageId: null,
    isSearchVisible: false,
    groupManageVisible: false,
    pending: false,
    composerText: "",
    composerToolsVisible: false,
    replyTarget: null,
    selectedMessage: null,
    forwardingMessageId: null,
    conversations: [createMockConversation()],
    searchKeyword: "",
    searchFilter: "all" as MobileMessageSearchFilter,
    searchResults: [],
    pinnedMessages: [],
    pinnedMessagesVisible: false,
    onOpenPinnedMessages: jest.fn(),
    onClosePinnedMessages: jest.fn(),
    onJumpToPinnedMessage: jest.fn(),
    onUnpinPinnedMessage: jest.fn(),
    voiceRecordingActive: false,
    voiceRecordingElapsedMs: 0,
    voiceRecordingWaveform: [],
    voicePlayingMessageId: null,
    voicePlayingPositionMs: 0,
    currentUserId: state.snapshot.auth.user.userId,
    currentLoginUser: state.snapshot.auth.user,
    contacts: [createMockFriend()],
    groupReadState: null,
    onBack: jest.fn(),
    onOpenPeerProfile: jest.fn(),
    onOpenMemberProfile: jest.fn(),
    onToggleSearch: jest.fn(),
    onCancelSearch: jest.fn(),
    onSearchPrev: jest.fn(),
    onSearchNext: jest.fn(),
    onOpenGroupAnnouncement: jest.fn(),
    onOpenGroupManage: jest.fn(),
    onStartAudioCall: jest.fn(),
    onStartVideoCall: jest.fn(),
    onClearConversation: jest.fn(),
    onChangeSearchKeyword: jest.fn(),
    onChangeSearchFilter: jest.fn(),
    onSelectSearchResult: jest.fn(),
    canRecallMessage: jest.fn().mockReturnValue(true),
    onReply: jest.fn(),
    onForward: jest.fn(),
    onToggleFavorite: jest.fn(),
    onTogglePin: jest.fn(),
    onRecall: jest.fn(),
    onToggleReaction: jest.fn(),
    onCloseSelectedMessage: jest.fn(),
    onCancelForward: jest.fn(),
    onForwardToConversation: jest.fn(),
    onCancelReply: jest.fn(),
    onCancelVoiceRecording: jest.fn(),
    onSelectMessage: jest.fn(),
    onPreviewImage: jest.fn(),
    onPreviewVideo: jest.fn(),
    onOpenAttachment: jest.fn(),
    onToggleVoicePlayback: jest.fn(),
    isMultiSelectMode: false,
    multiSelectedIds: new Set<string>(),
    batchForwardMode: null,
    onEnterMultiSelectMode: jest.fn(),
    onExitMultiSelectMode: jest.fn(),
    onToggleMultiSelectMessage: jest.fn(),
    onStartBatchForward: jest.fn(),
    onBatchForwardToConversation: jest.fn(),
    onCancelBatchForward: jest.fn(),
    onSendImage: jest.fn(),
    onSendImageFromGallery: jest.fn(),
    onSendImageFromCamera: jest.fn(),
    onPickVideo: jest.fn(),
    onConfirmSendImage: jest.fn(),
    onCancelImagePreview: jest.fn(),
    onPlayVideo: jest.fn(),
    onSendFile: jest.fn(),
    onToggleComposerTools: jest.fn(),
    sendImageAsOriginal: false,
    pendingImageAsset: null,
    imagePreviewVisible: false,
    imagePreviewSendTopRight: false,
    cameraOverlayVisible: false,
    onOpenCameraOverlay: jest.fn(),
    onCloseCameraOverlay: jest.fn(),
    onConfirmCameraCapture: jest.fn(),
    onVideoRecordingError: jest.fn(),
    onToggleSendImageAsOriginal: jest.fn(),
    onStartVoiceRecording: jest.fn(),
    onStopVoiceRecording: jest.fn(),
    onChangeComposerText: jest.fn(),
    onSendMessage: jest.fn(),
    formatMediaDuration: jest.fn().mockReturnValue("00:02"),
    ...overrides
  };
}

describe("ChatDetailScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test("shows voice action when composer is empty and toggles tools panel", async () => {
    const props = createScreenProps();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ChatDetailScreen {...props} />);
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });
    const root = renderer!.root;

    expect(
      root.findAllByProps({ testID: "chat-voice-button" }).length
    ).toBeGreaterThan(0);
    expect(root.findAllByProps({ testID: "chat-send-button" })).toHaveLength(0);

    ReactTestRenderer.act(() => {
      root.findByProps({ testID: "chat-composer-attach" }).props.onPress();
    });

    expect(props.onToggleComposerTools).toHaveBeenCalledTimes(1);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("shows send action and attachment panel when typing", async () => {
    const props = createScreenProps({
      composerText: "你好",
      composerToolsVisible: true
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ChatDetailScreen {...props} />);
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });
    const root = renderer!.root;

    expect(
      root.findAllByProps({ testID: "chat-send-button" }).length
    ).toBeGreaterThan(0);
    expect(root.findAllByProps({ testID: "chat-voice-button" })).toHaveLength(
      0
    );

    ReactTestRenderer.act(() => {
      root.findByProps({ testID: "chat-send-button" }).props.onPress();
    });

    expect(props.onSendMessage).toHaveBeenCalledTimes(1);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("restores voice action after composer text is cleared", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatDetailScreen {...createScreenProps({ composerText: "hello" })} />
      );
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(
      renderer!.root.findAllByProps({ testID: "chat-send-button" }).length
    ).toBeGreaterThan(0);

    await ReactTestRenderer.act(async () => {
      renderer!.update(<ChatDetailScreen {...createScreenProps()} />);
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(
      renderer!.root.findAllByProps({ testID: "chat-voice-button" }).length
    ).toBeGreaterThan(0);
    expect(
      renderer!.root.findAllByProps({ testID: "chat-send-button" })
    ).toHaveLength(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("shows last active text for offline direct conversation", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatDetailScreen
          {...createScreenProps({
            peerPresence: {
              is_online: false,
              active_device_count: 0,
              last_active_at: "2026-04-10T10:30:00.000Z"
            }
          })}
        />
      );
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(renderer!.root.findAllByProps({ children: "在线" })).toHaveLength(0);
    expect(
      renderer!.root.findAll(
        node =>
          typeof node.props.children === "string" &&
          String(node.props.children).includes("活跃")
      ).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("shows voice activity status when peer is recording", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatDetailScreen
          {...createScreenProps({
            isPeerTyping: true,
            peerTypingActivity: "voice"
          })}
        />
      );
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(
      renderer!.root.findAllByProps({ children: "正在录音…" }).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("shows a single checkmark only on the newest own message", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatDetailScreen
          {...createScreenProps({
            activeConversation: createMockConversation({
              peer_last_read_sequence: 1
            }),
            activeMessages: [
              createMockMessage({
                client_message_id: "message-1",
                sequence: 1,
                status: 0,
                sender_id: 1
              }),
              createMockMessage({
                client_message_id: "message-2",
                sequence: 2,
                status: 0,
                sender_id: 1,
                created_at: "2026-04-08T00:01:00.000Z"
              })
            ]
          })}
        />
      );
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(
      renderer!.root.findAllByProps({
        testID: "message-read-receipt-delivered"
      })
    ).not.toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({
        testID: "message-read-receipt-read"
      })
    ).toHaveLength(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("shows a double checkmark only on the newest own message after peer reads", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatDetailScreen
          {...createScreenProps({
            activeConversation: createMockConversation({
              peer_last_read_sequence: 2
            }),
            activeMessages: [
              createMockMessage({
                client_message_id: "message-1",
                sequence: 1,
                status: 0,
                sender_id: 1
              }),
              createMockMessage({
                client_message_id: "message-2",
                sequence: 2,
                status: 0,
                sender_id: 1,
                created_at: "2026-04-08T00:01:00.000Z"
              })
            ]
          })}
        />
      );
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(
      renderer!.root.findAllByProps({
        testID: "message-read-receipt-delivered"
      })
    ).toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({
        testID: "message-read-receipt-read"
      })
    ).not.toHaveLength(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("renders pinned messages banner when pinned results exist", async () => {
    const pinnedMessage = createMockMessage({
      client_message_id: "pinned-1",
      server_message_id: "server-pinned-1",
      is_pinned: 1
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatDetailScreen
          {...createScreenProps({
            pinnedMessages: [createMockPinnedResult(pinnedMessage)]
          })}
        />
      );
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(
      renderer!.root.findAllByProps({ testID: "pinned-messages-banner" }).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("does not render banner without pinned results", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatDetailScreen {...createScreenProps()} />
      );
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(
      renderer!.root.findAllByProps({ testID: "pinned-messages-banner" })
    ).toHaveLength(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("hides banner during search", async () => {
    const pinnedMessage = createMockMessage({
      client_message_id: "pinned-1",
      server_message_id: "server-pinned-1",
      is_pinned: 1
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatDetailScreen
          {...createScreenProps({
            isSearchVisible: true,
            pinnedMessages: [createMockPinnedResult(pinnedMessage)]
          })}
        />
      );
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(
      renderer!.root.findAllByProps({ testID: "pinned-messages-banner" })
    ).toHaveLength(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("filters recalled messages out of the pinned banner", async () => {
    const recalledPinned = createMockMessage({
      client_message_id: "pinned-recalled",
      server_message_id: "server-pinned-recalled",
      is_pinned: 1,
      is_recalled: 1
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatDetailScreen
          {...createScreenProps({
            pinnedMessages: [createMockPinnedResult(recalledPinned)]
          })}
        />
      );
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(
      renderer!.root.findAllByProps({ testID: "pinned-messages-banner" })
    ).toHaveLength(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("single pinned message: tapping banner jumps directly", async () => {
    const pinnedMessage = createMockMessage({
      client_message_id: "pinned-1",
      server_message_id: "server-pinned-1",
      sequence: 42,
      is_pinned: 1
    });
    const result = createMockPinnedResult(pinnedMessage);
    const props = createScreenProps({ pinnedMessages: [result] });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ChatDetailScreen {...props} />);
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });

    ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ testID: "pinned-messages-banner" })
        .props.onPress();
    });

    expect(props.onJumpToPinnedMessage).toHaveBeenCalledWith(result);
    expect(props.onOpenPinnedMessages).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("multiple pinned messages: banner opens panel, item jumps and unpins", async () => {
    const msg1 = createMockMessage({
      client_message_id: "pinned-1",
      server_message_id: "server-pinned-1",
      sequence: 42,
      is_pinned: 1
    });
    const msg2 = createMockMessage({
      client_message_id: "pinned-2",
      server_message_id: "server-pinned-2",
      sequence: 99,
      is_pinned: 1
    });
    const results = [
      createMockPinnedResult(msg1),
      createMockPinnedResult(msg2)
    ];
    const props = createScreenProps({
      pinnedMessages: results,
      pinnedMessagesVisible: true
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ChatDetailScreen {...props} />);
    });
    ReactTestRenderer.act(() => {
      jest.runOnlyPendingTimers();
    });

    const root = renderer!.root;
    ReactTestRenderer.act(() => {
      root.findByProps({ testID: "pinned-messages-banner" }).props.onPress();
    });
    expect(props.onOpenPinnedMessages).toHaveBeenCalledTimes(1);

    expect(
      root.findAllByProps({ testID: "pinned-messages-sheet" }).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      root
        .findByProps({ testID: "pinned-sheet-item-pinned-2" })
        .props.onPress();
    });
    expect(props.onClosePinnedMessages).toHaveBeenCalledTimes(1);
    expect(props.onJumpToPinnedMessage).toHaveBeenCalledWith(results[1]);

    ReactTestRenderer.act(() => {
      root
        .findByProps({ testID: "pinned-sheet-unpin-pinned-1" })
        .props.onPress();
    });
    expect(props.onUnpinPinnedMessage).toHaveBeenCalledWith(msg1);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });
});
