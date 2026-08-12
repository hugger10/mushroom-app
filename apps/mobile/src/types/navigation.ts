import type { MergedForwardContent } from "@mushroom/shared";
import type { TextProfileField } from "../features/account/profile-fields";

export type GroupInfoPermissionField =
  | "send_messages"
  | "edit_info"
  | "add_members";

export type AppStackParamList = {
  Home: undefined;
  Chat: undefined;
  AccountSecurityOverview: undefined;
  AccountSecurityDevices: undefined;
  AccountSecurityPassword: undefined;
  AccountSecurityPrivacy: undefined;
  AccountSecurityBlocked: undefined;
  AccountSecurityEvents: undefined;
  AddContact: undefined;
  AddressBookMatchList: undefined;
  StorageDataOverview: undefined;
  StorageUsage: undefined;
  GroupInfo: undefined;
  GroupInfoMembers: undefined;
  GroupInfoProfile: undefined;
  GroupInfoAnnouncement: undefined;
  GroupInfoPermissions: undefined;
  GroupInfoPermissionChoice: { field: GroupInfoPermissionField };
  GroupInfoInvite: undefined;
  NotificationSettings: undefined;
  MyProfile: undefined;
  MyProfileFieldEdit: { field: TextProfileField };
  MyProfileGenderEdit: undefined;
  MyProfileBirthdayEdit: undefined;
  MergedForwardDetail: { content: MergedForwardContent };
  StartDirect: undefined;
  StartGroupSelect: undefined;
  StartGroupConfigure: undefined;
  WorkspaceSearch: undefined;
  ChatMedia: { clientConversationId: string; title?: string };
  PeerProfile: {
    userId: number;
    fallbackNickname?: string;
    fallbackUsername?: string | null;
    fallbackAvatar?: string | null;
  };
  PeerProfileRemark: { userId: number };
};
