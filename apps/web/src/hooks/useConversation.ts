import { useState, useMemo } from "react";
import { i18n } from "../i18n";
import { message, Modal } from "antd";
import {
  blockUser,
  unblockUser,
  createConversation,
  createDirectConversation,
  searchUser
} from "../http/api";
import type { Conversation, ConversationMember } from "../types/chat";
import type { LoginUser } from "../types/user";
import { getConversationContentPreview } from "../utils/conv";
import {
  fetchRemoteConversations,
  fetchRemoteMessages
} from "../sync/syncContext";
import { getReadableErrorMessage } from "../utils/errorMessage";
import { syncRelationshipChanges } from "../utils/relationshipSync";
import { mapUserSearchResults } from "../utils/userSearch";

function getConversationSortTime(conversation: Conversation) {
  const value = new Date(conversation.last_message_time).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function useConversation(
  conversations: Conversation[],
  onConversationSelect: (c: Conversation) => void,
  loginUser: LoginUser | null
) {
  const [searchText, setSearchText] = useState("");
  const [isCreateConversationVisible, setIsCreateConversationVisible] =
    useState(false);
  const [isContactsPanelVisible, setIsContactsPanelVisible] = useState(false);

  const handleCreateConversation = async (values: {
    groupName: string;
    members: ConversationMember[];
  }) => {
    const membersWithSelf = [
      ...values.members,
      {
        user_id: loginUser!.userId,
        nickname: loginUser!.nickname,
        avatar: loginUser!.avatar,
        role: 2
      }
    ];

    const uniqueMembers = Array.from(
      new Map(membersWithSelf.map(m => [m.user_id, m])).values()
    );

    const { data } = await createConversation({
      conv: {
        type: 2,
        name: values.groupName,
        avatar_url: undefined,
        owner_id: loginUser!.userId,
        description: undefined,
        last_message_time: new Date().toISOString()
      },
      members: uniqueMembers
    });

    const lastConversationsSync =
      (await window.electronAPI.getLastSyncTime("conversations")) ?? undefined;
    const conversationSyncResult = await fetchRemoteConversations(
      lastConversationsSync
    );
    await window.electronAPI.updateLastSyncTime(
      "conversations",
      conversationSyncResult.syncCursor
    );
    await fetchRemoteMessages(conversationSyncResult.updatedConversations);

    const localConversations = await window.electronAPI.getConversations(true);
    const createdConversation = localConversations.find(
      conversation =>
        String(conversation.server_conversation_id) === String(data.id)
    );

    if (!createdConversation) {
      throw new Error("Created conversation sync failed");
    }

    setIsCreateConversationVisible(false);
    onConversationSelect(createdConversation);
  };

  const handleSearchUser = async (keyword: string) => {
    const { data } = await searchUser({ keyword });
    if (!data || data.length === 0) return [];
    return mapUserSearchResults(data);
  };

  const handleCloseCreateConversation = () => {
    setIsCreateConversationVisible(false);
  };

  const handleOpenChat = async (userId: number) => {
    const existingConversation = conversations.find(
      c => c.type === 1 && c.peer_id === userId
    );
    if (existingConversation) {
      onConversationSelect(existingConversation);
      return;
    }

    try {
      const { data } = await createDirectConversation({
        target_user_id: userId
      });
      const lastConversationsSync =
        (await window.electronAPI.getLastSyncTime("conversations")) ??
        undefined;
      const conversationSyncResult = await fetchRemoteConversations(
        lastConversationsSync
      );
      await window.electronAPI.updateLastSyncTime(
        "conversations",
        conversationSyncResult.syncCursor
      );
      await fetchRemoteMessages(conversationSyncResult.updatedConversations);
      const localConversations =
        await window.electronAPI.getConversations(true);
      const directConversation = localConversations.find(
        item => String(item.server_conversation_id) === String(data.id)
      );
      if (directConversation) {
        onConversationSelect(directConversation);
        return;
      }

      throw new Error("Direct conversation sync failed");
    } catch (error) {
      const readableMessage = getReadableErrorMessage(
        error,
        i18n.t("startConversation.openChatFailed")
      );
      message.error(readableMessage);
      throw new Error(readableMessage);
    }
  };

  const filteredConversations = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => {
      const pinnedDiff = Number(b.is_pinned || 0) - Number(a.is_pinned || 0);
      if (pinnedDiff !== 0) {
        return pinnedDiff;
      }

      const draftDiff =
        Number(Boolean(b.draft?.trim())) - Number(Boolean(a.draft?.trim()));
      if (draftDiff !== 0) {
        return draftDiff;
      }

      return getConversationSortTime(b) - getConversationSortTime(a);
    });

    if (!keyword) {
      return sorted;
    }

    return sorted.filter(conversation => {
      const haystacks = [
        conversation.display_name,
        conversation.name,
        conversation.draft,
        getConversationContentPreview(conversation, loginUser)
      ];

      return haystacks.some(value =>
        String(value || "")
          .toLowerCase()
          .includes(keyword)
      );
    });
  }, [conversations, loginUser, searchText]);

  const handleBlockUser = async (targetUserId: number) => {
    Modal.confirm({
      title: i18n.t("peerProfile.blockConfirmTitle"),
      content: i18n.t("peerProfile.blockConfirmBody"),
      okText: i18n.t("peerProfile.blockConfirmOk"),
      cancelText: i18n.t("common.cancel"),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await blockUser(targetUserId);
          await syncRelationshipChanges();
          message.success(i18n.t("peerProfile.blocked"));
        } catch (error) {
          message.error(
            getReadableErrorMessage(error, i18n.t("peerProfile.blockFailed"))
          );
        }
      }
    });
  };

  const handleUnblockUser = async (targetUserId: number) => {
    try {
      await unblockUser(targetUserId);
      await syncRelationshipChanges();
      message.success(i18n.t("peerProfile.unblocked"));
    } catch (error) {
      message.error(
        getReadableErrorMessage(error, i18n.t("peerProfile.unblockFailed"))
      );
    }
  };

  return {
    searchText,
    setSearchText,
    isCreateConversationVisible,
    setIsCreateConversationVisible,
    isContactsPanelVisible,
    setIsContactsPanelVisible,
    handleCreateConversation,
    handleSearchUser,
    handleCloseCreateConversation,
    handleOpenChat,
    filteredConversations,
    handleBlockUser,
    handleUnblockUser
  };
}
