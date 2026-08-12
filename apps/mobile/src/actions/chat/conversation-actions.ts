import { Alert, Linking } from "react-native";

import type { MobileMessageSearchResult } from "@mushroom/app-core";
import {
  isAudioFileMessageContent,
  isFileMessageContent,
  isImageFileMessageContent,
  isVideoFileMessageContent,
  isVoiceMessageContent,
  pickAttachmentDisplayUri,
  type Conversation,
  type Message,
  type MessageFileContent
} from "@mushroom/shared";
import { mobileAppController } from "../../services/app-runtime";
import {
  downloadMobileMediaCache,
  resolveMobileMediaCache,
  resolveMobileMediaCacheSync,
  type MobileMediaCacheCategory
} from "../../platform/media-cache";
import { getRefreshedAttachment } from "../../services/refresh-attachment-urls";
import type { RunAction } from "../action-types";
import type { MobileAppState } from "../../app/controller/useMobileAppState";
import type { PreviewImageItem } from "../../app/controller/state/useChatInteractionState";
import { buildCacheInput } from "../../features/chat/bubbles/utils/buildCacheInput";
import { getReadableErrorMessage } from "../../utils/error-message";
import { i18n } from "../../i18n";

function resolveMediaCategory(
  content: Message["content"]
): MobileMediaCacheCategory {
  if (isImageFileMessageContent(content)) {
    return "images";
  }
  if (isVideoFileMessageContent(content)) {
    return "video";
  }
  if (isVoiceMessageContent(content)) {
    return "voice";
  }
  if (isAudioFileMessageContent(content)) {
    return "voice";
  }
  return "files";
}

function buildMediaCacheInput(input: {
  username: string;
  message: Message;
  category: MobileMediaCacheCategory;
}) {
  if (!isFileMessageContent(input.message.content)) {
    throw new Error("Message does not contain a file.");
  }

  return {
    username: input.username,
    remoteUrl: input.message.content.url,
    category: input.category,
    messageId:
      input.message.server_message_id || input.message.client_message_id,
    uploadId: input.message.content.upload_id,
    originalName: input.message.content.name,
    mimeType: input.message.content.mime_type,
    size: input.message.content.size
  };
}

export function createConversationActions(params: {
  state: MobileAppState;
  runAction: RunAction;
}) {
  const { state, runAction } = params;

  // -----------------------------------------------------------------------
  // 共享辅助函数：预加载会话消息并注入 React snapshot。
  // -----------------------------------------------------------------------

  /** 将消息注入 React snapshot，监听组件立即感知。 */
  function updateSnapshotMessages(
    conversationId: string,
    messages: Message[]
  ): void {
    if (!state.snapshot) return;
    state.setSnapshot({
      ...state.snapshot,
      data: {
        ...state.snapshot.data,
        messagesByConversation: {
          ...state.snapshot.data.messagesByConversation,
          [conversationId]: messages
        }
      }
    });
  }

  /**
   * 预加载会话消息并注入 snapshot。
   * 异步 SQLite 读取，完成后注入 snapshot 使 UI 立即感知。
   * 不阻塞调用方（setActiveConversationId 由调用方负责）。
   */
  function preloadAndInjectMessages(conversationId: string): void {
    void (async () => {
      try {
        const messages =
          await mobileAppController.preloadConversationMessages(conversationId);
        updateSnapshotMessages(conversationId, messages);
      } catch {
        // 静默失败，后续 publishSnapshot 会兜底。
      }
    })();
  }

  async function handleOpenConversation(conversation: Conversation) {
    state.setError("");
    state.setComposerText(conversation.draft ?? "");
    state.setComposerToolsVisible(false);
    state.setReplyTargetId(null);
    state.setSelectedMessageId(null);
    state.setHighlightedMessageId(null);
    state.setForwardingMessageId(null);

    preloadAndInjectMessages(conversation.client_conversation_id);

    // 立即设置 activeConversationId 触发导航（状态更新由 React 自动批量合并），
    // 而 snapshot 的数据加载会在下一次 snapshot subscribe 回调中异步完成，
    // 避免在导航动画期间阻塞 JS 线程。
    state.setActiveConversationId(conversation.client_conversation_id);
  }

  async function loadOlderMessages() {
    if (!state.activeConversation) {
      return;
    }

    const conversationId = state.activeConversation.client_conversation_id;
    state.setLoadingOlderConversationId(conversationId);
    try {
      await mobileAppController.loadOlderMessages(conversationId, 50);
    } finally {
      state.setLoadingOlderConversationId(current =>
        current === conversationId ? null : current
      );
    }
  }

  async function handleOpenConversationByUserId(userId: number) {
    state.setError("");
    let latestConversation =
      await mobileAppController.getConversationByPeerId(userId);

    if (!latestConversation) {
      latestConversation =
        await mobileAppController.ensureDirectConversation(userId);
    }

    if (!latestConversation) {
      state.setError(i18n.t("conversationActions.cannotOpenChat"));
      return null;
    }

    state.setTab("chats");
    state.setComposerText(latestConversation.draft ?? "");
    state.setComposerToolsVisible(false);
    state.setReplyTargetId(null);
    state.setSelectedMessageId(null);
    state.setHighlightedMessageId(null);
    state.setForwardingMessageId(null);

    preloadAndInjectMessages(latestConversation.client_conversation_id);

    state.setActiveConversationId(latestConversation.client_conversation_id);
    return latestConversation;
  }

  function handleClearConversation(conversation?: Conversation) {
    const target = conversation ?? state.activeConversation;
    if (!target) {
      return;
    }

    Alert.alert(
      i18n.t("conversationActions.clearTitle"),
      i18n.t("conversationActions.clearDescription"),
      [
        {
          text: i18n.t("common.cancel"),
          style: "cancel"
        },
        {
          text: i18n.t("conversationActions.clear"),
          style: "destructive",
          onPress: () => {
            void runAction(
              i18n.t("conversationActions.clearing"),
              () =>
                mobileAppController.clearConversationMessages(
                  target.client_conversation_id
                ),
              i18n.t("conversationActions.cleared")
            );
          }
        }
      ]
    );
  }

  async function silentToggle(
    successText: string,
    perform: () => Promise<unknown>
  ) {
    state.setPending(true);
    state.setError("");
    try {
      await perform();
      state.setStatus(successText, "silent");
    } catch (currentError) {
      const readableError = getReadableErrorMessage(currentError);
      state.setError(readableError);
      state.setStatus(readableError);
    } finally {
      state.setPending(false);
    }
  }

  async function handleToggleConversationMute(conversation: Conversation) {
    const nextMuted = Number(conversation.is_muted || 0) > 0 ? 0 : 1;
    await silentToggle(
      nextMuted
        ? i18n.t("conversationActions.muteEnabled")
        : i18n.t("conversationActions.muteDisabled"),
      () =>
        mobileAppController.updateConversationState({
          clientConversationId: conversation.client_conversation_id,
          is_muted: nextMuted
        })
    );
  }

  async function handleToggleConversationPin(conversation: Conversation) {
    const nextPinned = Number(conversation.is_pinned || 0) > 0 ? 0 : 1;
    await silentToggle(
      nextPinned
        ? i18n.t("conversationActions.pinned")
        : i18n.t("conversationActions.unpinned"),
      () =>
        mobileAppController.updateConversationState({
          clientConversationId: conversation.client_conversation_id,
          is_pinned: nextPinned
        })
    );
  }

  async function handleToggleConversationArchive(conversation: Conversation) {
    const nextArchived = Number(conversation.is_archived || 0) > 0 ? 0 : 1;
    await silentToggle(
      nextArchived
        ? i18n.t("conversationActions.archived")
        : i18n.t("conversationActions.unarchived"),
      () =>
        mobileAppController.updateConversationState({
          clientConversationId: conversation.client_conversation_id,
          is_archived: nextArchived
        })
    );
  }

  function handleDeleteConversation(conversation: Conversation) {
    Alert.alert(
      i18n.t("conversationActions.deleteTitle"),
      i18n.t("conversationActions.deleteDescription"),
      [
        {
          text: i18n.t("common.cancel"),
          style: "cancel"
        },
        {
          text: i18n.t("conversationActions.delete"),
          style: "destructive",
          onPress: () => {
            void runAction(
              i18n.t("conversationActions.deleting"),
              () =>
                mobileAppController.deleteConversation(
                  conversation.client_conversation_id
                ),
              i18n.t("conversationActions.deleted")
            );
          }
        }
      ]
    );
  }

  async function handleToggleConversationRead(conversation: Conversation) {
    const hasUnread = Number(conversation.unread_count || 0) > 0;
    await runAction(
      "",
      () =>
        hasUnread
          ? mobileAppController.markConversationRead(
              conversation.client_conversation_id
            )
          : mobileAppController.markConversationUnread(
              conversation.client_conversation_id
            ),
      ""
    );
  }

  function handleSelectMessage(message: Message) {
    state.setSelectedMessageId(current =>
      current === message.client_message_id ? null : message.client_message_id
    );
  }

  function openImagePreview(message: Message, allImageMessages: Message[]) {
    if (!isFileMessageContent(message.content)) {
      return;
    }
    const username = state.snapshot?.auth.user?.username ?? "unknown";

    const imageMessages = allImageMessages.filter(m =>
      isImageFileMessageContent(m.content)
    );
    const items: PreviewImageItem[] = imageMessages.map(m => {
      const content = m.content as unknown as MessageFileContent;
      const cacheInput = buildCacheInput({
        username,
        message: m,
        content,
        category: "images"
      });
      const cacheRecord = resolveMobileMediaCacheSync(cacheInput);
      const refreshed = content.upload_id
        ? getRefreshedAttachment(content.upload_id)
        : undefined;
      const url = pickAttachmentDisplayUri(
        content,
        refreshed,
        cacheRecord?.localUri ?? null
      );
      return {
        url,
        content: {
          upload_id: content.upload_id,
          url: content.url,
          thumb_url: content.thumb_url,
          preview_url: content.preview_url,
          local_preview_uri: content.local_preview_uri,
          message_id: m.client_message_id || m.server_message_id || null
        }
      };
    });

    const targetUploadId = (message.content as MessageFileContent).upload_id;
    const startIndex = items.findIndex(
      item => item.content.upload_id === targetUploadId
    );

    state.openImagePreviewList(items, startIndex >= 0 ? startIndex : 0);
  }

  function openVideoPreview(message: Message) {
    if (!isFileMessageContent(message.content)) {
      return;
    }
    const username = state.snapshot?.auth.user?.username ?? "unknown";
    const cacheInput = buildMediaCacheInput({
      username,
      message,
      category: "video"
    });
    const uploadId = message.content.upload_id ?? null;
    const messageId =
      message.client_message_id || message.server_message_id || null;
    state.setPreviewVideo({ uri: message.content.url, uploadId, messageId });
    void downloadMobileMediaCache(cacheInput)
      .then(record => {
        state.setPreviewVideo({ uri: record.localUri, uploadId, messageId });
      })
      .catch(() => undefined);
  }

  async function openAttachmentInSystem(message: Message) {
    if (!isFileMessageContent(message.content)) {
      return;
    }

    const isOwn =
      Number(message.sender_id) === Number(state.snapshot?.auth.user?.userId);

    const content = message.content as MessageFileContent;

    // 自己发送的附件：优先使用本地 outbox 路径，避免重复下载
    if (isOwn && content.local_source_ref) {
      const localPath = content.local_source_ref.startsWith("file://")
        ? content.local_source_ref
        : `file://${content.local_source_ref}`;
      const canOpen = await Linking.canOpenURL(localPath).catch(() => false);
      if (canOpen) {
        const opened = await Linking.openURL(localPath)
          .then(() => true)
          .catch(() => false);
        if (opened) return;
      }
    }

    const username = state.snapshot?.auth.user?.username ?? "unknown";
    const category = resolveMediaCategory(message.content);
    const cacheInput = buildMediaCacheInput({
      username,
      message,
      category
    });
    const cached = await resolveMobileMediaCache(cacheInput).catch(() => null);
    let url =
      cached?.status === "ready" ? cached.localUri : message.content.url;

    if (!cached || cached.status !== "ready") {
      state.setStatus(
        isVideoFileMessageContent(message.content)
          ? i18n.t("conversationActions.downloadingVideo")
          : i18n.t("conversationActions.downloadingAttachment")
      );
      try {
        const record = await downloadMobileMediaCache(cacheInput);
        url = record.localUri;
      } catch {
        state.setStatus(
          isVideoFileMessageContent(message.content)
            ? i18n.t("conversationActions.videoNotDownloaded")
            : i18n.t("conversationActions.attachmentNotDownloaded")
        );
        return;
      }
    }

    const canOpen = await Linking.canOpenURL(url).catch(() => true);
    if (!canOpen) {
      state.setStatus(i18n.t("conversationActions.cannotOpenAttachment"));
      return;
    }

    await Linking.openURL(url);
  }

  function closeConversationDetail() {
    if (state.typingIndicatorTimerRef.current) {
      clearTimeout(state.typingIndicatorTimerRef.current);
      state.typingIndicatorTimerRef.current = null;
    }
    if (state.typingSignalTimerRef.current) {
      clearTimeout(state.typingSignalTimerRef.current);
      state.typingSignalTimerRef.current = null;
    }
    state.setActiveConversationId(null);
    state.setComposerText("");
    state.setTypingConversationId(null);
    state.setPeerTypingActivity(null);
    state.lastTypingSignalKeyRef.current = "";
    state.setComposerToolsVisible(false);
    state.setReplyTargetId(null);
    state.setSelectedMessageId(null);
    state.setForwardingMessageId(null);
    state.setIsSearchVisible(false);
    state.setSearchKeyword("");
    state.setSearchResults([]);
    state.setVoicePlayingMessageId(null);
    state.exitMultiSelectMode();
  }

  async function loadAttachmentCenter() {
    state.setPending(true);
    state.setError("");
    state.setStatus("");

    try {
      const [media, files] = await Promise.all([
        mobileAppController.listAttachmentMessages("media"),
        mobileAppController.listAttachmentMessages("files")
      ]);
      state.setAttachmentItems({ media, files });
      state.setStatus(
        i18n.t("conversationActions.attachmentCenterRefreshed"),
        "silent"
      );
    } catch (currentError) {
      state.setError(
        currentError instanceof Error
          ? currentError.message
          : String(currentError ?? "")
      );
      state.setStatus(i18n.t("conversationActions.attachmentCenterLoadFailed"));
    } finally {
      state.setPending(false);
    }
  }

  async function handleOpenWorkspaceSearchResult(
    result: MobileMessageSearchResult
  ) {
    // T6: WorkspaceSearch is now a Stack screen owning its own keyword/results
    // state; opening a result simply pushes Chat via the wantsChat effect.
    state.setTab("chats");
    await handleOpenConversation(result.conversation);
    state.setHighlightedMessageId(result.message.client_message_id);
    state.setSelectedMessageId(result.message.client_message_id);
    state.setStatus("");
  }

  async function handleOpenAttachmentResult(
    result: MobileMessageSearchResult,
    previewMedia = false
  ) {
    state.setAttachmentCenterVisible(false);
    state.setTab("chats");
    await handleOpenConversation(result.conversation);
    state.setHighlightedMessageId(result.message.client_message_id);
    state.setSelectedMessageId(result.message.client_message_id);
    if (
      previewMedia &&
      isFileMessageContent(result.message.content) &&
      isImageFileMessageContent(result.message.content)
    ) {
      // 走统一的 resolve-first 流程，避免裸用过期远程 URL 触发破图闪屏。
      openImagePreview(result.message, [result.message]);
    } else if (
      previewMedia &&
      isFileMessageContent(result.message.content) &&
      isVideoFileMessageContent(result.message.content)
    ) {
      state.setPreviewVideo({
        uri: result.message.content.url,
        uploadId: result.message.content.upload_id ?? null,
        messageId:
          result.message.client_message_id ||
          result.message.server_message_id ||
          null
      });
    }
    state.setStatus("");
  }

  return {
    handleOpenConversation,
    loadOlderMessages,
    handleOpenConversationByUserId,
    handleClearConversation,
    handleToggleConversationMute,
    handleToggleConversationPin,
    handleToggleConversationArchive,
    handleDeleteConversation,
    handleToggleConversationRead,
    handleSelectMessage,
    openImagePreview,
    openVideoPreview,
    openAttachmentInSystem,
    closeConversationDetail,
    loadAttachmentCenter,
    handleOpenWorkspaceSearchResult,
    handleOpenAttachmentResult
  };
}
