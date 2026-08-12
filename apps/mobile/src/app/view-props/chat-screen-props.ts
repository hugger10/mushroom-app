import {
  buildTypingPreview,
  formatMediaDuration,
  getTextMessageText,
  isFileMessageContent,
  isImageFileMessageContent,
  isVideoFileMessageContent,
  isReadReceiptsEnabled,
  type Message,
  type MessageFileContent
} from "@mushroom/shared";
import { applyConversationDisplayFallbacks } from "../../utils/display";
import { mobileAppController } from "../../services/app-runtime";
import { navigateApp } from "../../navigation/app-navigation";
import { getReadableErrorMessage } from "../../utils/error-message";
import { mobileApiBaseUrl } from "../../services/runtime/device-identity";
import { saveToAlbum } from "../../platform/save-to-album";
import { saveFileToDevice } from "../../platform/save-file";
import Clipboard from "@react-native-clipboard/clipboard";
import * as RNFS from "react-native-fs";
import type { PickedMediaAsset } from "../../platform/native-pickers";
import log from "../../utils/log";
import type { createMobileCallActions } from "../../actions/call-actions";
import type { createMobileChatActions } from "../../actions/chat-actions";
import type { MobileMessageSearchResult } from "@mushroom/app-core";
import type { MobileAppState } from "../controller/useMobileAppState";
import { i18n } from "../../i18n";

type ChatActions = ReturnType<typeof createMobileChatActions>;
type CallActions = ReturnType<typeof createMobileCallActions>;

// Module-scoped registry for the message-list scroll-to-latest function
// registered by ChatDetailScreen. Stored outside React so that send actions
// (which run outside the component tree) can trigger a scroll without prop
// drilling or extra re-renders.
//
// Keyed by client_conversation_id so that two ChatDetailScreen instances
// briefly mounted simultaneously during a navigation transition do not
// clobber each other's registration when the older one unmounts.
const scrollRegistry = new Map<string, (animated: boolean) => void>();
const highlightTimerByConversation = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
// 单调递增的"高亮请求 token"：每次点击引用/搜索跳转都会自增，用于丢弃过期
// 的异步 ensureMessageVisible 回调，避免乱序 resolve 时旧请求覆盖新高亮。
const highlightRequestTokenByConversation = new Map<string, number>();

function bumpHighlightRequestToken(conversationKey: string): number {
  const next =
    (highlightRequestTokenByConversation.get(conversationKey) ?? 0) + 1;
  highlightRequestTokenByConversation.set(conversationKey, next);
  return next;
}

function registerScrollToLatest(
  conversationId: string,
  fn: ((animated: boolean) => void) | null
) {
  if (fn) {
    scrollRegistry.set(conversationId, fn);
  } else {
    scrollRegistry.delete(conversationId);
  }
}

function scrollToLatestAfterSend(conversationId: string) {
  // Defer to the next macrotask so React has time to flush the optimistic
  // message into the FlashList before we ask it to scroll.
  setTimeout(() => {
    scrollRegistry.get(conversationId)?.(true);
  }, 0);
}

export function buildChatScreenProps(params: {
  state: MobileAppState;
  chatActions: ChatActions;
  callActions: CallActions;
}) {
  const { state, chatActions, callActions } = params;
  if (!state.snapshot || !state.activeConversation) {
    return null;
  }

  const conversations = applyConversationDisplayFallbacks({
    conversations: state.conversations,
    contacts: state.snapshot.data.contacts ?? [],
    loginUser: state.snapshot.auth.user
  });
  const activeConversation =
    conversations.find(
      item =>
        item.client_conversation_id ===
        state.activeConversation?.client_conversation_id
    ) ?? state.activeConversation;

  const conversationKey = activeConversation.client_conversation_id;

  // 消息跳转 + 闪烁高亮的统一入口（搜索上一条/下一条、引用跳转、置顶跳转共用）。
  // 记录本次跳转 token：若用户已发起更新的跳转，过期请求的 applyHighlight
  // 必须被丢弃，避免乱序 resolve 把高亮覆盖回旧目标。
  const requestHighlightJump = (opts: {
    targetId: string;
    pivotSequence?: number;
    resolveHighlightId: () => string | null;
  }) => {
    const existingTimer = highlightTimerByConversation.get(conversationKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      highlightTimerByConversation.delete(conversationKey);
    }
    const convId = state.activeConversationId;
    state.bumpHighlightRequestNonce();
    // 立即熄灭上一个高亮：在目标异步加载期间，旧消息的闪烁动画会被立刻停止，
    // 不会因 nonce 变更而重播（"上一个多闪烁一次"的根因）。
    state.setHighlightedMessageId(null);
    const requestToken = bumpHighlightRequestToken(conversationKey);
    const applyHighlight = () => {
      if (
        highlightRequestTokenByConversation.get(conversationKey) !==
        requestToken
      ) {
        return;
      }
      const id = opts.resolveHighlightId();
      if (!id) {
        return;
      }
      state.setHighlightedMessageId(id);
      const clearHighlight = () => {
        state.setHighlightedMessageId(null);
        highlightTimerByConversation.delete(conversationKey);
      };
      highlightTimerByConversation.set(
        conversationKey,
        setTimeout(clearHighlight, 2000)
      );
    };
    if (!convId) {
      applyHighlight();
      return;
    }
    void mobileAppController
      .ensureMessageVisible(convId, opts.targetId, {
        pivotSequence:
          opts.pivotSequence && opts.pivotSequence > 0
            ? opts.pivotSequence
            : undefined,
        maxHistoryFetchRounds: 3
      })
      .finally(() => {
        applyHighlight();
      });
  };

  const activeMsgs = state.activeMessages ?? [];
  const oldestVisibleSeq =
    activeMsgs.length > 0
      ? Math.min(
          ...activeMsgs.map(m => Number(m.sequence || 0)).filter(s => s > 0)
        )
      : 0;
  const tailFrom = Number(activeConversation.tail_loaded_from_seq || 0);
  const hasMoreServerHistory =
    Number(activeConversation.history_complete || 0) === 0;
  const hasMoreLocalHistory = tailFrom > 0 && oldestVisibleSeq > tailFrom;

  return {
    activeConversation,
    activeMessages: state.activeMessages,
    onLoadOlderMessages: () => {
      void chatActions.loadOlderMessages();
    },
    isLoadingOlderMessages:
      state.loadingOlderConversationId ===
      activeConversation.client_conversation_id,
    hasMoreHistory: hasMoreServerHistory || hasMoreLocalHistory,
    peerPresence:
      activeConversation.type === 1 && activeConversation.peer_id
        ? (state.userPresenceByUserId[Number(activeConversation.peer_id)] ??
          null)
        : null,
    isPeerTyping:
      activeConversation.type === 1 &&
      state.typingConversationId === activeConversation.server_conversation_id,
    peerTypingActivity:
      activeConversation.type === 1 &&
      state.typingConversationId === activeConversation.server_conversation_id
        ? state.peerTypingActivity
        : null,
    groupTypingSubtitle: (() => {
      if (
        activeConversation.type === 1 ||
        !activeConversation.server_conversation_id
      ) {
        return null;
      }
      const typers =
        state.typersByConversationId[
          String(activeConversation.server_conversation_id)
        ];
      if (!typers) return null;
      const members = activeConversation.members ?? [];
      // 复用 shared 的 buildTypingPreview，保持与会话列表完全一致的截断/拼接/优先级规则。
      const preview = buildTypingPreview({
        typers,
        isGroup: true,
        resolveDisplayName: userId => {
          const member = members.find(
            m => Number(m.user_id) === Number(userId)
          );
          return member?.nickname ?? null;
        }
      });
      return preview?.text ?? null;
    })(),
    selectedMessageId: state.selectedMessageId,
    highlightedMessageId: state.highlightedMessageId,
    highlightRequestNonce: state.highlightRequestNonce,
    isSearchVisible: state.isSearchVisible,
    pending: state.pending,
    composerText: state.composerText,
    composerToolsVisible: state.composerToolsVisible,
    sendImageAsOriginal: state.sendImageAsOriginal,
    pendingImageAsset: state.pendingImageAsset,
    imagePreviewVisible: state.imagePreviewVisible,
    imagePreviewSendTopRight: state.imagePreviewSendTopRight,
    cameraOverlayVisible: state.cameraOverlayVisible,
    replyTarget: state.replyTarget,
    selectedMessage: state.selectedMessage,
    forwardingMessageId: state.forwardingMessageId,
    conversations,
    searchKeyword: state.searchKeyword,
    searchFilter: state.searchFilter,
    searchResults: state.searchResults,
    pinnedMessages: state.pinnedMessages,
    pinnedMessagesVisible: state.pinnedMessagesVisible,

    voicePlayingMessageId: state.voicePlayingMessageId,
    voicePlayingPositionMs: state.voicePlayingPositionMs,
    currentUserId: state.snapshot.auth.user?.userId,
    currentLoginUser: state.snapshot.auth.user,
    contacts: state.snapshot.data.contacts ?? [],
    // 是否对外可见自己的已读：当用户关闭"已读回执"开关时，UI 上的
    // ✓✓ 应双向失效。controller 已在 inbound 路径过滤群已读帧，server
    // 侧 SQL JOIN 也会把私聊 peer_last_read_sequence 强制归零，这里
    // 仅作为渲染层的兜底 / 重连前的 UI 一致性。
    isReceiptsEnabled: isReadReceiptsEnabled(state.privacySettings),
    groupReadState: (() => {
      // 群已读高水位：Record<readerUserId, last_read_seq>
      // 仅群会话有数据；私聊由 peer_last_read_sequence 单独承载。
      if (
        activeConversation.type !== 2 ||
        !activeConversation.server_conversation_id
      ) {
        return null;
      }
      return (
        state.snapshot?.data.groupReadStateByConversation?.[
          String(activeConversation.server_conversation_id)
        ] ?? null
      );
    })(),
    groupAnnouncement: state.groupSettings.announcement,
    groupAnnouncementUpdatedAt: state.groupSettings.announcement_updated_at,
    onOpenGroupAnnouncement: () => {
      navigateApp("GroupInfoAnnouncement");
    },
    onBack: chatActions.closeConversationDetail,
    onOpenPeerProfile: () => {
      if (activeConversation.type === 1) {
        const peerId = Number(activeConversation.peer_id || 0);
        if (peerId <= 0) {
          return;
        }
        const contactsList = state.snapshot?.data.contacts ?? [];
        const peerContact = contactsList.find(
          item => Number(item.user_id) === peerId
        );
        const peerUsername =
          peerContact?.username || activeConversation.peer_username || null;
        const peerNickname =
          peerContact?.nickname ||
          activeConversation.peer_nickname ||
          activeConversation.display_name ||
          activeConversation.name ||
          "";
        navigateApp("PeerProfile", {
          userId: peerId,
          fallbackNickname: peerNickname,
          fallbackUsername: peerUsername,
          fallbackAvatar:
            peerContact?.avatar_url ||
            activeConversation.display_avatar ||
            activeConversation.avatar_url ||
            null
        });
      }
    },
    onOpenMemberProfile: (
      memberId: number,
      memberName: string,
      memberAvatar: string | null
    ) => {
      navigateApp("PeerProfile", {
        userId: memberId,
        fallbackNickname: memberName,
        fallbackUsername: null,
        fallbackAvatar: memberAvatar
      });
    },
    onToggleSearch: () => {
      state.setIsSearchVisible(current => !current);
      // 进入搜索时收起置顶面板，避免面板盖在搜索 UI 上。
      state.setPinnedMessagesVisible(false);
    },
    onCancelSearch: () => {
      const convId = state.activeConversationId;
      state.setIsSearchVisible(false);
      state.setSearchKeyword("");
      state.setSearchResults([]);
      state.setHighlightedMessageId(null);
      state.setSelectedMessageId(null);
      if (convId) {
        void mobileAppController.shrinkVisibleWindow(convId);
      }
    },
    isSearchNavigating: state.isSearchNavigating,
    onSearchPrev: () => {
      const results = state.searchResults;
      if (results.length === 0 || state.isSearchNavigating) {
        return;
      }
      const currentId = state.highlightedMessageId;
      const idx = currentId
        ? results.findIndex(r => r.message.client_message_id === currentId)
        : -1;
      const nextIdx = idx <= 0 ? 0 : idx - 1;
      const target = results[nextIdx];
      if (!target) return;
      const convId = state.activeConversationId;
      const targetId = target.message.client_message_id;
      const pivotSequence = Number(target.message.sequence || 0);
      // 边界重按（target id 与当前 highlighted 相同）也要触发滚动定位 effect。
      state.bumpHighlightRequestNonce();
      // 立即熄灭上一个高亮：避免 nonce 变更触发旧气泡动画重播，
      // 同时让"边界重按同一结果"也能重新走 false→true 转换重播闪烁。
      state.setHighlightedMessageId(null);
      // 记录本次跳转 token，丢弃过期 ensureMessageVisible 的回调。
      const requestToken = bumpHighlightRequestToken(conversationKey);
      if (!convId) {
        state.setHighlightedMessageId(targetId);
        state.setSelectedMessageId(targetId);
        return;
      }
      state.setIsSearchNavigating(true);
      void mobileAppController
        .ensureMessageVisible(convId, targetId, {
          pivotSequence: pivotSequence > 0 ? pivotSequence : undefined
        })
        .then(() => {
          if (
            highlightRequestTokenByConversation.get(conversationKey) !==
            requestToken
          ) {
            return;
          }
          state.setHighlightedMessageId(targetId);
          state.setSelectedMessageId(targetId);
        })
        .catch(currentError => {
          state.setError(getReadableErrorMessage(currentError));
        })
        .finally(() => {
          state.setIsSearchNavigating(false);
        });
    },
    onSearchNext: () => {
      const results = state.searchResults;
      if (results.length === 0 || state.isSearchNavigating) {
        return;
      }
      const currentId = state.highlightedMessageId;
      const idx = currentId
        ? results.findIndex(r => r.message.client_message_id === currentId)
        : -1;
      const nextIdx =
        idx < 0 || idx >= results.length - 1 ? results.length - 1 : idx + 1;
      const target = results[nextIdx];
      if (!target) return;
      const convId = state.activeConversationId;
      const targetId = target.message.client_message_id;
      const pivotSequence = Number(target.message.sequence || 0);
      state.bumpHighlightRequestNonce();
      state.setHighlightedMessageId(null);
      const requestToken = bumpHighlightRequestToken(conversationKey);
      if (!convId) {
        state.setHighlightedMessageId(targetId);
        state.setSelectedMessageId(targetId);
        return;
      }
      state.setIsSearchNavigating(true);
      void mobileAppController
        .ensureMessageVisible(convId, targetId, {
          pivotSequence: pivotSequence > 0 ? pivotSequence : undefined
        })
        .then(() => {
          if (
            highlightRequestTokenByConversation.get(conversationKey) !==
            requestToken
          ) {
            return;
          }
          state.setHighlightedMessageId(targetId);
          state.setSelectedMessageId(targetId);
        })
        .catch(currentError => {
          state.setError(getReadableErrorMessage(currentError));
        })
        .finally(() => {
          state.setIsSearchNavigating(false);
        });
    },
    onStartAudioCall: () => {
      if (!activeConversation) {
        return;
      }
      // Group calls let the caller pick members instead of paging the whole
      // group (mirrors WhatsApp/WeChat). Direct chats call the peer directly.
      if (activeConversation.type === 2) {
        state.setCallMemberPickerMediaType(1);
        state.setCallMemberPickerConversationId(
          activeConversation.server_conversation_id
        );
        state.setCallMemberPickerVisible(true);
      } else {
        void callActions.handleStartCall(activeConversation, 1);
      }
    },
    onStartVideoCall: () => {
      if (!activeConversation) {
        return;
      }
      if (activeConversation.type === 2) {
        state.setCallMemberPickerMediaType(2);
        state.setCallMemberPickerConversationId(
          activeConversation.server_conversation_id
        );
        state.setCallMemberPickerVisible(true);
      } else {
        void callActions.handleStartCall(activeConversation, 2);
      }
    },
    onClearConversation: chatActions.handleClearConversation,
    onChangeSearchKeyword: state.setSearchKeyword,
    onChangeSearchFilter: state.setSearchFilter,
    onSelectSearchResult: (result: {
      message: { client_message_id: string };
    }) => {
      state.setHighlightedMessageId(result.message.client_message_id);
      state.setSelectedMessageId(result.message.client_message_id);
      state.setIsSearchVisible(false);
    },
    canRecallMessage: chatActions.canRecallMessage,
    onReply: (message: Message) => {
      state.setReplyTargetId(message.client_message_id);
      state.setSelectedMessageId(null);
    },
    onJumpToReply: (serverMessageId: string) => {
      const targetMessage = state.activeMessages.find(
        m => m.server_message_id === serverMessageId
      );
      const targetId =
        targetMessage?.client_message_id ?? `srv:${serverMessageId}`;
      const pivotSequence = targetMessage
        ? Number(targetMessage.sequence || 0)
        : undefined;
      requestHighlightJump({
        targetId,
        pivotSequence,
        resolveHighlightId: () => {
          const msg = state.activeMessages.find(
            m => m.server_message_id === serverMessageId
          );
          return msg?.client_message_id ?? null;
        }
      });
    },
    onJumpToPinnedMessage: (result: MobileMessageSearchResult) => {
      const message = result.message;
      requestHighlightJump({
        targetId: message.client_message_id,
        pivotSequence:
          Number(message.sequence || 0) > 0
            ? Number(message.sequence)
            : undefined,
        resolveHighlightId: () => message.client_message_id
      });
    },
    onOpenPinnedMessages: () => state.setPinnedMessagesVisible(true),
    onClosePinnedMessages: () => state.setPinnedMessagesVisible(false),
    onUnpinPinnedMessage: (message: Message) => {
      void chatActions.handleTogglePin(message);
    },
    onForward: (message: Message) => {
      state.setForwardingMessageId(message.client_message_id);
    },
    onToggleFavorite: (message: Message) => {
      void chatActions.handleToggleFavorite(message);
    },
    onTogglePin: (message: Message) => {
      void chatActions.handleTogglePin(message);
    },
    onRecall: (message: Message) => {
      void chatActions.handleRecall(message);
    },
    onToggleReaction: (message: Message, emoji: string | null) => {
      void chatActions.handleToggleReaction(message, emoji);
    },
    onCloseSelectedMessage: () => state.setSelectedMessageId(null),
    onCancelForward: () => state.setForwardingMessageId(null),
    onForwardToConversation: (
      conversationId: string,
      extraMessage?: string
    ) => {
      void chatActions.handleForwardToConversation(
        conversationId,
        extraMessage
      );
    },
    onCancelReply: () => state.setReplyTargetId(null),
    onCancelVoiceRecording: () => {
      void chatActions.cancelVoiceRecording();
    },
    onSelectMessage: chatActions.handleSelectMessage,
    onPreviewImage: (message: Message) => {
      chatActions.openImagePreview(message, state.activeMessages);
    },
    onPreviewVideo: chatActions.openVideoPreview,
    onOpenAttachment: (message: Message) => {
      void chatActions.openAttachmentInSystem(message);
    },
    onRetryAttachment: (message: Message) => {
      void chatActions.handleRetryAttachment(message);
    },
    onReselectAttachment: (message: Message) => {
      void chatActions.handleReselectAttachment(message);
    },
    onDeleteFailedMessage: (message: Message) => {
      void chatActions.handleDeleteFailedAttachment(message);
    },
    onSaveToAlbum: (message: Message) => {
      if (!isFileMessageContent(message.content)) return;
      let uri = message.content.url;
      if (!uri) return;
      // 服务端返回的 url 可能是相对路径（/attachments/2/...），
      // CameraRoll.save 无法处理相对路径，需要补全为完整 URL。
      if (uri.startsWith("/")) {
        uri = `${mobileApiBaseUrl}${uri}`;
      }
      void saveToAlbum(uri).then(result => {
        if (result.success) {
          state.setStatus(
            isImageFileMessageContent(message.content)
              ? i18n.t("app.savedImageToAlbum")
              : isVideoFileMessageContent(message.content)
                ? i18n.t("app.savedVideoToAlbum")
                : i18n.t("app.savedToAlbum")
          );
        } else {
          state.setStatus(result.error, "silent");
          state.setError(result.error);
        }
      });
    },
    onSaveToFile: (message: Message) => {
      if (!isFileMessageContent(message.content)) return;
      const content = message.content as MessageFileContent;
      const url = content.url;
      if (!url) return;

      if (!state.snapshot) return;
      const username = state.snapshot.auth.user?.username ?? "";

      void saveFileToDevice({
        url,
        fileName: content.name,
        username,
        apiBaseUrl: mobileApiBaseUrl,
        uploadId: content.upload_id ?? null,
        mimeType: content.mime_type ?? null,
        messageId: message.client_message_id,
        fileSize: content.size ?? null
      }).then(result => {
        if (result.success) {
          state.setStatus(i18n.t("app.savedToDownloads"));
        } else {
          state.setStatus(result.error, "silent");
          state.setError(result.error);
        }
      });
    },
    onCopyMessage: (message: Message) => {
      const text = getTextMessageText(message.content);
      if (!text) return;
      Clipboard.setString(text);
      state.setStatus(i18n.t("app.copied"));
    },
    onToggleVoicePlayback: (message: Message) => {
      void chatActions.handleToggleVoicePlayback(message);
    },
    onSendImage: () => {
      void chatActions.handleSendImageFromGallery();
    },
    onSendImageFromGallery: () => {
      void chatActions.handleSendImageFromGallery();
    },
    onSendImageFromCamera: () => {
      void chatActions.handleSendImageFromCamera();
    },
    onPickVideo: () => {
      state.setCameraOverlayVisible(true);
    },
    onConfirmSendImage: () => {
      void chatActions.handleConfirmSendImage(() => {
        scrollToLatestAfterSend(conversationKey);
      });
    },
    onCancelImagePreview: () => {
      chatActions.handleCancelImagePreview();
    },
    onSendFile: () => {
      void chatActions.handleSendAttachment("file", () => {
        scrollToLatestAfterSend(conversationKey);
      });
    },
    onToggleComposerTools: () =>
      state.setComposerToolsVisible(current => !current),
    onToggleSendImageAsOriginal: () =>
      state.setSendImageAsOriginal(current => !current),
    onStartVoiceRecording: () => {
      void chatActions.startVoiceRecording();
    },
    onStopVoiceRecording: (durationMs: number) => {
      void chatActions.stopVoiceRecordingAndSend(durationMs);
      scrollToLatestAfterSend(conversationKey);
    },
    onCloseCameraOverlay: () => {
      state.setCameraOverlayVisible(false);
    },
    onVideoRecordingError: (error: Error) => {
      state.setError(
        error instanceof Error ? error.message : String(error ?? "")
      );
      state.setStatus(i18n.t("app.videoCaptureFailed"));
    },
    onConfirmCameraCapture: async (videoPath: string, durationMs: number) => {
      const normalizedPath = videoPath.startsWith("file://")
        ? videoPath.slice("file://".length)
        : videoPath;
      const fileUri = `file://${normalizedPath}`;
      let size: number | undefined;
      try {
        const stat = await RNFS.stat(normalizedPath);
        size = Number(stat.size) || undefined;
      } catch (err) {
        log.scope("mobile").warn("[quickVideo] stat failed:", err);
      }
      const asset: PickedMediaAsset = {
        uri: fileUri,
        name: `quick-video-${Date.now()}.mp4`,
        type: "video/mp4",
        size,
        width: 720,
        height: 1280,
        durationMs
      };
      state.setImagePreviewSendTopRight(true);
      state.setPendingImageAsset(asset);
      state.setCameraOverlayVisible(false);
      // 先关闭相机 overlay，下一帧再弹出预览页，
      // 避免两个 Modal 在同一批次切换引发崩溃。
      requestAnimationFrame(() => {
        state.setImagePreviewVisible(true);
      });
    },
    onChangeComposerText: chatActions.handleComposerTextChange,
    onSendMessage: () => {
      void chatActions.handleSendMessage();
      scrollToLatestAfterSend(conversationKey);
    },
    registerScrollToLatest: (fn: ((animated: boolean) => void) | null) =>
      registerScrollToLatest(conversationKey, fn),
    formatMediaDuration,
    // Multi-select mode
    isMultiSelectMode: state.isMultiSelectMode,
    multiSelectedIds: state.multiSelectedIds,
    batchForwardMode: state.batchForwardMode,
    onEnterMultiSelectMode: (messageId: string) => {
      state.enterMultiSelectMode(messageId);
    },
    onExitMultiSelectMode: () => {
      state.exitMultiSelectMode();
    },
    onToggleMultiSelectMessage: (messageId: string) => {
      state.toggleMultiSelectMessage(messageId);
    },
    onStartBatchForward: (mode: "one-by-one" | "merged") => {
      state.setBatchForwardMode(mode);
    },
    onBatchForwardToConversation: (
      conversationId: string,
      extraMessage?: string
    ) => {
      void chatActions.handleBatchForwardToConversation(
        conversationId,
        state.batchForwardMode!,
        state.activeMessages.filter(
          m => state.multiSelectedIds.has(m.client_message_id) && !m.is_recalled
        ),
        extraMessage
      );
    },
    onCancelBatchForward: () => {
      state.setBatchForwardMode(null);
    }
  };
}
