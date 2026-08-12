import type {
  ContactListItem,
  Conversation,
  GroupConversationSettings,
  UserSearchResult
} from "@mushroom/shared";
import { createContext, useContext, type ReactNode } from "react";

export type GroupManageProps = {
  pending: boolean;
  activeConversation: Conversation | null;
  currentUserId?: number | null;
  currentGroupMemberRole: number;
  groupSettings: GroupConversationSettings;
  candidateAddFriends: ContactListItem[];
  existingMemberIds: Set<number>;
  onSearchUsers: (keyword: string) => Promise<UserSearchResult[]>;
  selectedStrangerProfiles: UserSearchResult[];
  onToggleSelectedStranger: (user: UserSearchResult) => void;
  groupNameDraft: string;
  groupDescriptionDraft: string;
  groupAnnouncementDraft: string;
  groupMuteAll: boolean;
  groupInvitePermission: "all_members" | "admins_only";
  groupProfileEditPermission: "admins" | "owner_only";
  selectedAddMemberIds: number[];
  onChangeGroupName: (value: string) => void;
  onChangeGroupDescription: (value: string) => void;
  onChangeGroupAnnouncement: (value: string) => void;
  onChangeGroupMuteAll: (value: boolean) => void;
  onChangeGroupInvitePermission: (value: "all_members" | "admins_only") => void;
  onChangeGroupProfileEditPermission: (value: "admins" | "owner_only") => void;
  onToggleSelectedAddMember: (friendId: number) => void;
  onSaveGroupProfile: () => void;
  onSaveGroupAnnouncement: () => void;
  onSaveGroupSettings: () => void;
  onAddSelectedMembers: () => void;
  canManageGroupMember: (memberUserId: number, memberRole: number) => boolean;
  onToggleGroupMemberRole: (memberUserId: number, nextRole: number) => void;
  onUpdateGroupMemberMute: (
    memberUserId: number,
    muteMinutes: number | null
  ) => void;
  onPickGroupAvatar?: () => void;
  onTransferGroupOwner: (memberUserId: number, memberName: string) => void;
  onRemoveGroupMember: (memberUserId: number, memberName: string) => void;
  onLeaveGroup: () => void;
  onDisbandGroup: () => void;
  onClearConversation?: () => void;
  onToggleMute?: () => void;
  onTogglePin?: () => void;
  onOpenMemberProfile?: (memberId: number, memberName: string) => void;
  onOpenSearchInChat?: () => void;
};

const GroupManageContext = createContext<GroupManageProps | null>(null);

export function GroupManageProvider(props: {
  value: GroupManageProps;
  children: ReactNode;
}) {
  return (
    <GroupManageContext.Provider value={props.value}>
      {props.children}
    </GroupManageContext.Provider>
  );
}

export function useGroupManage(): GroupManageProps {
  const value = useContext(GroupManageContext);
  if (!value) {
    throw new Error("useGroupManage must be used inside GroupManageProvider");
  }
  return value;
}
