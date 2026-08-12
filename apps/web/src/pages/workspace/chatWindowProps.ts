import type { ComponentProps } from "react";
import type { UserPresenceSummary } from "@mushroom/shared";
import type { ChatWindow } from "../../components/chat/ChatWindow";
import type { Conversation, Message } from "../../types/chat";
import type { LoginUser } from "../../types/user";
import type { TypingMap } from "../../utils/typing";
import { getGroupTypingSubtitle } from "../../utils/typing";
import { i18n } from "../../i18n";

type ChatWindowProps = ComponentProps<typeof ChatWindow>;

/**
 * Pure mapping context: state coming from useChat + the page-level handlers
 * required by ChatWindow. Nothing here owns React state; every value is
 * derived synchronously.
 */
export interface ChatWindowPropsContext {
  activeConversation: Conversation | null | undefined;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  userPresenceByUserId: Record<number, UserPresenceSummary>;
  typingByConversationId: TypingMap;
  groupReadStateByConversation: Record<string, Record<number, number>>;
  hasMore: Record<string, boolean>;
  isLoadingMore: boolean;
  wsUiState: ChatWindowProps["wsUiState"];
  currentUser: LoginUser;

  // Handlers from useChat (passthrough)
  handleJumpToMessage: ChatWindowProps["onJumpToMessage"];
  handleLoadConversationMedia: ChatWindowProps["onLoadConversationMedia"];
  handleSearchMessages: ChatWindowProps["onSearchMessages"];
  handleSendFileMessage: ChatWindowProps["onSendFileMessage"];
  handleSendMessage: ChatWindowProps["onSendMessage"];
  handleStartAudioCall: ChatWindowProps["onStartAudioCall"];
  handleStartVideoCall: ChatWindowProps["onStartVideoCall"];
  handleClearConversation: ChatWindowProps["onClearConversation"];
  handleRecallMessage: ChatWindowProps["onRecallMessage"];
  handleRetryMessage: ChatWindowProps["onRetryMessage"];
  handleReselectAttachment: ChatWindowProps["onReselectAttachment"];
  handleDeleteFailedMessage: ChatWindowProps["onDeleteFailedMessage"];
  handleBatchForwardOneByOne: ChatWindowProps["onBatchForwardOneByOne"];
  handleBatchForwardMerged: ChatWindowProps["onBatchForwardMerged"];
  handleSendTextToConversation: ChatWindowProps["onSendTextToConversation"];
  handleAddGroupMembers: ChatWindowProps["onAddGroupMembers"];
  handleRemoveGroupMember: ChatWindowProps["onRemoveGroupMember"];
  handleUpdateGroupMemberRole: ChatWindowProps["onUpdateGroupMemberRole"];
  handleLeaveGroupConversation: ChatWindowProps["onLeaveGroupConversation"];
  handleTransferGroupOwner: ChatWindowProps["onTransferGroupOwner"];
  handleUpdateGroupProfile: ChatWindowProps["onUpdateGroupProfile"];
  handleUpdateGroupAnnouncement: ChatWindowProps["onUpdateGroupAnnouncement"];
  handleUpdateGroupSettings: ChatWindowProps["onUpdateGroupSettings"];
  handleUpdateGroupMemberMute: ChatWindowProps["onUpdateGroupMemberMute"];
  handleDisbandGroupConversation: ChatWindowProps["onDisbandGroupConversation"];
  handleConversationDraftChange: ChatWindowProps["onDraftChange"];
  handleRetryConnection: ChatWindowProps["onRetryConnection"];
  loadMoreMessages: ChatWindowProps["loadMoreMessages"];

  // Page-level wiring
  handleConversationSelect: (conversation: Conversation) => void;
  syncConversationState: (serverConversationId?: string) => unknown;
  onOpenPeerProfile: NonNullable<ChatWindowProps["onOpenPeerProfile"]>;
}

function getPeerPresence(
  activeConversation: Conversation | null | undefined,
  presenceByUserId: Record<number, UserPresenceSummary>
): UserPresenceSummary | null {
  if (activeConversation?.type === 1 && activeConversation.peer_id) {
    return presenceByUserId[Number(activeConversation.peer_id)] ?? null;
  }
  return null;
}

function getIsPeerTyping(
  activeConversation: Conversation | null | undefined,
  typingByConversationId: TypingMap
): boolean {
  return (
    activeConversation?.type === 1 &&
    !!activeConversation.server_conversation_id &&
    !!typingByConversationId[String(activeConversation.server_conversation_id)]
  );
}

function getPeerTypingActivity(
  activeConversation: Conversation | null | undefined,
  typingByConversationId: TypingMap
): "text" | "voice" | null {
  if (
    activeConversation?.type !== 1 ||
    !activeConversation.server_conversation_id
  ) {
    return null;
  }
  const typers =
    typingByConversationId[String(activeConversation.server_conversation_id)];
  if (!typers) return null;
  const first = Object.values(typers)[0];
  return first?.activity ?? null;
}

function getGroupTypingSubtitleProp(
  activeConversation: Conversation | null | undefined,
  typingByConversationId: TypingMap
): string | null {
  if (
    !activeConversation ||
    activeConversation.type === 1 ||
    !activeConversation.server_conversation_id
  ) {
    return null;
  }
  const typers =
    typingByConversationId[String(activeConversation.server_conversation_id)];
  if (!typers || Object.keys(typers).length === 0) {
    return null;
  }
  const members = activeConversation.members ?? [];
  return getGroupTypingSubtitle(
    typers,
    userId => {
      const member = members.find(m => Number(m.user_id) === Number(userId));
      return member?.nickname ?? null;
    },
    i18n.t
  );
}

function getGroupReadStateProp(
  activeConversation: Conversation | null | undefined,
  groupReadStateByConversation: Record<string, Record<number, number>>
): Record<number, number> | null {
  if (
    activeConversation?.type !== 1 &&
    activeConversation?.server_conversation_id
  ) {
    return (
      groupReadStateByConversation[
        String(activeConversation.server_conversation_id)
      ] ?? null
    );
  }
  return null;
}

function getHasMore(
  activeConversation: Conversation | null | undefined,
  hasMore: Record<string, boolean>
): boolean {
  if (!activeConversation) return true;
  return hasMore[activeConversation.client_conversation_id] ?? true;
}

/**
 * Build the ChatWindow props bag. Pure mapping over the provided context;
 * preserves the exact prop shape and derivation rules from the original
 * inline JSX in Home.tsx.
 */
export function buildChatWindowProps(
  ctx: ChatWindowPropsContext
): ChatWindowProps {
  const {
    activeConversation,
    conversations,
    messages,
    userPresenceByUserId,
    typingByConversationId,
    groupReadStateByConversation,
    hasMore,
    isLoadingMore,
    wsUiState,
    currentUser,
    handleJumpToMessage,
    handleLoadConversationMedia,
    handleSearchMessages,
    handleSendFileMessage,
    handleSendMessage,
    handleStartAudioCall,
    handleStartVideoCall,
    handleClearConversation,
    handleRecallMessage,
    handleRetryMessage,
    handleReselectAttachment,
    handleDeleteFailedMessage,
    handleBatchForwardOneByOne,
    handleBatchForwardMerged,
    handleSendTextToConversation,
    handleAddGroupMembers,
    handleRemoveGroupMember,
    handleUpdateGroupMemberRole,
    handleLeaveGroupConversation,
    handleTransferGroupOwner,
    handleUpdateGroupProfile,
    handleUpdateGroupAnnouncement,
    handleUpdateGroupSettings,
    handleUpdateGroupMemberMute,
    handleDisbandGroupConversation,
    handleConversationDraftChange,
    handleRetryConnection,
    loadMoreMessages,
    handleConversationSelect,
    syncConversationState,
    onOpenPeerProfile
  } = ctx;

  return {
    activeConversation: activeConversation || null,
    messages: messages[activeConversation?.client_conversation_id || ""] || [],
    onJumpToMessage: handleJumpToMessage,
    onLoadConversationMedia: handleLoadConversationMedia,
    onSearchMessages: handleSearchMessages,
    onSendFileMessage: handleSendFileMessage,
    onSendMessage: handleSendMessage,
    onStartAudioCall: handleStartAudioCall,
    onStartVideoCall: handleStartVideoCall,
    onClearConversation: handleClearConversation,
    onRecallMessage: handleRecallMessage,
    onRetryMessage: handleRetryMessage,
    onReselectAttachment: handleReselectAttachment,
    onDeleteFailedMessage: handleDeleteFailedMessage,
    onBatchForwardOneByOne: handleBatchForwardOneByOne,
    onBatchForwardMerged: handleBatchForwardMerged,
    onSendTextToConversation: handleSendTextToConversation,
    onNavigateToConversation: conversationId => {
      const target = conversations.find(
        c => c.client_conversation_id === conversationId
      );
      if (target) {
        handleConversationSelect(target);
      }
    },
    conversations,
    onAddGroupMembers: handleAddGroupMembers,
    onRemoveGroupMember: handleRemoveGroupMember,
    onUpdateGroupMemberRole: handleUpdateGroupMemberRole,
    onLeaveGroupConversation: handleLeaveGroupConversation,
    onTransferGroupOwner: handleTransferGroupOwner,
    onUpdateGroupProfile: handleUpdateGroupProfile,
    onUpdateGroupAnnouncement: handleUpdateGroupAnnouncement,
    onUpdateGroupSettings: handleUpdateGroupSettings,
    onUpdateGroupMemberMute: handleUpdateGroupMemberMute,
    onDisbandGroupConversation: handleDisbandGroupConversation,
    onAfterGroupSave: () =>
      syncConversationState(
        activeConversation?.server_conversation_id
      ) as void | Promise<void>,
    onDraftChange: handleConversationDraftChange,
    onRetryConnection: handleRetryConnection,
    onOpenPeerProfile,
    loadMoreMessages,
    loginUser: currentUser,
    isLoadingMore,
    wsUiState,
    hasMore: getHasMore(activeConversation, hasMore),
    peerPresence: getPeerPresence(activeConversation, userPresenceByUserId),
    isPeerTyping: getIsPeerTyping(activeConversation, typingByConversationId),
    peerTypingActivity: getPeerTypingActivity(
      activeConversation,
      typingByConversationId
    ),
    groupTypingSubtitle: getGroupTypingSubtitleProp(
      activeConversation,
      typingByConversationId
    ),
    groupReadState: getGroupReadStateProp(
      activeConversation,
      groupReadStateByConversation
    )
  };
}
