import { Layout, message } from "antd";
import { UserOutlined } from "@ant-design/icons";
import {
  type UpdateUserProfileRequest,
  type UserSessionSummary
} from "@mushroom/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AttachmentCenterModal } from "../components/attachments/AttachmentCenterModal";
import {
  ConversationList,
  type SidebarTab
} from "../components/conversations/ConversationList";
import { ChatWindow } from "../components/chat/ChatWindow";
import { PeerDetailPanel } from "../components/contacts/PeerDetailPanel";
import { AvatarLightboxProvider } from "../components/avatars/AvatarLightboxProvider";
import { AppHeader } from "../components/app-shell/AppHeader";
import { CallSessionModal } from "../components/chat/CallSessionModal";
import { CallMemberPickerModal } from "../components/chat/CallMemberPickerModal";
import { WorkspaceSearchModal } from "../components/search/WorkspaceSearchModal";
import { SystemSettingsModal } from "../components/settings/SystemSettingsModal";
import { useChat } from "../hooks/useChat";
import { useResizable } from "../hooks/useResizable";
import { session, updateProfile as updateProfileRequest } from "../http/api";
import type { SearchMessageResult } from "../types/chat";
import type { ContactListItem, LoginUser } from "../types/user";
import { normalizeAvatarUrl } from "../utils/display";
import { getReadableErrorMessage } from "../utils/errorMessage";
import { useGlobalSearch } from "./workspace/useGlobalSearch";
import { useAttachmentCenter } from "./workspace/useAttachmentCenter";
import { useDirectConversationOpener } from "./workspace/useDirectConversationOpener";
import { useContactRelationshipActions } from "./workspace/useContactRelationshipActions";
import { buildChatWindowProps } from "./workspace/chatWindowProps";

const { Content } = Layout;

interface HomePageProps {
  loginUser: LoginUser | null;
  onLogout: () => void;
}

export function HomePage({ loginUser, onLogout }: HomePageProps) {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<LoginUser | null>(loginUser);
  const [systemStatusOpen, setSystemStatusOpen] = useState(false);
  const [sessionSummary, setSessionSummary] =
    useState<UserSessionSummary | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const { resizableRef: sidebarRef, onResizeMouseDown } = useResizable({
    minWidth: 280,
    maxWidth: 600
  });
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const [selectedContact, setSelectedContact] =
    useState<ContactListItem | null>(null);
  const [peerProfilePreview, setPeerProfilePreview] = useState<{
    userId: number;
    fallbackName?: string | null;
    fallbackAvatar?: string | null;
  } | null>(null);
  const {
    conversations,
    activeConversation,
    userPresenceByUserId,
    typingByConversationId,
    groupReadStateByConversation,
    messages,
    handleConversationSelect,
    handleJumpToMessage,
    handleLoadConversationMedia,
    handleSearchMessages,
    handleSendFileMessage,
    handleSendMessage,
    handleStartAudioCall,
    handleStartVideoCall,
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
    handleDeleteConversation,
    handleClearConversation,
    handleDisbandGroupConversation,
    handleUpdateConversationState,
    handleConversationDraftChange,
    handleRetryConnection,
    handleAcceptCall,
    handleRejectCall,
    handleEndCall,
    handleToggleLocalMedia,
    dismissCallSession,
    loadMoreMessages,
    isLoadingMore,
    hasMore,
    wsUiState,
    callSession,
    localCallStream,
    remoteCallStream,
    groupParticipantMedia,
    groupLocalSpeaking,
    syncConversationState,
    callMemberPickerOpen,
    callMemberPickerMediaType,
    callMemberPickerConversation,
    closeCallMemberPicker,
    handlePickerStartCall
  } = useChat(currentUser);

  useEffect(() => {
    setCurrentUser(loginUser);
  }, [loginUser]);

  // 当切换会话或切换侧栏时，主动关闭聊天区的 peer 预览面板。
  // 当前预览采用「替换式」布局（覆盖在 ChatWindow 位置），若不主动重置，
  // 切换后会继续显示陈旧 peer 数据。
  useEffect(() => {
    setPeerProfilePreview(null);
  }, [activeConversation?.client_conversation_id, sidebarTab]);

  const conversationLabelMap = useMemo(() => {
    return new Map(
      conversations.map(conversation => [
        conversation.client_conversation_id,
        conversation.display_name || conversation.name || "Conversation"
      ])
    );
  }, [conversations]);

  const attachConversationLabels = useCallback(
    (items: SearchMessageResult[]) =>
      items.map(item => ({
        ...item,
        conversation_label:
          item.conversation_label ||
          conversationLabelMap.get(item.client_conversation_id) ||
          "Conversation"
      })),
    [conversationLabelMap]
  );

  const refreshSession = useCallback(async () => {
    try {
      const presenceResult = await session();
      setSessionSummary(presenceResult.data);
    } catch (error) {
      message.error(
        getReadableErrorMessage(error, "Failed to refresh session info")
      );
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const openSystemStatus = useCallback(() => {
    setSystemStatusOpen(true);
    void refreshSession();
  }, [refreshSession]);

  const handleSaveProfile = useCallback(
    async (patch: UpdateUserProfileRequest) => {
      setSavingProfile(true);
      try {
        const result = await updateProfileRequest(patch);
        setCurrentUser(prev =>
          prev
            ? {
                ...prev,
                nickname: result.data.nickname,
                avatar: normalizeAvatarUrl(result.data.avatar_url),
                email: result.data.email || "",
                phone: result.data.phone || "",
                gender: result.data.gender,
                birthday: result.data.birthday || "",
                signature: result.data.signature || ""
              }
            : prev
        );
        message.success(t("common.saved"));
        await refreshSession();
      } catch (error) {
        message.error(
          getReadableErrorMessage(error, "Failed to update profile")
        );
      } finally {
        setSavingProfile(false);
      }
    },
    [refreshSession, t]
  );

  const globalSearch = useGlobalSearch({
    handleSearchMessages,
    attachConversationLabels
  });

  const attachmentCenter = useAttachmentCenter({
    attachConversationLabels
  });

  const { openDirectConversation } = useDirectConversationOpener({
    conversations,
    handleConversationSelect
  });

  const { blockContact, unblockContact } = useContactRelationshipActions({
    selectedContact,
    setSelectedContact
  });

  // 两个结果列表都需要：跳转到消息后顺手关闭对应 modal。
  // 放在顶层避免跨 hook 耦合（search 与 attachment 共享同一闭包）。
  const openMessageFromResult = useCallback(
    async (item: SearchMessageResult) => {
      await handleJumpToMessage({
        clientMessageId: item.client_message_id,
        serverMessageId: item.server_message_id || undefined,
        clientConversationId: item.client_conversation_id
      });
      globalSearch.setOpen(false);
      attachmentCenter.setOpen(false);
    },
    [attachmentCenter, globalSearch, handleJumpToMessage]
  );

  const handleSendMessageToContact = useCallback(
    async (userId: number) => {
      const conversation = await openDirectConversation(userId);
      if (conversation) {
        setSidebarTab("chat");
        setSelectedContact(null);
      }
      return conversation;
    },
    [openDirectConversation]
  );

  if (!currentUser) {
    return null;
  }

  const chatWindowProps = buildChatWindowProps({
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
    onOpenPeerProfile: (userId, name, avatar) =>
      setPeerProfilePreview({
        userId,
        fallbackName: name ?? null,
        fallbackAvatar: avatar ?? null
      })
  });

  return (
    <AvatarLightboxProvider>
      <Layout className="im-shell">
        <Layout hasSider className="im-main-layout">
          <aside ref={sidebarRef} className="im-sidebar">
            <div
              className="im-sidebar-resize-handle"
              onMouseDown={onResizeMouseDown}
            />
            <div className="im-sidebar-panel">
              <ConversationList
                conversations={conversations || []}
                activeConversation={activeConversation || null}
                onConversationSelect={handleConversationSelect}
                onDeleteConversation={handleDeleteConversation}
                onUpdateConversationState={handleUpdateConversationState}
                loginUser={currentUser}
                activeTab={sidebarTab}
                onTabChange={setSidebarTab}
                selectedContactId={selectedContact?.user_id ?? null}
                onSelectContact={setSelectedContact}
                onBlockUser={blockContact}
                onUnblockUser={unblockContact}
                userPresenceByUserId={userPresenceByUserId}
                groupReadStateByConversation={groupReadStateByConversation}
                typingByConversationId={typingByConversationId}
                sidebarRailHeader={
                  <AppHeader
                    loginUser={currentUser}
                    variant="actions"
                    onOpenSystemStatus={openSystemStatus}
                  />
                }
                sidebarRailFooter={
                  <AppHeader
                    loginUser={currentUser}
                    variant="logo"
                    onOpenSystemStatus={openSystemStatus}
                  />
                }
              />
            </div>
          </aside>

          <Content className="im-content-panel">
            {sidebarTab === "contacts" ? (
              selectedContact ? (
                <PeerDetailPanel
                  userId={selectedContact.user_id}
                  contact={selectedContact}
                  isContact={true}
                  isBlocked={selectedContact.is_blocked}
                  onSendMessage={handleSendMessageToContact}
                  onStartAudioCall={handleStartAudioCall}
                  onStartVideoCall={handleStartVideoCall}
                  onContactRemoved={() => setSelectedContact(null)}
                />
              ) : (
                <div className="im-contact-detail-panel">
                  <div className="im-contact-detail-empty">
                    <UserOutlined className="im-contact-detail-empty-icon" />
                    <span>{t("contacts.noSelection")}</span>
                  </div>
                </div>
              )
            ) : peerProfilePreview ? (
              <PeerDetailPanel
                userId={peerProfilePreview.userId}
                fallbackName={peerProfilePreview.fallbackName}
                fallbackAvatar={peerProfilePreview.fallbackAvatar}
                showBackButton
                onClose={() => setPeerProfilePreview(null)}
                onSendMessage={async userId => {
                  const conversation = await openDirectConversation(userId);
                  if (conversation) {
                    setPeerProfilePreview(null);
                  }
                  return conversation;
                }}
                onStartAudioCall={handleStartAudioCall}
                onStartVideoCall={handleStartVideoCall}
                onContactRemoved={() => setPeerProfilePreview(null)}
                onContactAdded={() => {
                  /* keep panel open after add */
                }}
              />
            ) : (
              <ChatWindow {...chatWindowProps} />
            )}
          </Content>
        </Layout>

        <CallSessionModal
          callSession={callSession}
          currentUserId={currentUser?.userId}
          localStream={localCallStream}
          remoteStream={remoteCallStream}
          groupParticipantMedia={groupParticipantMedia}
          groupLocalSpeaking={groupLocalSpeaking}
          onAccept={() => {
            void handleAcceptCall();
          }}
          onReject={() => {
            void handleRejectCall();
          }}
          onEnd={() => {
            void handleEndCall();
          }}
          onClose={dismissCallSession}
          onToggleLocalMedia={kind => {
            void handleToggleLocalMedia(kind);
          }}
        />

        <SystemSettingsModal
          open={systemStatusOpen}
          onCancel={() => setSystemStatusOpen(false)}
          loginUser={currentUser}
          sessionSummary={sessionSummary}
          savingProfile={savingProfile}
          onRefreshSession={refreshSession}
          onSubmitProfile={handleSaveProfile}
          onForceLogout={onLogout}
        />

        <CallMemberPickerModal
          visible={callMemberPickerOpen}
          mediaType={callMemberPickerMediaType}
          conversation={callMemberPickerConversation ?? null}
          loginUser={currentUser}
          onClose={closeCallMemberPicker}
          onStartCall={handlePickerStartCall}
        />

        <WorkspaceSearchModal
          open={globalSearch.open}
          keyword={globalSearch.keyword}
          searching={globalSearch.loading}
          results={globalSearch.results}
          onCancel={() => globalSearch.setOpen(false)}
          onKeywordChange={globalSearch.setKeyword}
          onSearch={() => void globalSearch.runSearch()}
          onOpenMessage={item => {
            void openMessageFromResult(item);
          }}
        />

        <AttachmentCenterModal
          open={attachmentCenter.open}
          loading={attachmentCenter.loading}
          activeTab={attachmentCenter.tab}
          items={attachmentCenter.items}
          onCancel={() => attachmentCenter.setOpen(false)}
          onTabChange={attachmentCenter.handleTabChange}
          onOpenImage={attachmentCenter.handleOpenImage}
          onOpenMessage={item => {
            void openMessageFromResult(item);
          }}
        />
      </Layout>
    </AvatarLightboxProvider>
  );
}
