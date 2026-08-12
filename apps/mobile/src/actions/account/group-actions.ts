import { Alert } from "react-native";
import type { Conversation } from "@mushroom/shared";
import {
  createSystemMessageContent,
  type ConversationMember
} from "@mushroom/shared";
import {
  mobileAppController,
  mobileServerApi,
  uploadMobileAvatarFile
} from "../../services/app-runtime";
import { pickAvatarImage } from "../../platform/native-pickers";
import type { RunAction } from "../action-types";
import type { MobileAppState } from "../../app/controller/useMobileAppState";
import { getReadableErrorMessage } from "../../utils/error-message";
import { i18n } from "../../i18n";

function formatMuteSuccessMessage(muteMinutes: number): string {
  if (muteMinutes >= 1440) {
    const days = Math.floor(muteMinutes / 1440);
    const remainHours = Math.floor((muteMinutes % 1440) / 60);
    return remainHours > 0
      ? i18n.t("groupActions.muteForDaysHours", {
          days,
          hours: remainHours
        })
      : i18n.t("groupActions.muteForDays", { count: days });
  }
  if (muteMinutes >= 60) {
    const hours = Math.floor(muteMinutes / 60);
    const remainMin = muteMinutes % 60;
    return remainMin > 0
      ? i18n.t("groupActions.muteForHoursMinutes", {
          hours,
          minutes: remainMin
        })
      : i18n.t("groupActions.muteForHours", { count: hours });
  }
  return i18n.t("groupActions.muteForMinutes", { count: muteMinutes });
}

export function createGroupActions(params: {
  state: MobileAppState;
  runAction: RunAction;
  closeConversationDetail: () => void;
}) {
  const { state, runAction, closeConversationDetail } = params;

  async function handleCreateGroupConversation(input: {
    groupName: string;
    memberIds: number[];
    memberProfiles?: Array<{
      user_id: number;
      username: string;
      nickname?: string;
      avatar_url?: string;
    }>;
  }): Promise<Conversation | null> {
    const ownerId = Number(state.snapshot?.auth.user?.userId || 0);
    if (!ownerId) {
      throw new Error(i18n.t("groupActions.sessionInvalid"));
    }

    const groupName = input.groupName.trim();
    if (!groupName) {
      throw new Error(i18n.t("groupActions.groupNameRequired"));
    }

    if (input.memberIds.length === 0) {
      throw new Error(i18n.t("createGroup.membersRequired"));
    }

    const profileMap = new Map<
      number,
      {
        user_id: number;
        username: string;
        nickname?: string;
        avatar_url?: string;
      }
    >();
    for (const profile of input.memberProfiles ?? []) {
      profileMap.set(Number(profile.user_id), profile);
    }

    const resolvedMembers = input.memberIds.map(rawId => {
      const userId = Number(rawId);
      const friend = state.availableContacts.find(
        item => Number(item.user_id) === userId
      );
      if (friend) {
        return {
          user_id: userId,
          nickname: friend.nickname || friend.username,
          avatar_url: friend.avatar_url,
          role: 0
        } satisfies ConversationMember;
      }
      const profile = profileMap.get(userId);
      return {
        user_id: userId,
        nickname:
          profile?.nickname ||
          profile?.username ||
          i18n.t("display.unknownUser", { id: userId }),
        avatar_url: profile?.avatar_url,
        role: 0
      } satisfies ConversationMember;
    });

    const members: ConversationMember[] = [
      {
        user_id: ownerId,
        nickname:
          state.snapshot?.auth.user?.nickname ||
          state.snapshot?.auth.user?.username ||
          i18n.t("display.unknownUser", { id: ownerId }),
        role: 2
      },
      ...resolvedMembers
    ];

    const createdAt = new Date().toISOString();
    const result = await mobileServerApi.createConversation({
      conv: {
        type: 2,
        name: groupName,
        owner_id: ownerId,
        last_message_content: createSystemMessageContent(
          "conversation_created"
        ),
        last_message_time: createdAt
      },
      members
    });

    await mobileAppController.syncNow();
    const snapshot = await mobileAppController.snapshot();
    return (
      snapshot.data.conversations.find(
        item => String(item.server_conversation_id) === String(result.data.id)
      ) ?? null
    );
  }

  function canManageGroupMember(memberUserId: number, memberRole: number) {
    const selfRole = state.currentGroupMember?.role ?? -1;
    const selfUserId = Number(state.snapshot?.auth.user?.userId || 0);

    if (memberUserId === selfUserId) {
      return false;
    }

    if (selfRole === 2) {
      return memberRole < 2;
    }

    if (selfRole === 1) {
      return memberRole === 0;
    }

    return false;
  }

  async function handleSaveGroupProfile() {
    if (!state.activeConversation || state.activeConversation.type !== 2) {
      return;
    }
    if (!state.groupNameDraft.trim()) {
      state.setError(i18n.t("groupActions.groupNameRequiredShort"));
      return;
    }

    await runAction(
      "",
      () =>
        mobileAppController.updateGroupProfile(
          state.activeConversation!.client_conversation_id,
          {
            name: state.groupNameDraft.trim(),
            description: state.groupDescriptionDraft.trim() || undefined
          }
        ),
      ""
    );
  }

  async function handleSaveGroupAnnouncement() {
    if (!state.activeConversation || state.activeConversation.type !== 2) {
      return;
    }

    await runAction(
      "",
      () =>
        mobileAppController.updateGroupAnnouncement(
          state.activeConversation!.client_conversation_id,
          state.groupAnnouncementDraft.trim() || undefined
        ),
      ""
    );
  }

  async function handleSaveGroupSettings() {
    if (!state.activeConversation || state.activeConversation.type !== 2) {
      return;
    }

    // Build a diff-based patch so callers without owner privileges (e.g. admins
    // toggling only mute_all) do not include owner-only fields in the payload,
    // which would otherwise trip the server's per-field permission checks.
    const current = state.groupSettings;
    const patch: {
      mute_all?: boolean;
      invite_permission?: "all_members" | "admins_only";
      profile_edit_permission?: "admins" | "owner_only";
    } = {};
    if (state.groupMuteAll !== Boolean(current.mute_all)) {
      patch.mute_all = state.groupMuteAll;
    }
    if (
      state.groupInvitePermission !==
      (current.invite_permission || "all_members")
    ) {
      patch.invite_permission = state.groupInvitePermission;
    }
    if (
      state.groupProfileEditPermission !==
      (current.profile_edit_permission || "admins")
    ) {
      patch.profile_edit_permission = state.groupProfileEditPermission;
    }
    if (Object.keys(patch).length === 0) {
      return;
    }

    await runAction(
      "",
      () =>
        mobileAppController.updateGroupSettings(
          state.activeConversation!.client_conversation_id,
          patch
        ),
      ""
    );
  }

  async function handleAddSelectedMembers() {
    if (!state.activeConversation || state.activeConversation.type !== 2) {
      return;
    }
    if (state.selectedAddMemberIds.length === 0) {
      state.setError(i18n.t("groupActions.selectContactsToInvite"));
      return;
    }

    const existingIds = new Set(
      (state.activeConversation.members ?? []).map(m => Number(m.user_id))
    );
    const idsToInvite = state.selectedAddMemberIds.filter(
      id => !existingIds.has(Number(id))
    );
    if (idsToInvite.length === 0) {
      state.setError(i18n.t("groupActions.allSelectedInGroup"));
      state.setSelectedAddMemberIds([]);
      state.setSelectedStrangerProfiles([]);
      return;
    }

    await runAction(
      "",
      async () => {
        await mobileAppController.addGroupMembers(
          state.activeConversation!.client_conversation_id,
          idsToInvite
        );
        state.setSelectedAddMemberIds([]);
        state.setSelectedStrangerProfiles([]);
      },
      ""
    );
  }

  function handleRemoveGroupMember(memberUserId: number, memberName: string) {
    if (!state.activeConversation || state.activeConversation.type !== 2) {
      return;
    }

    Alert.alert(
      i18n.t("groupActions.removeMemberTitle"),
      i18n.t("groupActions.removeMemberConfirm", { name: memberName }),
      [
        {
          text: i18n.t("common.cancel"),
          style: "cancel"
        },
        {
          text: i18n.t("groupActions.remove"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              state.setPending(true);
              state.setError("");
              try {
                await mobileAppController.removeGroupMember(
                  state.activeConversation!.client_conversation_id,
                  memberUserId
                );
                state.setStatus(i18n.t("groupActions.memberRemoved"), "silent");
              } catch (currentError) {
                const readableError = getReadableErrorMessage(currentError);
                state.setError(readableError);
                state.setStatus(readableError);
              } finally {
                state.setPending(false);
              }
            })();
          }
        }
      ]
    );
  }

  async function handleToggleGroupMemberRole(
    memberUserId: number,
    nextRole: number
  ) {
    if (!state.activeConversation || state.activeConversation.type !== 2) {
      return;
    }

    await runAction(
      "",
      () =>
        mobileAppController.updateGroupMemberRole(
          state.activeConversation!.client_conversation_id,
          memberUserId,
          nextRole
        ),
      ""
    );
  }

  async function handleUpdateGroupMemberMute(
    memberUserId: number,
    muteMinutes: number | null
  ) {
    if (!state.activeConversation || state.activeConversation.type !== 2) {
      return;
    }

    const isUnmute = muteMinutes === null;
    const successMessage = isUnmute
      ? i18n.t("groupActions.muteLifted")
      : formatMuteSuccessMessage(muteMinutes ?? 0);

    void successMessage;

    await runAction(
      "",
      () =>
        mobileAppController.updateGroupMemberMute(
          state.activeConversation!.client_conversation_id,
          memberUserId,
          muteMinutes
        ),
      ""
    );
  }

  async function handlePickGroupAvatar() {
    if (!state.activeConversation || state.activeConversation.type !== 2) {
      return;
    }

    let image: Awaited<ReturnType<typeof pickAvatarImage>> = null;
    try {
      image = await pickAvatarImage();
    } catch (currentError) {
      const readableError = getReadableErrorMessage(currentError);
      state.setError(readableError);
      state.setStatus(readableError);
      return;
    }
    if (!image) {
      return;
    }
    const pickedImage = image;
    const conversationId = state.activeConversation.client_conversation_id;

    await runAction(
      "",
      async () => {
        const uploaded = await uploadMobileAvatarFile(pickedImage);
        const nextAvatarUrl =
          uploaded.large ||
          uploaded.medium ||
          uploaded.small ||
          uploaded.original;
        if (!nextAvatarUrl) {
          throw new Error(i18n.t("groupActions.avatarNoUrl"));
        }
        const currentName =
          state.activeConversation?.name?.trim() ||
          i18n.t("groupInfo.fallbackName");
        const currentDescription =
          state.activeConversation?.description ?? undefined;
        await mobileAppController.updateGroupProfile(conversationId, {
          name: currentName,
          description: currentDescription,
          avatar_url: nextAvatarUrl
        });
      },
      ""
    );
  }

  function handleTransferGroupOwner(memberUserId: number, memberName: string) {
    if (!state.activeConversation || state.activeConversation.type !== 2) {
      return;
    }

    Alert.alert(
      i18n.t("groupActions.transferOwnerTitle"),
      i18n.t("groupActions.transferOwnerConfirm", { name: memberName }),
      [
        {
          text: i18n.t("common.cancel"),
          style: "cancel"
        },
        {
          text: i18n.t("groupActions.transfer"),
          style: "destructive",
          onPress: () => {
            void runAction(
              "",
              () =>
                mobileAppController.transferGroupOwner(
                  state.activeConversation!.client_conversation_id,
                  memberUserId
                ),
              ""
            );
          }
        }
      ]
    );
  }

  function handleLeaveActiveGroup() {
    if (!state.activeConversation || state.activeConversation.type !== 2) {
      return;
    }

    Alert.alert(
      i18n.t("groupActions.leaveGroupTitle"),
      i18n.t("groupActions.leaveGroupConfirm"),
      [
        {
          text: i18n.t("common.cancel"),
          style: "cancel"
        },
        {
          text: i18n.t("groupActions.leave"),
          style: "destructive",
          onPress: () => {
            void runAction(
              "",
              async () => {
                await mobileAppController.leaveConversation(
                  state.activeConversation!.client_conversation_id
                );
                closeConversationDetail();
              },
              ""
            );
          }
        }
      ]
    );
  }

  function handleDisbandActiveGroup() {
    if (!state.activeConversation || state.activeConversation.type !== 2) {
      return;
    }

    Alert.alert(
      i18n.t("groupActions.disbandGroupTitle"),
      i18n.t("groupActions.disbandGroupConfirm"),
      [
        {
          text: i18n.t("common.cancel"),
          style: "cancel"
        },
        {
          text: i18n.t("groupActions.disband"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              state.setPending(true);
              state.setError("");
              try {
                await mobileAppController.disbandConversation(
                  state.activeConversation!.client_conversation_id
                );
                closeConversationDetail();
                state.setStatus(
                  i18n.t("groupActions.groupDisbanded"),
                  "silent"
                );
              } catch (currentError) {
                const readableError = getReadableErrorMessage(currentError);
                state.setError(readableError);
                state.setStatus(readableError);
              } finally {
                state.setPending(false);
              }
            })();
          }
        }
      ]
    );
  }

  return {
    handleCreateGroupConversation,
    canManageGroupMember,
    handleSaveGroupProfile,
    handleSaveGroupAnnouncement,
    handleSaveGroupSettings,
    handleAddSelectedMembers,
    handleRemoveGroupMember,
    handleToggleGroupMemberRole,
    handleUpdateGroupMemberMute,
    handlePickGroupAvatar,
    handleTransferGroupOwner,
    handleLeaveActiveGroup,
    handleDisbandActiveGroup
  };
}
