import {
  List,
  Typography,
  Input,
  Dropdown,
  Button,
  Modal,
  type MenuProps
} from "antd";
import {
  UserOutlined,
  SearchOutlined,
  TeamOutlined,
  PlusOutlined,
  UserAddOutlined,
  PushpinOutlined,
  PushpinFilled,
  BellOutlined,
  MutedOutlined,
  InboxOutlined,
  DeleteOutlined,
  MessageOutlined
} from "@ant-design/icons";
import { useConversation } from "../../hooks/useConversation";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import type { Conversation } from "../../types/chat";
import ContactsPanel from "../contacts/ContactsPanel";
import StartDirectConversationDialog from "./StartDirectConversationDialog";
import AddConversation from "./AddConversation";
import type { ContactListItem, LoginUser } from "../../types/user";
import { useContacts } from "../../hooks/useContacts";
import { useIsReceiptsEnabled } from "../../hooks/useMyPrivacySettings";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useTranslation } from "react-i18next";
import { formatChatTimeUnified } from "../../utils/date";
import { ConversationAvatar } from "../avatars/ConversationAvatar";
import { getConversationContentPreview } from "../../utils/conv";
import type { UserPresenceSummary } from "@mushroom/shared";
import { buildTypingPreview, isGroupMessageRead } from "@mushroom/shared";
import type { TypingMap } from "../../utils/typing";

const { Text } = Typography;

export type SidebarTab = "chat" | "contacts";

interface ConversationListProps {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  onConversationSelect: (conversation: Conversation) => void;
  onDeleteConversation: (conversation: Conversation) => Promise<void>;
  onUpdateConversationState: (
    conversation: Conversation,
    patch: {
      is_pinned?: number;
      is_muted?: number;
      is_archived?: number;
      draft?: string | null;
    }
  ) => Promise<void>;
  loginUser: LoginUser | null;
  sidebarRailHeader?: ReactNode;
  sidebarRailFooter?: ReactNode;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  selectedContactId?: number | null;
  onSelectContact: (contact: ContactListItem) => void;
  onBlockUser: (targetUserId: number) => Promise<void>;
  onUnblockUser: (targetUserId: number) => Promise<void>;
  /**
   * Map of user_id -> presence summary, used to render online-status
   * indicators on direct-conversation avatars. Optional; falls back to
   * an empty record.
   */
  userPresenceByUserId?: Record<number, UserPresenceSummary>;
  /**
   * 群已读高水位（key 为 server_conversation_id）。仅活跃过的群有数据；
   * 未出现的群在列表行默认按"已送达"渲染；冷启动由本地缓存回灌。
   */
  groupReadStateByConversation?: Record<string, Record<number, number>>;
  /**
   * 当前所有会话的输入中状态（key 为 server_conversation_id）。用于在会话列表
   * 第二行显示 "正在输入…" / "Alice 正在输入…"，与 WhatsApp / Telegram 一致。
   */
  typingByConversationId?: TypingMap;
}

export function ConversationList({
  conversations = [],
  activeConversation,
  onConversationSelect,
  onDeleteConversation,
  onUpdateConversationState,
  loginUser,
  sidebarRailHeader,
  sidebarRailFooter,
  activeTab,
  onTabChange,
  selectedContactId,
  onSelectContact,
  onBlockUser,
  onUnblockUser,
  userPresenceByUserId,
  groupReadStateByConversation,
  typingByConversationId
}: ConversationListProps) {
  const { t } = useTranslation();
  const [showArchived, setShowArchived] = useState(false);
  const receiptsEnabled = useIsReceiptsEnabled();
  const {
    searchText,
    setSearchText,
    isCreateConversationVisible,
    setIsCreateConversationVisible,
    handleCreateConversation,
    handleSearchUser,
    handleCloseCreateConversation,
    handleOpenChat,
    filteredConversations
  } = useConversation(conversations, onConversationSelect, loginUser);

  const {
    isStartChatVisible,
    setIsStartChatVisible,
    fetchLocalContacts,
    fetchBlockedUsers,
    syncContactPanels,
    contacts,
    blockedUsers
  } = useContacts();

  const refreshContactPanels = useCallback(() => {
    void Promise.all([fetchLocalContacts(), fetchBlockedUsers()]);
  }, [fetchBlockedUsers, fetchLocalContacts]);

  useEffect(() => {
    refreshContactPanels();

    const handleWindowFocus = () => {
      refreshContactPanels();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshContactPanels();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshContactPanels]);

  useEffect(() => {
    const handleContactSync = () => {
      refreshContactPanels();
    };

    window.addEventListener("im:contacts-sync", handleContactSync);
    return () => {
      window.removeEventListener("im:contacts-sync", handleContactSync);
    };
  }, [refreshContactPanels]);

  const menuItems: MenuProps["items"] = [
    {
      key: "group",
      label: t("conversationList.startGroup"),
      icon: <TeamOutlined />,
      onClick: () => setIsCreateConversationVisible(true)
    },
    {
      key: "contact",
      label: t("conversationList.startChat"),
      icon: <UserAddOutlined />,
      onClick: () => setIsStartChatVisible(true)
    }
  ];

  const activeConversations = useMemo(
    () => filteredConversations.filter(item => !item.is_archived),
    [filteredConversations]
  );
  const archivedConversations = useMemo(
    () => filteredConversations.filter(item => !!item.is_archived),
    [filteredConversations]
  );

  const renderConversationItem = (conversation: Conversation) => {
    const showMentionBadge = (conversation.mention_unread_count ?? 0) > 0;
    const showMutedUnreadDot =
      !!conversation.is_muted &&
      !showMentionBadge &&
      (conversation.unread_count ?? 0) > 0;
    const unreadBadgeCount =
      conversation.is_muted && !showMentionBadge
        ? 0
        : conversation.unread_count || 0;

    // 输入状态优先级高于草稿和最近消息（对齐 WhatsApp / Telegram）。
    // 服务端按会话成员全量分发 typing 事件，所以列表本身就能拿到数据。
    const typingTypers = conversation.server_conversation_id
      ? typingByConversationId?.[String(conversation.server_conversation_id)]
      : undefined;
    const typingPreview = typingTypers
      ? buildTypingPreview({
          typers: typingTypers,
          isGroup: conversation.type !== 1,
          resolveDisplayName: userId => {
            const member = conversation.members?.find(
              m => Number(m.user_id) === Number(userId)
            );
            return member?.nickname ?? null;
          }
        })
      : null;

    const conversationMenuItems: MenuProps["items"] = [
      {
        key: "pin",
        icon: conversation.is_pinned ? <PushpinFilled /> : <PushpinOutlined />,
        label: conversation.is_pinned
          ? t("conversationList.unpin")
          : t("conversationList.pin"),
        onClick: () =>
          void onUpdateConversationState(conversation, {
            is_pinned: conversation.is_pinned ? 0 : 1
          })
      },
      {
        key: "mute",
        icon: conversation.is_muted ? <BellOutlined /> : <MutedOutlined />,
        label: conversation.is_muted
          ? t("conversationList.unmute")
          : t("conversationList.mute"),
        onClick: () =>
          void onUpdateConversationState(conversation, {
            is_muted: conversation.is_muted ? 0 : 1
          })
      },
      {
        key: "archive",
        icon: <InboxOutlined />,
        label: conversation.is_archived
          ? t("conversationList.unarchive")
          : t("conversationList.archive"),
        onClick: () =>
          void onUpdateConversationState(conversation, {
            is_archived: conversation.is_archived ? 0 : 1
          })
      },
      {
        key: "delete",
        icon: <DeleteOutlined />,
        label: t("conversationList.deleteConversation"),
        danger: true,
        onClick: () =>
          Modal.confirm({
            title: t("conversationList.deleteTitle"),
            content: t("conversationList.deleteDescription"),
            okText: t("conversationList.deleteConfirm"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: () => onDeleteConversation(conversation)
          })
      }
    ];

    return (
      <Dropdown
        menu={{
          items: conversationMenuItems,
          onClick: ({ domEvent }) => {
            domEvent.preventDefault();
            domEvent.stopPropagation();
          }
        }}
        trigger={["contextMenu"]}
      >
        <List.Item
          className={`im-conversation-item ${
            activeConversation?.client_conversation_id ===
            conversation.client_conversation_id
              ? "im-conversation-item-active"
              : ""
          }`}
          style={{
            opacity: conversation.is_archived ? 0.85 : 1
          }}
        >
          <button
            type="button"
            className="im-conversation-card"
            onClick={() => onConversationSelect(conversation)}
          >
            <List.Item.Meta
              className="im-conversation-item-meta"
              avatar={
                <ConversationAvatar
                  className="im-conversation-item-avatar"
                  size={44}
                  conversation={conversation}
                  peerPresence={
                    conversation.type === 1 && conversation.peer_id
                      ? (userPresenceByUserId?.[Number(conversation.peer_id)] ??
                        null)
                      : null
                  }
                />
              }
              title={
                <div className="im-conversation-title-row">
                  <div className="im-conversation-title-main">
                    <Text className="im-conversation-name" strong ellipsis>
                      {conversation.display_name}
                    </Text>
                    <div className="im-state-pills">
                      {conversation.is_pinned ? (
                        <span
                          className="im-state-pill im-state-pill-pinned im-state-pill-icon"
                          title={t("conversationList.statePinned")}
                          aria-label={t("conversationList.statePinned")}
                        >
                          <PushpinFilled />
                        </span>
                      ) : null}
                      {conversation.is_muted ? (
                        <span
                          className="im-state-pill im-state-pill-muted im-state-pill-icon"
                          title={t("conversationList.stateMuted")}
                          aria-label={t("conversationList.stateMuted")}
                        >
                          <MutedOutlined />
                        </span>
                      ) : null}
                      {conversation.is_archived ? (
                        <span
                          className="im-state-pill im-state-pill-archived im-state-pill-icon"
                          title={t("conversationList.stateArchived")}
                          aria-label={t("conversationList.stateArchived")}
                        >
                          <InboxOutlined />
                        </span>
                      ) : null}
                      {conversation.draft?.trim() ? (
                        <span className="im-state-pill im-state-pill-draft">
                          {t("conversationList.stateDraft")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="im-conversation-right-col">
                    <Text
                      className={`im-conversation-time${unreadBadgeCount > 0 ? " im-conversation-time-unread" : ""}`}
                    >
                      {loginUser &&
                        Number(conversation.last_message_send_id || 0) ===
                          loginUser.userId &&
                        Number(conversation.last_sync_sequence || 0) > 0 &&
                        receiptsEnabled &&
                        (() => {
                          // 私聊：用 peer_last_read_sequence；
                          // 群聊：用 main 进程缓存的 groupReadStateByConversation。
                          // 自身已读回执隐私关闭时直接不渲染已读勾（兜底，
                          // server 端已在 conversation 列表 SQL 双向 gate）。
                          const lastSeq = Number(
                            conversation.last_sync_sequence || 0
                          );
                          const isRead =
                            conversation.type === 1
                              ? Number(
                                  conversation.peer_last_read_sequence || 0
                                ) >= lastSeq
                              : isGroupMessageRead(
                                  lastSeq,
                                  conversation.server_conversation_id
                                    ? (groupReadStateByConversation?.[
                                        String(
                                          conversation.server_conversation_id
                                        )
                                      ] ?? null)
                                    : null,
                                  loginUser.userId
                                );
                          return (
                            <span
                              className={
                                isRead
                                  ? "im-conversation-tick-read"
                                  : "im-conversation-tick-delivered"
                              }
                            />
                          );
                        })()}
                      {formatChatTimeUnified(conversation.last_message_time)}
                    </Text>
                  </div>
                </div>
              }
              description={
                <div className="im-conversation-preview-row">
                  {typingPreview ? (
                    <span className="im-conversation-typing" aria-live="polite">
                      <span
                        className="im-conversation-typing-dots"
                        aria-hidden="true"
                      >
                        <span />
                        <span />
                        <span />
                      </span>
                      <Text className="im-conversation-typing-text" ellipsis>
                        {typingPreview.text}
                      </Text>
                    </span>
                  ) : (
                    <Text className="im-conversation-preview" ellipsis>
                      {showMentionBadge ? (
                        <span className="im-conversation-mention-prefix">
                          [
                          <span className="im-conversation-mention-text">
                            {t("conversationList.mentionMe")}
                          </span>
                          ]{" "}
                        </span>
                      ) : null}
                      {getConversationContentPreview(
                        { ...conversation, mention_unread_count: 0 },
                        loginUser,
                        t("conversationList.selfSenderPrefix")
                      )}
                    </Text>
                  )}
                  {unreadBadgeCount > 0 ? (
                    <span className="im-conversation-unread-badge">
                      {unreadBadgeCount > 99 ? "99+" : unreadBadgeCount}
                    </span>
                  ) : showMutedUnreadDot ? (
                    <span className="im-conversation-muted-dot" />
                  ) : null}
                </div>
              }
            />
          </button>
        </List.Item>
      </Dropdown>
    );
  };

  return (
    <div className="im-conversation-list">
      <div className="im-conversation-layout">
        <aside className="im-conversation-side-rail">
          <div className="im-conversation-side-rail-top">
            {sidebarRailHeader}
            <Button
              className={`im-conversation-rail-button im-rail-tab-button${activeTab === "chat" ? " im-rail-tab-button-active" : ""}`}
              icon={<MessageOutlined />}
              onClick={() => onTabChange("chat")}
              title={t("contacts.chatTab")}
            />
            <Button
              className={`im-conversation-rail-button im-rail-tab-button${activeTab === "contacts" ? " im-rail-tab-button-active" : ""}`}
              icon={<UserOutlined />}
              onClick={() => onTabChange("contacts")}
              title={t("contacts.contactsTab")}
            />
          </div>

          <div className="im-conversation-side-rail-bottom">
            {sidebarRailFooter}
          </div>
        </aside>

        <div className="im-conversation-main">
          {activeTab === "chat" ? (
            <>
              <div className="im-conversation-topbar">
                <div className="im-conversation-search-row">
                  <Input
                    className="im-conversation-search"
                    placeholder={t("conversationList.searchPlaceholder")}
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    allowClear
                    maxLength={SEARCH_KEYWORD_MAX_LENGTH}
                  />
                  <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
                    <Button
                      className="im-conversation-action-button"
                      icon={<PlusOutlined />}
                    />
                  </Dropdown>
                </div>
              </div>

              <div className="im-conversation-scroll">
                <List
                  dataSource={activeConversations}
                  renderItem={renderConversationItem}
                />
                {archivedConversations.length > 0 ? (
                  <div style={{ padding: "8px 12px 16px" }}>
                    <Button
                      className="im-archived-toggle"
                      type="text"
                      block
                      onClick={() => setShowArchived(prev => !prev)}
                    >
                      {showArchived
                        ? t("conversationList.hideArchived", {
                            count: archivedConversations.length
                          })
                        : t("conversationList.showArchived", {
                            count: archivedConversations.length
                          })}
                    </Button>
                    {showArchived ? (
                      <List
                        dataSource={archivedConversations}
                        renderItem={renderConversationItem}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>

              {activeConversations.length === 0 &&
                archivedConversations.length === 0 && (
                  <div className="im-empty-pane">
                    <UserOutlined
                      style={{ fontSize: "24px", marginBottom: "8px" }}
                    />
                    <div>{t("conversationList.noMatchingContacts")}</div>
                  </div>
                )}
            </>
          ) : (
            <ContactsPanel
              contacts={contacts}
              blockedUsers={blockedUsers}
              selectedContactId={selectedContactId}
              onSelectContact={onSelectContact}
              onBlockUser={onBlockUser}
              onUnblockUser={onUnblockUser}
              onContactAdded={() => {
                void syncContactPanels().then(() => refreshContactPanels());
              }}
            />
          )}
        </div>
      </div>

      <AddConversation
        visible={isCreateConversationVisible}
        onCreateConversation={handleCreateConversation}
        onCancel={handleCloseCreateConversation}
      />
      <StartDirectConversationDialog
        visible={isStartChatVisible}
        onClose={() => setIsStartChatVisible(false)}
        onSearchUser={handleSearchUser}
        onOpenChat={handleOpenChat}
      />
    </div>
  );
}
