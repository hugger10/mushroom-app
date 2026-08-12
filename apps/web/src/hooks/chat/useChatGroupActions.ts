import {
  addConversationMembers,
  leaveConversation,
  removeConversationMember,
  transferConversationOwner,
  updateConversationAnnouncement,
  updateConversationMemberMute,
  updateConversationSettings,
  updateConversationProfile,
  updateConversationMemberRole
} from "../../http/api";
import type { Conversation } from "../../types/chat";
import type { ContactListItem } from "../../types/user";

type UseChatGroupActionsOptions = {
  activeConversation: Conversation | undefined;
  syncConversationState: (serverConversationId?: string) => Promise<void>;
};

export function useChatGroupActions({
  activeConversation,
  syncConversationState
}: UseChatGroupActionsOptions) {
  const handleAddGroupMembers = async (contacts: ContactListItem[]) => {
    if (!activeConversation) return;

    await addConversationMembers({
      conversationId: activeConversation.server_conversation_id,
      members: contacts.map(contact => ({
        user_id: contact.user_id,
        nickname: contact.nickname,
        role: 0
      }))
    });

    await syncConversationState(activeConversation.server_conversation_id);
  };

  const handleRemoveGroupMember = async (userId: number) => {
    if (!activeConversation) return;

    await removeConversationMember({
      conversationId: activeConversation.server_conversation_id,
      userId
    });

    await syncConversationState(activeConversation.server_conversation_id);
  };

  const handleUpdateGroupMemberRole = async (userId: number, role: number) => {
    if (!activeConversation) return;

    await updateConversationMemberRole({
      conversationId: activeConversation.server_conversation_id,
      userId,
      role
    });

    await syncConversationState(activeConversation.server_conversation_id);
  };

  const handleLeaveGroupConversation = async () => {
    if (!activeConversation) return;

    const leavingConversationId = activeConversation.server_conversation_id;
    await leaveConversation({
      conversationId: leavingConversationId
    });

    await syncConversationState(leavingConversationId);
  };

  const handleTransferGroupOwner = async (userId: number) => {
    if (!activeConversation) return;

    await transferConversationOwner({
      conversationId: activeConversation.server_conversation_id,
      userId
    });

    await syncConversationState(activeConversation.server_conversation_id);
  };

  const handleUpdateGroupProfile = async (
    name: string,
    description?: string,
    avatarUrl?: string
  ): Promise<void> => {
    if (!activeConversation) return;

    // No explicit syncConversationState() here: the server emits a
    // `conversation.sync` outbox event which useChatSync applies as a
    // delta. Triggering a full sync per request caused interface-flood
    // when multiple group settings were saved together.
    await updateConversationProfile({
      conversationId: activeConversation.server_conversation_id,
      name,
      description,
      avatar_url: avatarUrl
    });
  };

  const handleUpdateGroupAnnouncement = async (
    announcement?: string
  ): Promise<void> => {
    if (!activeConversation) return;

    await updateConversationAnnouncement({
      conversationId: activeConversation.server_conversation_id,
      announcement
    });
  };

  const handleUpdateGroupSettings = async (patch: {
    mute_all?: boolean;
    invite_permission?: "all_members" | "admins_only";
    profile_edit_permission?: "admins" | "owner_only";
  }): Promise<void> => {
    if (!activeConversation) return;

    await updateConversationSettings({
      conversationId: activeConversation.server_conversation_id,
      ...patch
    });
  };

  const handleUpdateGroupMemberMute = async (
    userId: number,
    muteMinutes?: number | null
  ) => {
    if (!activeConversation) return;

    await updateConversationMemberMute({
      conversationId: activeConversation.server_conversation_id,
      userId,
      mute_minutes: muteMinutes ?? null
    });

    await syncConversationState(activeConversation.server_conversation_id);
  };

  return {
    handleAddGroupMembers,
    handleRemoveGroupMember,
    handleUpdateGroupMemberRole,
    handleLeaveGroupConversation,
    handleTransferGroupOwner,
    handleUpdateGroupProfile,
    handleUpdateGroupAnnouncement,
    handleUpdateGroupSettings,
    handleUpdateGroupMemberMute
  };
}
