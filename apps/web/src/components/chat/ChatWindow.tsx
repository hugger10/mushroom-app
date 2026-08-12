import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useTranslation } from "react-i18next";
import { App as AntdApp, Button, Space } from "antd";
import {
  isMentioningUser,
  parseGroupConversationSettings,
  parseMutedUntilMs,
  collectAttachmentUploadIds,
  type MessageMention,
  type UserPresenceSummary
} from "@mushroom/shared";
import type {
  Conversation,
  Message,
  SearchMessageResult
} from "../../types/chat";
import type { ContactListItem, LoginUser } from "../../types/user";
import type { WsUiState } from "../../ws/WSClient";
import { formatLastActiveTime } from "@mushroom/shared";
import { getTypingSubtitle } from "../../utils/typing";
import GroupManageModal from "../groups/GroupManageModal";
import { UserAvatar } from "../avatars/UserAvatar";
import { ConversationAvatar } from "../avatars/ConversationAvatar";
import { ChatHeader } from "./ChatHeader";
import { Composer } from "./Composer";
import { ConnectionBanner } from "./ConnectionBanner";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { VideoPlayerModal } from "./VideoPlayerModal";
import { MessageList } from "./MessageList";
import { InlineSearchBar } from "./InlineSearchBar";
import { ForwardMessageModal } from "./ForwardMessageModal";
import { MergedForwardDetailModal } from "./MergedForwardDetailModal";
import { GroupReadReceiptsModal } from "./GroupReadReceiptsModal";
import {
  getConversationUserDisplayName,
  getMessageSenderDisplayName
} from "../../utils/display";
import { useChatComposerState } from "./hooks/useChatComposerState";
import { useChatWindowActions } from "./hooks/useChatWindowActions";
import { useImagePreview } from "./hooks/useImagePreview";
import { useMessageSearch } from "./hooks/useMessageSearch";
import { useMessageViewport } from "./hooks/useMessageViewport";
import { useMessageSelection } from "../../hooks/chat/useMessageSelection";
import { useLocalContacts } from "../../hooks/useLocalContacts";
import { refreshAttachmentUrlsAndPersist } from "../../http/refreshAttachmentUrls";
import {
  conversationPreRefreshedAt,
  PRE_REFRESH_TTL_MS
} from "./refreshAttachmentPreflight";

export interface ChatWindowProps {
  activeConversation: Conversation | null;
  messages: Message[];
  onSendMessage: (
    text: string,
    replyTo?: Message | null,
    mentions?: MessageMention[],
    mentionAll?: boolean
  ) => void;
  onSendFileMessage: (
    file: File,
    onProgress?: (percent: number) => void,
    options?: {
      kind?: "voice_message";
      durationSeconds?: number;
      waveform?: number[];
    }
  ) => Promise<void>;
  onLoadConversationMedia: (kind?: "images" | "files") => Promise<Message[]>;
  onSearchMessages: (
    keyword: string,
    scope?: "current" | "all"
  ) => Promise<SearchMessageResult[]>;
  onJumpToMessage: (target: {
    clientMessageId?: string;
    serverMessageId?: string;
    clientConversationId?: string;
  }) => Promise<string | null>;
  onRecallMessage: (message: Message) => void;
  onRetryMessage: (message: Message) => void;
  /** 失败附件气泡的"重新选择文件"。 */
  onReselectAttachment?: (message: Message, file: File) => void;
  /** 删除一条失败的本地附件草稿（无二次确认；context menu 触发）。 */
  onDeleteFailedMessage?: (message: Message) => void;
  onAddGroupMembers: (contacts: ContactListItem[]) => Promise<void>;
  onRemoveGroupMember: (userId: number) => Promise<void>;
  onUpdateGroupMemberRole: (userId: number, role: number) => Promise<void>;
  onLeaveGroupConversation: () => Promise<void>;
  onTransferGroupOwner: (userId: number) => Promise<void>;
  onUpdateGroupProfile: (
    name: string,
    description?: string,
    avatarUrl?: string
  ) => Promise<void>;
  onUpdateGroupAnnouncement: (announcement?: string) => Promise<void>;
  onUpdateGroupSettings: (patch: {
    mute_all?: boolean;
    invite_permission?: "all_members" | "admins_only";
    profile_edit_permission?: "admins" | "owner_only";
  }) => Promise<void>;
  onUpdateGroupMemberMute: (
    userId: number,
    muteMinutes?: number | null
  ) => Promise<void>;
  onDisbandGroupConversation: () => Promise<void>;
  /**
   * Optional one-shot fallback sync after a successful save in the
   * GroupManageModal. See GroupManageModal.onAfterSave for rationale.
   */
  onAfterGroupSave?: () => void | Promise<void>;
  onDraftChange: (conversation: Conversation, draft: string) => Promise<void>;
  onRetryConnection: () => Promise<void>;
  onOpenPeerProfile?: (
    userId: number,
    fallbackName?: string | null,
    fallbackAvatar?: string | null
  ) => void;
  onStartAudioCall: (conversation: Conversation) => Promise<void>;
  onStartVideoCall: (conversation: Conversation) => Promise<void>;
  onClearConversation: (conversation: Conversation) => Promise<void>;
  onBatchForwardOneByOne?: (
    messages: Message[],
    targetConversationId: string
  ) => Promise<void>;
  onBatchForwardMerged?: (
    messages: Message[],
    targetConversationId: string
  ) => Promise<void>;
  onSendTextToConversation?: (
    targetConversationId: string,
    text: string
  ) => Promise<void>;
  onNavigateToConversation?: (conversationId: string) => void;
  conversations?: Conversation[];
  loginUser: LoginUser;
  loadMoreMessages: (clientConversationId: string) => Promise<void>;
  isLoadingMore: boolean;
  wsUiState: WsUiState;
  hasMore?: boolean;
  peerPresence?: UserPresenceSummary | null;
  isPeerTyping?: boolean;
  peerTypingActivity?: "text" | "voice" | null;
  /**
   * Group-typing subtitle prepared by upstream (composes member names). When
   * provided and non-empty, takes precedence over the 1:1 typing subtitle.
   */
  groupTypingSubtitle?: string | null;
  /**
   * 群已读高水位（仅当前会话）：reader user_id → last_read_seq。
   * 由本地缓存回灌，并通过 main 进程 IPC 推送同步。
   */
  groupReadState?: Record<number, number> | null;
}

export function ChatWindow({
  activeConversation,
  messages,
  onSendMessage,
  onSendFileMessage,
  onSearchMessages,
  onJumpToMessage,
  onRecallMessage,
  onRetryMessage,
  onReselectAttachment,
  onDeleteFailedMessage,
  onAddGroupMembers,
  onRemoveGroupMember,
  onUpdateGroupMemberRole,
  onLeaveGroupConversation,
  onTransferGroupOwner,
  onUpdateGroupProfile,
  onUpdateGroupAnnouncement,
  onUpdateGroupSettings,
  onUpdateGroupMemberMute,
  onDisbandGroupConversation,
  onAfterGroupSave,
  onDraftChange,
  onRetryConnection,
  onOpenPeerProfile,
  onStartAudioCall,
  onStartVideoCall,
  onClearConversation,
  onBatchForwardOneByOne,
  onBatchForwardMerged,
  onSendTextToConversation,
  onNavigateToConversation,
  conversations: allConversations = [],
  loginUser,
  loadMoreMessages,
  isLoadingMore,
  wsUiState,
  hasMore = true,
  peerPresence = null,
  isPeerTyping = false,
  peerTypingActivity = null,
  groupTypingSubtitle = null,
  groupReadState = null
}: ChatWindowProps) {
  const { t } = useTranslation();
  const { message: messageApi } = AntdApp.useApp();
  const activeConversationId = activeConversation?.client_conversation_id;
  const contacts = useLocalContacts();
  const contactsMap = useMemo(
    () => new Map(contacts.map(item => [Number(item.user_id), item])),
    [contacts]
  );
  const [isGroupManageVisible, setIsGroupManageVisible] = useState(false);
  const [videoPlayerArgs, setVideoPlayerArgs] = useState<{
    url: string;
    uploadId?: string;
  } | null>(null);
  const [mergedForwardDetailMessage, setMergedForwardDetailMessage] =
    useState<Message | null>(null);
  const [singleForwardMessage, setSingleForwardMessage] =
    useState<Message | null>(null);
  // 群已读详情面板（仅自己发的群消息可触发）。
  const [groupReadReceiptsMessage, setGroupReadReceiptsMessage] =
    useState<Message | null>(null);
  const [forwardingToConversationId, setForwardingToConversationId] = useState<
    string | null
  >(null);

  const {
    isSelectionMode,
    selectedMessageIds,
    batchForwardMode,
    enterSelectionMode,
    exitSelectionMode,
    toggleMessageSelection,
    startBatchForward,
    cancelBatchForward,
    getSelectedMessages
  } = useMessageSelection();

  // Reset selection mode when switching conversations
  useEffect(() => {
    exitSelectionMode();
  }, [activeConversationId, exitSelectionMode]);

  // A 方案：会话切换/消息加载后，批量预刷新首屏可见消息的附件 presigned URL。
  // refreshAttachmentUrlsAndPersist 内部会做 80ms 微批合并 + ≤100/批分片，
  // 同时把新 URL 写入进程内 cache 以及（Electron 下）持久化到 SQLite。
  // 通过模块级 TTL 缓存避免同一会话短时间内被反复触发（如来回切换会话）。
  useEffect(() => {
    if (!activeConversationId || messages.length === 0) return;
    const lastAt = conversationPreRefreshedAt.get(activeConversationId) ?? 0;
    if (Date.now() - lastAt < PRE_REFRESH_TTL_MS) return;
    const VISIBLE_TAIL = 50;
    const tail =
      messages.length > VISIBLE_TAIL ? messages.slice(-VISIBLE_TAIL) : messages;
    const ids = collectAttachmentUploadIds(tail);
    if (ids.length === 0) {
      conversationPreRefreshedAt.set(activeConversationId, Date.now());
      return;
    }
    conversationPreRefreshedAt.set(activeConversationId, Date.now());
    void refreshAttachmentUrlsAndPersist(ids).catch(() => {
      // 预刷新失败由 <img>/<video> onError 自愈兜底；失败后清掉时间戳允许下次重试。
      conversationPreRefreshedAt.delete(activeConversationId);
    });
  }, [activeConversationId, messages]);

  // ESC to exit selection mode
  useEffect(() => {
    if (!isSelectionMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitSelectionMode();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isSelectionMode, exitSelectionMode]);

  const {
    previewImage,
    previewImageItems,
    previewImageIndex,
    previewZoom,
    previewOffset,
    canPreviewPrev,
    canPreviewNext,
    setPreviewZoom,
    openImagePreview,
    closePreview,
    showPrevPreview,
    showNextPreview,
    handlePreviewWheel,
    handlePreviewPointerDown,
    handlePreviewPointerMove,
    handlePreviewPointerUp
  } = useImagePreview();

  const {
    highlightMessageId,
    showScrollToBottom,
    messagesEndRef,
    messagesContainerRef,
    topSentinelRef,
    instantScrollToBottom,
    scrollToBottom,
    setPendingFocusMessageId
  } = useMessageViewport({
    activeConversationId,
    isLoadingMore,
    hasMore,
    messageCount: messages.length,
    loadMoreMessages
  });

  const [dismissedMentionReminderKey, setDismissedMentionReminderKey] =
    useState<string | null>(null);

  const {
    isSearchVisible,
    searchKeyword,
    isSearching,
    filteredSearchResults,
    selectedSearchIndex,
    setIsSearchVisible,
    setSearchKeyword,
    setSearchFilter,
    setSearchResults,
    jumpToSelectedSearchResult
  } = useMessageSearch({
    onSearchMessages,
    onJumpFromSearchResult: async (message: SearchMessageResult) => {
      await jumpToMessageAndHighlight({
        clientMessageId: message.client_message_id,
        serverMessageId: message.server_message_id || undefined,
        clientConversationId: message.client_conversation_id
      });
    }
  });

  const {
    inputValue,
    replyingTo,
    selectedMentions,
    mentionAll,
    fileInputRef,
    setReplyingTo,
    handleInputChange,
    clearAfterSend
  } = useChatComposerState({
    activeConversation,
    activeConversationId,
    onDraftChange,
    onScrollToBottom: scrollToBottom
  });
  const currentGroupMember =
    activeConversation?.type === 2
      ? activeConversation.members?.find(
          member => member.user_id === loginUser.userId
        )
      : undefined;
  const canMentionAll = (currentGroupMember?.role ?? 0) >= 1;

  const composerMode: "normal" | "muted-all" | "muted-self" = useMemo(() => {
    if (activeConversation?.type !== 2) return "normal";
    const role = currentGroupMember?.role ?? 0;
    if (role >= 1) return "normal";
    const muteUntilMs = parseMutedUntilMs(currentGroupMember?.muted_until);
    if (muteUntilMs > Date.now()) {
      return "muted-self";
    }
    const settings = parseGroupConversationSettings(
      activeConversation.settings
    );
    if (settings.mute_all) {
      return "muted-all";
    }
    return "normal";
  }, [
    activeConversation?.type,
    activeConversation?.settings,
    currentGroupMember?.role,
    currentGroupMember?.muted_until
  ]);

  const getUserDisplayName = (userId: number, fallbackNickname?: string) =>
    getConversationUserDisplayName(
      activeConversation,
      loginUser,
      userId,
      fallbackNickname,
      contactsMap
    );

  const { jumpToMessageAndHighlight, handleSend, openSearch } =
    useChatWindowActions({
      inputValue,
      replyingTo,
      selectedMentions,
      mentionAll,
      onSendMessage,
      onJumpToMessage,
      clearAfterSend,
      setPendingFocusMessageId,
      setIsSearchVisible,
      setSearchResults,
      setSearchKeyword,
      setSearchFilter
    });

  const renderContactTrigger = useCallback(
    (
      userId: number,
      nickname?: string,
      avatarUrl?: string | null,
      children?: ReactNode
    ) => {
      if (
        !userId ||
        userId === loginUser.userId ||
        !children ||
        !activeConversation ||
        !onOpenPeerProfile
      ) {
        return children;
      }

      return (
        <span
          role="button"
          tabIndex={0}
          className="im-peer-profile-trigger"
          onClick={event => {
            event.stopPropagation();
            onOpenPeerProfile(userId, nickname ?? null, avatarUrl ?? null);
          }}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenPeerProfile(userId, nickname ?? null, avatarUrl ?? null);
            }
          }}
        >
          {children}
        </span>
      );
    },
    [activeConversation, loginUser.userId, onOpenPeerProfile]
  );

  const unreadMentionMessage =
    activeConversation?.type === 2
      ? (messages.find(
          message =>
            message.sender_id !== loginUser.userId &&
            Number(message.sequence || 0) >
              Number(activeConversation.last_read_sequence || 0) &&
            isMentioningUser(message.content, loginUser.userId)
        ) ?? null)
      : null;

  const mentionReminderKey =
    activeConversationId && unreadMentionMessage
      ? `${activeConversationId}:${unreadMentionMessage.client_message_id}`
      : null;

  useEffect(() => {
    if (!mentionReminderKey) {
      setDismissedMentionReminderKey(null);
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const syncReminderVisibility = () => {
      const target = container.querySelector<HTMLElement>(
        `[data-message-id="${unreadMentionMessage?.client_message_id}"]`
      );
      if (!target) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const isVisible =
        targetRect.bottom >= containerRect.top + 16 &&
        targetRect.top <= containerRect.bottom - 16;

      if (isVisible) {
        setDismissedMentionReminderKey(current =>
          current === mentionReminderKey ? current : mentionReminderKey
        );
      }
    };

    syncReminderVisibility();
    container.addEventListener("scroll", syncReminderVisibility);
    window.addEventListener("resize", syncReminderVisibility);

    return () => {
      container.removeEventListener("scroll", syncReminderVisibility);
      window.removeEventListener("resize", syncReminderVisibility);
    };
  }, [
    mentionReminderKey,
    messagesContainerRef,
    unreadMentionMessage?.client_message_id
  ]);

  const showMentionReminder =
    !!mentionReminderKey &&
    activeConversation?.type === 2 &&
    Number(activeConversation.mention_unread_count || 0) > 0 &&
    dismissedMentionReminderKey !== mentionReminderKey;

  const handleScrollToBottom = useCallback(() => {
    instantScrollToBottom();
    scrollToBottom();
  }, [instantScrollToBottom, scrollToBottom]);

  const handleMentionReminderClick = useCallback(() => {
    if (!unreadMentionMessage) {
      return;
    }
    setDismissedMentionReminderKey(mentionReminderKey);
    setPendingFocusMessageId(unreadMentionMessage.client_message_id);
  }, [mentionReminderKey, setPendingFocusMessageId, unreadMentionMessage]);

  const handleJumpToReply = useCallback(
    (serverMessageId: string) => {
      void jumpToMessageAndHighlight({ serverMessageId });
    },
    [jumpToMessageAndHighlight]
  );

  const handleRenderMessageAvatar = useCallback(
    (message: Message, defaultAvatar: ReactNode) => {
      if (!activeConversation) return defaultAvatar;
      return renderContactTrigger(
        message.sender_id,
        getMessageSenderDisplayName(
          activeConversation,
          loginUser,
          message,
          contactsMap
        ),
        message.sender_avatar ?? null,
        defaultAvatar
      );
    },
    [activeConversation, loginUser, renderContactTrigger, contactsMap]
  );
  const headerSubtitle =
    activeConversation?.type === 1
      ? isPeerTyping
        ? getTypingSubtitle(peerTypingActivity, t)
        : peerPresence?.is_online
          ? t("chatDetail.online")
          : formatLastActiveTime(peerPresence?.last_active_at)
      : groupTypingSubtitle && groupTypingSubtitle.length > 0
        ? groupTypingSubtitle
        : null;

  const selectedCount = selectedMessageIds.size;

  const handleBatchForwardToConversation = useCallback(
    async (targetConversationId: string, extraMsg?: string) => {
      if (!batchForwardMode) return;
      const selected = getSelectedMessages(messages);
      if (selected.length === 0) return;
      setForwardingToConversationId(targetConversationId);
      try {
        if (batchForwardMode === "one-by-one") {
          await onBatchForwardOneByOne?.(selected, targetConversationId);
        } else {
          await onBatchForwardMerged?.(selected, targetConversationId);
        }
        if (extraMsg) {
          await onSendTextToConversation?.(targetConversationId, extraMsg);
        }
        messageApi.success(
          batchForwardMode === "merged"
            ? t("chatMessage.forwardMergedSuccess")
            : t("chatMessage.forwardOneByOneSuccess", {
                count: selected.length
              })
        );
        exitSelectionMode();
        onNavigateToConversation?.(targetConversationId);
      } catch {
        messageApi.error(t("chatMessage.forwardFailed"));
      } finally {
        setForwardingToConversationId(null);
      }
    },
    [
      batchForwardMode,
      getSelectedMessages,
      messages,
      onBatchForwardOneByOne,
      onBatchForwardMerged,
      onSendTextToConversation,
      onNavigateToConversation,
      messageApi,
      exitSelectionMode,
      t
    ]
  );

  const handleSingleForwardToConversation = useCallback(
    async (targetConversationId: string, extraMsg?: string) => {
      if (!singleForwardMessage) return;
      setForwardingToConversationId(targetConversationId);
      try {
        await onBatchForwardOneByOne?.(
          [singleForwardMessage],
          targetConversationId
        );
        if (extraMsg) {
          await onSendTextToConversation?.(targetConversationId, extraMsg);
        }
        messageApi.success(t("chatMessage.forwarded"));
        setSingleForwardMessage(null);
        onNavigateToConversation?.(targetConversationId);
      } catch {
        messageApi.error(t("chatMessage.forwardFailed"));
      } finally {
        setForwardingToConversationId(null);
      }
    },
    [
      singleForwardMessage,
      t,
      onBatchForwardOneByOne,
      onSendTextToConversation,
      onNavigateToConversation,
      messageApi
    ]
  );

  if (!activeConversation) {
    return (
      <div className="im-chat-empty">
        <div className="im-chat-empty-card">
          <div className="im-chat-empty-title">{t("chat.emptyTitle")}</div>
          <div className="im-chat-empty-copy">{t("chat.emptyCopy")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="im-chat-window">
      <ChatHeader
        activeConversation={activeConversation}
        isStatusOnline={Boolean(peerPresence?.is_online)}
        showStatusDot={activeConversation.type === 1 && !isPeerTyping}
        subtitle={headerSubtitle}
        peerProfileTrigger={
          activeConversation.type === 1 && activeConversation.peer_id ? (
            renderContactTrigger(
              activeConversation.peer_id,
              activeConversation.display_name || activeConversation.name,
              activeConversation.display_avatar ||
                activeConversation.avatar_url ||
                null,
              <UserAvatar
                className="im-chat-peer-avatar-trigger"
                size={42}
                src={
                  activeConversation.display_avatar ||
                  activeConversation.avatar_url ||
                  null
                }
                name={
                  activeConversation.display_name || activeConversation.name
                }
                style={{ borderRadius: "50%" }}
              />
            )
          ) : activeConversation.type === 2 ? (
            <div
              className="im-chat-peer-avatar-trigger"
              style={{ cursor: "pointer" }}
              onClick={() => setIsGroupManageVisible(true)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === "Enter") setIsGroupManageVisible(true);
              }}
            >
              <ConversationAvatar conversation={activeConversation} size={42} />
            </div>
          ) : null
        }
        onOpenSearch={openSearch}
        wsUiState={wsUiState}
        onStartAudioCall={() => {
          void onStartAudioCall(activeConversation);
        }}
        onStartVideoCall={() => {
          void onStartVideoCall(activeConversation);
        }}
        onClearMessages={() => {
          void onClearConversation(activeConversation);
        }}
      />

      <InlineSearchBar
        visible={isSearchVisible}
        keyword={searchKeyword}
        currentIndex={selectedSearchIndex}
        totalCount={filteredSearchResults.length}
        isSearching={isSearching}
        onKeywordChange={setSearchKeyword}
        onPrev={() => void jumpToSelectedSearchResult(-1)}
        onNext={() => void jumpToSelectedSearchResult(1)}
        onClose={() => setIsSearchVisible(false)}
      />

      <ConnectionBanner
        wsUiState={wsUiState}
        onRetryConnection={onRetryConnection}
      />

      <MessageList
        activeConversation={activeConversation}
        messages={messages}
        loginUser={loginUser}
        contacts={contactsMap}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        highlightMessageId={highlightMessageId}
        searchKeyword={isSearchVisible ? searchKeyword : ""}
        messagesContainerRef={messagesContainerRef}
        topSentinelRef={topSentinelRef}
        messagesEndRef={messagesEndRef}
        showScrollToBottom={showScrollToBottom}
        onScrollToBottom={handleScrollToBottom}
        showMentionReminder={showMentionReminder}
        onMentionReminderClick={handleMentionReminderClick}
        onReply={setReplyingTo}
        onRecallMessage={onRecallMessage}
        onRetryMessage={onRetryMessage}
        onReselectAttachment={onReselectAttachment}
        onJumpToReply={handleJumpToReply}
        onOpenImagePreview={openImagePreview}
        onOpenVideoPlayer={setVideoPlayerArgs}
        renderMessageAvatar={handleRenderMessageAvatar}
        isSelectionMode={isSelectionMode}
        selectedMessageIds={selectedMessageIds}
        onToggleMessageSelection={toggleMessageSelection}
        onEnterSelectionMode={enterSelectionMode}
        onOpenMergedForward={setMergedForwardDetailMessage}
        onForwardMessage={setSingleForwardMessage}
        groupReadState={groupReadState}
        onViewGroupReadReceipts={setGroupReadReceiptsMessage}
        onDeleteFailedMessage={onDeleteFailedMessage}
      />

      {isSelectionMode ? (
        <div className="im-selection-toolbar">
          <span className="im-selection-toolbar-count">
            {t("chatMessage.selectedCount", { count: selectedCount })}
          </span>
          <Space>
            <Button
              type="primary"
              disabled={selectedCount === 0}
              onClick={() => startBatchForward("one-by-one")}
            >
              {t("chatMessage.forwardOneByOne")}
            </Button>
            <Button
              type="primary"
              disabled={selectedCount === 0}
              onClick={() => startBatchForward("merged")}
            >
              {t("chatMessage.forwardMerged")}
            </Button>
            <Button onClick={exitSelectionMode}>{t("common.cancel")}</Button>
          </Space>
        </div>
      ) : null}

      {!isSelectionMode ? (
        <Composer
          activeConversation={activeConversation}
          inputValue={inputValue}
          replyingTo={replyingTo}
          selectedMentions={selectedMentions}
          mentionAll={mentionAll}
          currentUserId={loginUser.userId}
          wsUiState={wsUiState}
          fileInputRef={fileInputRef}
          onInputChange={handleInputChange}
          onSend={handleSend}
          onReplyCancel={() => setReplyingTo(null)}
          canMentionAll={canMentionAll}
          composerMode={composerMode}
          onSendFileMessage={onSendFileMessage}
          onAfterFileSent={clearAfterSend}
          getUserDisplayName={getUserDisplayName}
        />
      ) : null}

      {activeConversation.type === 2 ? (
        <GroupManageModal
          visible={isGroupManageVisible}
          conversation={activeConversation}
          loginUser={loginUser}
          onClose={() => setIsGroupManageVisible(false)}
          onAddMembers={onAddGroupMembers}
          onRemoveMember={onRemoveGroupMember}
          onUpdateMemberRole={onUpdateGroupMemberRole}
          onLeaveConversation={onLeaveGroupConversation}
          onTransferOwner={onTransferGroupOwner}
          onUpdateProfile={onUpdateGroupProfile}
          onUpdateAnnouncement={onUpdateGroupAnnouncement}
          onUpdateSettings={onUpdateGroupSettings}
          onUpdateMemberMute={onUpdateGroupMemberMute}
          onDisbandGroupConversation={onDisbandGroupConversation}
          onAfterSave={onAfterGroupSave}
        />
      ) : null}

      <ImagePreviewModal
        previewImage={previewImage}
        previewImageIndex={previewImageIndex}
        previewImageItems={previewImageItems}
        previewZoom={previewZoom}
        previewOffset={previewOffset}
        canPreviewPrev={canPreviewPrev}
        canPreviewNext={canPreviewNext}
        onCancel={closePreview}
        onZoomChange={setPreviewZoom}
        onPrev={showPrevPreview}
        onNext={showNextPreview}
        onWheel={handlePreviewWheel}
        onPointerDown={handlePreviewPointerDown}
        onPointerMove={handlePreviewPointerMove}
        onPointerUp={handlePreviewPointerUp}
      />

      <VideoPlayerModal
        url={videoPlayerArgs?.url ?? null}
        uploadId={videoPlayerArgs?.uploadId ?? null}
        onClose={() => setVideoPlayerArgs(null)}
      />

      <ForwardMessageModal
        open={batchForwardMode != null || singleForwardMessage != null}
        batchMode={batchForwardMode}
        batchCount={selectedCount}
        message={singleForwardMessage}
        selectedMessages={
          singleForwardMessage
            ? [singleForwardMessage]
            : getSelectedMessages(messages)
        }
        conversations={allConversations.filter(
          c => c.client_conversation_id !== activeConversationId
        )}
        forwardingToConversationId={forwardingToConversationId}
        onCancel={() => {
          if (singleForwardMessage) {
            setSingleForwardMessage(null);
          } else {
            cancelBatchForward();
          }
        }}
        onForward={
          singleForwardMessage
            ? handleSingleForwardToConversation
            : handleBatchForwardToConversation
        }
      />

      <MergedForwardDetailModal
        open={mergedForwardDetailMessage != null}
        message={mergedForwardDetailMessage}
        conversation={activeConversation}
        loginUser={loginUser}
        contacts={contactsMap}
        onCancel={() => setMergedForwardDetailMessage(null)}
      />

      <GroupReadReceiptsModal
        open={groupReadReceiptsMessage != null}
        message={groupReadReceiptsMessage}
        conversation={activeConversation}
        groupReadState={groupReadState}
        loginUser={loginUser}
        contacts={contactsMap}
        onClose={() => setGroupReadReceiptsMessage(null)}
      />
    </div>
  );
}
