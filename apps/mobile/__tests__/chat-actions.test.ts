jest.mock("../src/services/app-runtime", () => {
  const helpers = jest.requireActual("./helpers/mobile-test-helpers");
  return helpers.mobileAppModuleMock;
});

jest.mock("../src/platform/native-pickers", () => ({
  pickFromGallery: jest.fn(),
  pickFromCamera: jest.fn(),
  pickFileAttachment: jest.fn()
}));

import { Alert } from "react-native";
import {
  createMockConversation,
  createMockMessage,
  createMockState,
  createRunAction,
  mobileAppControllerMock,
  mobileRealtimeClientMock,
  resetMobileMocks,
  uploadMobileFileMock
} from "./helpers/mobile-test-helpers";
import { createConversationActions } from "../src/actions/chat/conversation-actions";
import { createMessageActions } from "../src/actions/chat/message-actions";
import {
  pickFileAttachment,
  pickFromCamera,
  pickFromGallery
} from "../src/platform/native-pickers";

describe("mobile chat actions", () => {
  beforeEach(() => {
    resetMobileMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("open conversation resets stale selection state", async () => {
    const state = createMockState({
      composerText: "old draft",
      composerToolsVisible: true,
      replyTargetId: "reply-1",
      selectedMessageId: "message-1",
      highlightedMessageId: "message-1",
      forwardingMessageId: "forward-1"
    });
    const runAction = createRunAction(state);
    const conversation = createMockConversation({
      client_conversation_id: "conversation-2",
      draft: "new draft"
    });
    const actions = createConversationActions({ state, runAction });

    await actions.handleOpenConversation(conversation);

    expect(state.activeConversationId).toBe("conversation-2");
    expect(state.composerText).toBe("new draft");
    expect(state.composerToolsVisible).toBe(false);
    expect(state.replyTargetId).toBeNull();
    expect(state.selectedMessageId).toBeNull();
    expect(state.highlightedMessageId).toBeNull();
    expect(state.forwardingMessageId).toBeNull();
  });

  test("clear conversation confirms and executes destructive action", async () => {
    const state = createMockState();
    const runAction = createRunAction(state);
    const actions = createConversationActions({ state, runAction });

    actions.handleClearConversation();

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    await buttons[1].onPress();

    expect(runAction).toHaveBeenCalledWith(
      "正在清空本地会话消息…",
      expect.any(Function),
      "本地会话消息已清空"
    );
    expect(
      mobileAppControllerMock.clearConversationMessages
    ).toHaveBeenCalledWith(state.activeConversation.client_conversation_id);
  });

  test("conversation list actions delegate to controller helpers", async () => {
    const state = createMockState();
    const runAction = createRunAction(state);
    const actions = createConversationActions({ state, runAction });
    const conversation = createMockConversation({
      client_conversation_id: "conversation-list-1",
      unread_count: 0
    });

    await actions.handleToggleConversationMute(conversation);
    await actions.handleToggleConversationPin(conversation);
    await actions.handleToggleConversationArchive(conversation);
    await actions.handleToggleConversationRead(conversation);

    expect(
      mobileAppControllerMock.updateConversationState
    ).toHaveBeenNthCalledWith(1, {
      clientConversationId: "conversation-list-1",
      is_muted: 1
    });
    expect(
      mobileAppControllerMock.updateConversationState
    ).toHaveBeenNthCalledWith(2, {
      clientConversationId: "conversation-list-1",
      is_pinned: 1
    });
    expect(
      mobileAppControllerMock.updateConversationState
    ).toHaveBeenNthCalledWith(3, {
      clientConversationId: "conversation-list-1",
      is_archived: 1
    });
    expect(mobileAppControllerMock.markConversationUnread).toHaveBeenCalledWith(
      "conversation-list-1"
    );
  });

  test("mark read uses controller read helper when conversation already has unread", async () => {
    const state = createMockState();
    const runAction = createRunAction(state);
    const actions = createConversationActions({ state, runAction });
    const conversation = createMockConversation({
      client_conversation_id: "conversation-list-2",
      unread_count: 3
    });

    await actions.handleToggleConversationRead(conversation);

    expect(mobileAppControllerMock.markConversationRead).toHaveBeenCalledWith(
      "conversation-list-2"
    );
  });

  test("delete conversation confirms and executes destructive action", async () => {
    const state = createMockState();
    const runAction = createRunAction(state);
    const actions = createConversationActions({ state, runAction });
    const conversation = createMockConversation({
      client_conversation_id: "conversation-delete-1"
    });

    actions.handleDeleteConversation(conversation);

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    await buttons[1].onPress();

    expect(mobileAppControllerMock.deleteConversation).toHaveBeenCalledWith(
      "conversation-delete-1"
    );
  });

  test("load attachment center hydrates image and file tabs", async () => {
    const state = createMockState();
    const runAction = createRunAction(state);
    const imageResult = [
      {
        conversation: createMockConversation(),
        message: createMockMessage({
          content: {
            type: 2,
            url: "https://example.test/photo.jpg",
            name: "photo.jpg",
            size: 123,
            mime_type: "image/jpeg"
          }
        })
      }
    ];
    const fileResult = [
      {
        conversation: createMockConversation(),
        message: createMockMessage({
          content: {
            type: 2,
            url: "https://example.test/doc.pdf",
            name: "doc.pdf",
            size: 456,
            mime_type: "application/pdf"
          }
        })
      }
    ];
    mobileAppControllerMock.listAttachmentMessages
      .mockResolvedValueOnce(imageResult)
      .mockResolvedValueOnce(fileResult);
    const actions = createConversationActions({ state, runAction });

    await actions.loadAttachmentCenter();

    expect(state.attachmentItems).toEqual({
      media: imageResult,
      files: fileResult
    });
    expect(state.status.text).toBe("附件中心已刷新");
    // Attachment center refresh is background bookkeeping — the loaded list
    // itself is the user-visible signal, so the status must remain `silent`.
    expect(state.status.level).toBe("silent");
    expect(state.pending).toBe(false);
  });

  test("send text message confirms ack and clears composer state", async () => {
    const state = createMockState({
      composerText: "hello world",
      composerToolsVisible: true,
      replyTargetId: "reply-1",
      selectedMessageId: "selected-1"
    });
    const optimisticMessage = createMockMessage({
      client_message_id: "optimistic-1"
    });
    mobileAppControllerMock.createOptimisticTextMessage.mockResolvedValue(
      optimisticMessage
    );
    const actions = createMessageActions({ state });

    await actions.handleSendMessage();

    expect(
      mobileAppControllerMock.createOptimisticTextMessage
    ).toHaveBeenCalledWith({
      clientConversationId: state.activeConversation.client_conversation_id,
      text: "hello world",
      mentions: [],
      mentionAll: false,
      replyToClientMessageId: "reply-1"
    });
    expect(mobileRealtimeClientMock.sendChatMessage).toHaveBeenCalledWith(
      optimisticMessage
    );
    expect(
      mobileAppControllerMock.markOutgoingMessageSending
    ).toHaveBeenCalledWith({
      clientConversationId: optimisticMessage.client_conversation_id,
      clientMessageId: optimisticMessage.client_message_id
    });
    expect(mobileAppControllerMock.confirmMessageAck).toHaveBeenCalledWith({
      server_message_id: 101
    });
    expect(state.composerText).toBe("");
    expect(state.composerToolsVisible).toBe(false);
    expect(state.replyTargetId).toBeNull();
    expect(state.selectedMessageId).toBeNull();
    expect(state.status.text).toBe("");
  });

  test("send text message failure records failed optimistic message", async () => {
    const state = createMockState({
      composerText: "boom"
    });
    const optimisticMessage = createMockMessage({
      client_message_id: "optimistic-2"
    });
    mobileAppControllerMock.createOptimisticTextMessage.mockResolvedValue(
      optimisticMessage
    );
    mobileRealtimeClientMock.sendChatMessage.mockRejectedValue(
      new Error("socket down")
    );
    const actions = createMessageActions({ state });

    await actions.handleSendMessage();

    expect(
      mobileAppControllerMock.markOutgoingMessageSending
    ).toHaveBeenCalledWith({
      clientConversationId: optimisticMessage.client_conversation_id,
      clientMessageId: optimisticMessage.client_message_id
    });
    expect(mobileAppControllerMock.failMessageSend).toHaveBeenCalledWith({
      clientConversationId: optimisticMessage.client_conversation_id,
      clientMessageId: optimisticMessage.client_message_id,
      errorMessage: "socket down"
    });
    expect(state.error).toBe("socket down");
    expect(state.status.text).toBe("发送失败");
    expect(state.pending).toBe(false);
  });

  test("send text message blocked failure does not raise global error panel", async () => {
    const state = createMockState({
      composerText: "blocked"
    });
    const optimisticMessage = createMockMessage({
      client_message_id: "optimistic-blocked"
    });
    mobileAppControllerMock.createOptimisticTextMessage.mockResolvedValue(
      optimisticMessage
    );
    mobileRealtimeClientMock.sendChatMessage.mockRejectedValue(
      new Error("你已拉黑对方，无法发送消息")
    );
    const actions = createMessageActions({ state });

    await actions.handleSendMessage();

    expect(mobileAppControllerMock.failMessageSend).toHaveBeenCalledWith({
      clientConversationId: optimisticMessage.client_conversation_id,
      clientMessageId: optimisticMessage.client_message_id,
      errorMessage: "你已拉黑对方，无法发送消息"
    });
    expect(state.error).toBe("");
    expect(state.status.text).toBe("");
  });

  test("composer typing state is sent for direct chat and cleared after send", async () => {
    const state = createMockState({
      composerText: "hello world"
    });
    const optimisticMessage = createMockMessage({
      client_message_id: "optimistic-typing"
    });
    mobileAppControllerMock.createOptimisticTextMessage.mockResolvedValue(
      optimisticMessage
    );
    const actions = createMessageActions({ state });

    actions.handleComposerTextChange("hello world");
    await actions.handleSendMessage();

    expect(mobileRealtimeClientMock.sendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messageClassify: "typing",
        active: true,
        activity: "text",
        sender_user_id: 1,
        conversation_id: "server-conversation-1"
      })
    );
    expect(mobileRealtimeClientMock.sendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messageClassify: "typing",
        active: false,
        activity: "text",
        sender_user_id: 1,
        conversation_id: "server-conversation-1"
      })
    );
  });

  test("send file attachment silently handles picker cancellation", async () => {
    const state = createMockState();
    (pickFileAttachment as jest.Mock).mockResolvedValue(null);
    const actions = createMessageActions({ state });

    await actions.handleSendAttachment("file");

    expect(uploadMobileFileMock).not.toHaveBeenCalled();
    expect(state.status.text).not.toMatch(/取消/);
    expect(state.pending).toBe(false);
  });

  test("gallery picker opens preview without uploading; confirm sends; cancel clears", async () => {
    const state = createMockState();
    const pickedAsset = {
      uri: "file:///tmp/photo.jpg",
      name: "photo.jpg",
      type: "image/jpeg",
      size: 1024
    };
    (pickFromGallery as jest.Mock).mockResolvedValue(pickedAsset);
    const actions = createMessageActions({ state });

    await actions.handleSendImageFromGallery();

    expect(state.pendingImageAsset).toEqual(pickedAsset);
    expect(state.imagePreviewVisible).toBe(true);
    expect(uploadMobileFileMock).not.toHaveBeenCalled();

    actions.handleCancelImagePreview();
    expect(state.pendingImageAsset).toBeNull();
    expect(state.imagePreviewVisible).toBe(false);
  });

  test("camera picker is silent when user cancels", async () => {
    const state = createMockState();
    (pickFromCamera as jest.Mock).mockResolvedValue(null);
    const actions = createMessageActions({ state });

    await actions.handleSendImageFromCamera();

    expect(state.status.text).not.toMatch(/取消/);
    expect(state.imagePreviewVisible).toBe(false);
    expect(state.pendingImageAsset).toBeNull();
  });

  test("send file attachment uploads and sends optimistic message", async () => {
    const state = createMockState({
      composerToolsVisible: true,
      replyTargetId: "reply-2",
      selectedMessageId: "selected-2"
    });
    const pickedFile = {
      uri: "file:///tmp/report.pdf",
      name: "report.pdf",
      type: "application/pdf",
      size: 2048
    };
    const optimisticPending = createMockMessage({
      client_message_id: "optimistic-file",
      status: 1,
      content: {
        type: 2,
        url: "",
        upload_id: "",
        name: "report.pdf",
        size: 2048,
        mime_type: "application/pdf",
        upload_pending: true,
        local_preview_uri: pickedFile.uri
      }
    });
    const patchedMessage = createMockMessage({
      client_message_id: "optimistic-file",
      content: {
        type: 2,
        upload_id: "upload-report-1",
        url: "https://example.test/report.pdf",
        name: "report.pdf",
        size: 2048,
        mime_type: "application/pdf"
      }
    });
    (pickFileAttachment as jest.Mock).mockResolvedValue(pickedFile);
    uploadMobileFileMock.mockResolvedValue({
      upload_id: "upload-report-1",
      object_name: "upload-report-1.pdf",
      originalname: "report.pdf",
      url: "https://example.test/report.pdf",
      size: 2048,
      mime_type: "application/pdf"
    });
    mobileAppControllerMock.createOptimisticPendingAttachmentMessage.mockResolvedValue(
      optimisticPending
    );
    mobileAppControllerMock.patchAttachmentUploaded.mockResolvedValue(
      patchedMessage
    );
    const actions = createMessageActions({ state });

    await actions.handleSendAttachment("file");

    // Phase 1: pending placeholder inserted before upload starts.
    expect(
      mobileAppControllerMock.createOptimisticPendingAttachmentMessage
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        clientConversationId: state.activeConversation.client_conversation_id,
        asset: expect.objectContaining({
          name: "report.pdf",
          size: 2048,
          mimeType: "application/pdf",
          localPreviewUri: pickedFile.uri
        }),
        replyToClientMessageId: "reply-2"
      })
    );

    // Phase 2: upload + patch + WS send.
    expect(uploadMobileFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: pickedFile.uri,
        name: pickedFile.name,
        type: pickedFile.type,
        size: pickedFile.size
      })
    );
    expect(
      mobileAppControllerMock.patchAttachmentUploaded
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        clientConversationId: state.activeConversation.client_conversation_id,
        clientMessageId: "optimistic-file",
        attachment: expect.objectContaining({
          uploadId: "upload-report-1",
          name: "report.pdf",
          url: "https://example.test/report.pdf",
          size: 2048,
          mimeType: "application/pdf"
        })
      })
    );
    expect(mobileRealtimeClientMock.sendChatMessage).toHaveBeenCalledWith(
      patchedMessage
    );
    expect(state.composerToolsVisible).toBe(false);
    expect(state.replyTargetId).toBeNull();
    expect(state.selectedMessageId).toBeNull();
    expect(state.status.text).toBe("");
  });

  test("send attachment closes the tools panel immediately after selection", async () => {
    const state = createMockState({
      composerToolsVisible: true
    });
    const pickedFile = {
      uri: "file:///tmp/broken-image.png",
      name: "broken-image.png",
      type: "image/png",
      size: 1024
    };
    const optimisticPending = createMockMessage({
      client_message_id: "optimistic-broken",
      status: 1,
      content: {
        type: 2,
        url: "",
        upload_id: "",
        name: "broken-image.png",
        size: 1024,
        mime_type: "image/png",
        upload_pending: true,
        local_preview_uri: pickedFile.uri
      }
    });
    (pickFileAttachment as jest.Mock).mockResolvedValue(pickedFile);
    mobileAppControllerMock.createOptimisticPendingAttachmentMessage.mockResolvedValue(
      optimisticPending
    );
    uploadMobileFileMock.mockRejectedValue(new Error("network request failed"));
    const actions = createMessageActions({ state });

    await actions.handleSendAttachment("file");

    expect(state.composerToolsVisible).toBe(false);
    // Upload failure → markAttachmentUploadFailed writes upload_error into the
    // optimistic pending row; status toast becomes "附件发送失败"; the bubble
    // itself renders the failure via PendingAttachmentBubble.
    expect(
      mobileAppControllerMock.markAttachmentUploadFailed
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        clientConversationId: state.activeConversation.client_conversation_id,
        clientMessageId: "optimistic-broken",
        errorMessage: "network request failed"
      })
    );
    expect(state.error).toBe("network request failed");
    expect(state.status.text).toBe("附件发送失败");
  });

  test("forward, favorite, pin and recall delegate to app core", async () => {
    const state = createMockState({
      forwardingMessageId: "source-message",
      selectedMessageId: "selected-3"
    });
    const forwarded = createMockMessage({
      client_message_id: "forwarded-message"
    });
    mobileAppControllerMock.createOptimisticForwardMessage.mockResolvedValue(
      forwarded
    );
    const actions = createMessageActions({ state });
    const message = createMockMessage();

    await actions.handleForwardToConversation("conversation-target");
    await actions.handleToggleFavorite(message);
    await actions.handleTogglePin(message);
    await actions.handleRecall(message);

    expect(
      mobileAppControllerMock.createOptimisticForwardMessage
    ).toHaveBeenCalledWith({
      sourceClientConversationId:
        state.activeConversation.client_conversation_id,
      sourceClientMessageId: "source-message",
      targetClientConversationId: "conversation-target"
    });
    expect(mobileAppControllerMock.toggleFavoriteMessage).toHaveBeenCalled();
    expect(mobileAppControllerMock.togglePinMessage).toHaveBeenCalled();
    expect(mobileAppControllerMock.recallMessage).toHaveBeenCalled();
    expect(state.selectedMessageId).toBeNull();
    expect(state.forwardingMessageId).toBeNull();
    expect(state.status.text).toBe("消息已撤回");
  });

  test("canRecallMessage only returns true for self sent server messages", () => {
    const state = createMockState();
    const actions = createMessageActions({ state });

    expect(actions.canRecallMessage(createMockMessage())).toBe(true);
    expect(
      actions.canRecallMessage(
        createMockMessage({ sender_id: 2, client_message_id: "message-2" })
      )
    ).toBe(false);
    expect(
      actions.canRecallMessage(
        createMockMessage({
          server_message_id: "",
          client_message_id: "message-3"
        })
      )
    ).toBe(false);
    expect(
      actions.canRecallMessage(
        createMockMessage({ is_recalled: 1, client_message_id: "message-4" })
      )
    ).toBe(false);
  });
});
