import type { UserSearchResult } from "@mushroom/shared";
import type { createMobileAccountActions } from "../../actions/account-actions";
import type { createMobileChatActions } from "../../actions/chat-actions";
import { navigateApp } from "../../navigation/app-navigation";
import type { MobileAppState } from "../controller/useMobileAppState";
import type { GroupManageProps } from "../../features/group-info/context/GroupManageContext";

type AccountActions = ReturnType<typeof createMobileAccountActions>;
type ChatActions = ReturnType<typeof createMobileChatActions>;

export function buildGroupManageProps(params: {
  state: MobileAppState;
  accountActions: AccountActions;
  chatActions: ChatActions;
}): GroupManageProps {
  const { state, accountActions, chatActions } = params;
  return {
    pending: state.pending,
    activeConversation: state.activeConversation,
    currentUserId: state.snapshot?.auth.user?.userId,
    currentGroupMemberRole: state.currentGroupMember?.role ?? -1,
    groupSettings: state.groupSettings,
    candidateAddFriends: state.candidateAddFriends,
    existingMemberIds: state.existingGroupMemberIds,
    onSearchUsers: (keyword: string): Promise<UserSearchResult[]> =>
      accountActions.searchUsers(keyword),
    groupNameDraft: state.groupNameDraft,
    groupDescriptionDraft: state.groupDescriptionDraft,
    groupAnnouncementDraft: state.groupAnnouncementDraft,
    groupMuteAll: state.groupMuteAll,
    groupInvitePermission: state.groupInvitePermission,
    groupProfileEditPermission: state.groupProfileEditPermission,
    selectedAddMemberIds: state.selectedAddMemberIds,
    selectedStrangerProfiles: state.selectedStrangerProfiles,
    onChangeGroupName: state.setGroupNameDraft,
    onChangeGroupDescription: state.setGroupDescriptionDraft,
    onChangeGroupAnnouncement: state.setGroupAnnouncementDraft,
    onChangeGroupMuteAll: state.setGroupMuteAll,
    onChangeGroupInvitePermission: state.setGroupInvitePermission,
    onChangeGroupProfileEditPermission: state.setGroupProfileEditPermission,
    onToggleSelectedAddMember: (friendId: number) =>
      state.setSelectedAddMemberIds(current =>
        current.includes(friendId)
          ? current.filter(id => id !== friendId)
          : [...current, friendId]
      ),
    onToggleSelectedStranger: (user: UserSearchResult) => {
      const uid = Number(user.user_id);
      const isContact = state.candidateAddFriends.some(
        contact => Number(contact.user_id) === uid
      );
      state.setSelectedAddMemberIds(current =>
        current.includes(uid)
          ? current.filter(id => id !== uid)
          : [...current, uid]
      );
      if (!isContact) {
        state.setSelectedStrangerProfiles(current => {
          const exists = current.some(p => Number(p.user_id) === uid);
          if (exists) {
            return current.filter(p => Number(p.user_id) !== uid);
          }
          return [...current, user];
        });
      }
    },
    onSaveGroupProfile: () => {
      void accountActions.handleSaveGroupProfile();
    },
    onSaveGroupAnnouncement: () => {
      void accountActions.handleSaveGroupAnnouncement();
    },
    onSaveGroupSettings: () => {
      void accountActions.handleSaveGroupSettings();
    },
    onAddSelectedMembers: () => {
      void accountActions.handleAddSelectedMembers();
    },
    canManageGroupMember: accountActions.canManageGroupMember,
    onToggleGroupMemberRole: (memberUserId: number, nextRole: number) => {
      void accountActions.handleToggleGroupMemberRole(memberUserId, nextRole);
    },
    onUpdateGroupMemberMute: (
      memberUserId: number,
      muteMinutes: number | null
    ) => {
      void accountActions.handleUpdateGroupMemberMute(
        memberUserId,
        muteMinutes
      );
    },
    onPickGroupAvatar: () => {
      void accountActions.handlePickGroupAvatar();
    },
    onTransferGroupOwner: accountActions.handleTransferGroupOwner,
    onRemoveGroupMember: accountActions.handleRemoveGroupMember,
    onLeaveGroup: accountActions.handleLeaveActiveGroup,
    onDisbandGroup: accountActions.handleDisbandActiveGroup,
    onClearConversation: state.activeConversation
      ? () => {
          chatActions.handleClearConversation(
            state.activeConversation ?? undefined
          );
        }
      : () => {
          chatActions.handleClearConversation();
        },
    onToggleMute: state.activeConversation
      ? () => {
          void chatActions.handleToggleConversationMute(
            state.activeConversation!
          );
        }
      : undefined,
    onTogglePin: state.activeConversation
      ? () => {
          void chatActions.handleToggleConversationPin(
            state.activeConversation!
          );
        }
      : undefined,
    onOpenMemberProfile: (memberId: number, memberName: string) => {
      navigateApp("PeerProfile", {
        userId: memberId,
        fallbackNickname: memberName,
        fallbackAvatar: null
      });
    },
    onOpenSearchInChat: () => {
      state.setSearchKeyword("");
      state.setSearchFilter("text");
      state.setHighlightedMessageId(null);
      state.setIsSearchVisible(true);
    }
  };
}
