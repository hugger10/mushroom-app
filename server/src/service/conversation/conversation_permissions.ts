import {
  parseGroupConversationSettings,
  type GroupConversationSettings
} from "@mushroom/shared";
import { BusinessError } from "../../handler/business_error";
import type {
  ConversationMemberRecord as ConversationMember,
  ConversationRecord as Conversation
} from "../../repository/models";

export const GROUP_ROLE_MEMBER = 0;
export const GROUP_ROLE_ADMIN = 1;
export const GROUP_ROLE_OWNER = 2;

export const DEFAULT_GROUP_SETTINGS: GroupConversationSettings = {
  mute_all: false,
  invite_permission: "admins_only",
  profile_edit_permission: "admins"
};

export function getRoleLabel(role: number) {
  switch (role) {
    case GROUP_ROLE_OWNER:
      return "群主";
    case GROUP_ROLE_ADMIN:
      return "管理员";
    default:
      return "成员";
  }
}

export function getGroupSettings(conversation: Conversation) {
  return {
    ...DEFAULT_GROUP_SETTINGS,
    ...parseGroupConversationSettings(conversation.settings)
  };
}

export function canManageGroupProfile(
  actorRole: number,
  settings: GroupConversationSettings
) {
  if (settings.profile_edit_permission === "owner_only") {
    return actorRole === GROUP_ROLE_OWNER;
  }
  return actorRole >= GROUP_ROLE_ADMIN;
}

export function canInviteGroupMembers(
  actorRole: number,
  settings: GroupConversationSettings
) {
  if (settings.invite_permission === "all_members") {
    return actorRole >= GROUP_ROLE_MEMBER;
  }
  return actorRole >= GROUP_ROLE_ADMIN;
}

export function assertCanRemoveMember(
  actorMember: ConversationMember,
  targetMember: ConversationMember
) {
  if (actorMember.role < GROUP_ROLE_ADMIN) {
    throw new BusinessError("Only group admins can remove members");
  }
  if (targetMember.role === GROUP_ROLE_OWNER) {
    throw new BusinessError("Group owner cannot be removed");
  }
  if (
    actorMember.role < GROUP_ROLE_OWNER &&
    targetMember.role >= GROUP_ROLE_ADMIN
  ) {
    throw new BusinessError("Admins can only remove regular members");
  }
}
