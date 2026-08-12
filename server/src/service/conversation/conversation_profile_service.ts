import {
  createSystemMessageContent,
  type ConversationSyncMessage,
  type GroupConversationSettings
} from "@mushroom/shared";
import {
  GROUP_ANNOUNCEMENT_MAX_LENGTH,
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH
} from "@mushroom/shared";
import pg from "../../db/pg";
import { BusinessError } from "../../handler/business_error";
import ConversationCoreRepository, {
  type DbTx
} from "../../repository/conversation/conversation_core_repository";
import ConversationMemberRepository from "../../repository/conversation/conversation_member_repository";
import type {
  ConversationRecord as Conversation,
  MessageRecord
} from "../../repository/models";
import OutboxRepository from "../../repository/outbox_repository";
import { getRequestLogger } from "../../utils/log_context";
import {
  finishGroupMutation,
  getGroupContext
} from "./conversation_group_context";
import {
  GROUP_ROLE_ADMIN,
  GROUP_ROLE_OWNER,
  canManageGroupProfile,
  getGroupSettings
} from "./conversation_permissions";

export interface ConversationMemberMutationResult {
  conversation: Conversation;
  members: import("../../repository/models").ConversationMemberRecord[];
  messages: MessageRecord[];
}

class ConversationProfileService {
  async updateConversationProfile(
    userId: number,
    conversationId: string,
    name: string,
    description?: string,
    avatarUrl?: string
  ): Promise<Conversation> {
    return pg.tx(async (t: DbTx) => {
      const { conversation, actorMember, members } = await getGroupContext(
        t,
        conversationId,
        userId
      );
      const settings = getGroupSettings(conversation);
      if (!canManageGroupProfile(actorMember.role, settings)) {
        throw new BusinessError("Only group admins can update group profile");
      }

      const trimmedName = name.trim();
      const trimmedDescription = description?.trim() || null;
      const trimmedAvatarUrl = avatarUrl?.trim() || null;
      if (trimmedName.length > GROUP_NAME_MAX_LENGTH) {
        throw new BusinessError(
          `群名称不能超过 ${GROUP_NAME_MAX_LENGTH} 个字符`
        );
      }
      if (
        trimmedDescription &&
        trimmedDescription.length > GROUP_DESCRIPTION_MAX_LENGTH
      ) {
        throw new BusinessError(
          `群简介不能超过 ${GROUP_DESCRIPTION_MAX_LENGTH} 个字符`
        );
      }
      const oldName = conversation.name;
      const nameChanged = trimmedName !== oldName;

      const nextConversation =
        await ConversationCoreRepository.updateConversationProfile(t, {
          conversationId,
          name: trimmedName,
          description: trimmedDescription,
          avatarUrl: trimmedAvatarUrl
        });

      if (!nextConversation) {
        throw new BusinessError("Conversation profile update failed");
      }

      if (nameChanged) {
        const sequence =
          await ConversationCoreRepository.nextConversationSequence(
            t,
            conversationId
          );
        const systemMessage =
          await ConversationCoreRepository.insertSystemMessage(
            t,
            conversationId,
            createSystemMessageContent("group_name_updated", {
              actor: {
                user_id: userId,
                nickname: actorMember.nickname
              },
              newName: trimmedName
            }),
            sequence
          );

        await finishGroupMutation(t, {
          conversation: nextConversation,
          actorUserId: userId,
          members,
          messages: [systemMessage]
        });
      } else {
        await OutboxRepository.insertEvents(
          t,
          members.map(member => ({
            event_type: "conversation.sync",
            conversation_id: conversationId,
            target_user_id: member.user_id,
            payload: {
              messageClassify: "conversation_sync" as const,
              action: "upsert" as const,
              conversation_id: conversationId
            } satisfies ConversationSyncMessage
          }))
        );
      }

      getRequestLogger().info(
        { conversationId, actorUserId: userId },
        "Group profile updated"
      );

      return nextConversation;
    });
  }

  async updateConversationAnnouncement(
    userId: number,
    conversationId: string,
    announcement?: string
  ): Promise<ConversationMemberMutationResult> {
    return pg.tx(async (t: DbTx) => {
      const { conversation, actorMember, members } = await getGroupContext(
        t,
        conversationId,
        userId
      );
      const currentSettings = getGroupSettings(conversation);
      if (!canManageGroupProfile(actorMember.role, currentSettings)) {
        throw new BusinessError(
          "You do not have permission to update group announcement"
        );
      }

      const nextAnnouncement = announcement?.trim() || "";
      if (nextAnnouncement.length > GROUP_ANNOUNCEMENT_MAX_LENGTH) {
        throw new BusinessError(
          `群公告不能超过 ${GROUP_ANNOUNCEMENT_MAX_LENGTH} 个字符`
        );
      }
      const previousAnnouncement = (currentSettings.announcement ?? "").trim();

      // Diff short-circuit: identical announcement should not write the DB,
      // dispatch a sync, or insert a system message.
      // Best-effort optimization; the underlying jsonb merge in
      // ConversationCoreRepository.updateConversationSettings guarantees
      // correctness even when two writers race past this check.
      if (nextAnnouncement === previousAnnouncement) {
        return {
          conversation,
          members,
          messages: []
        };
      }

      const announcementPatch = {
        announcement: nextAnnouncement,
        announcement_updated_at: new Date().toISOString(),
        announcement_updated_by: userId
      };
      const updatedConversation =
        await ConversationCoreRepository.updateConversationSettings(t, {
          conversationId,
          settings: announcementPatch
        });
      if (!updatedConversation) {
        throw new BusinessError("Conversation announcement update failed");
      }

      const sequence =
        await ConversationCoreRepository.nextConversationSequence(
          t,
          conversationId
        );
      const systemMessage =
        await ConversationCoreRepository.insertSystemMessage(
          t,
          conversationId,
          createSystemMessageContent("group_announcement_updated", {
            actor: {
              user_id: userId,
              nickname: actorMember.nickname
            },
            announcement: nextAnnouncement
          }),
          sequence
        );

      await finishGroupMutation(t, {
        conversation: updatedConversation,
        actorUserId: userId,
        members,
        messages: [systemMessage]
      });

      getRequestLogger().info(
        {
          conversationId,
          actorUserId: userId,
          hasAnnouncement: Boolean(nextAnnouncement)
        },
        "Group announcement updated"
      );

      return {
        conversation: updatedConversation,
        members,
        messages: [systemMessage]
      };
    });
  }

  async updateConversationSettings(
    userId: number,
    conversationId: string,
    patch: {
      mute_all?: boolean;
      invite_permission?: "all_members" | "admins_only";
      profile_edit_permission?: "admins" | "owner_only";
    }
  ): Promise<ConversationMemberMutationResult> {
    return pg.tx(async (t: DbTx) => {
      const { conversation, actorMember, members } = await getGroupContext(
        t,
        conversationId,
        userId
      );
      const currentSettings = getGroupSettings(conversation);

      // Build a settings patch containing ONLY fields that actually changed.
      // The repository layer applies a jsonb merge, so unrelated fields
      // (e.g. announcement updated concurrently) are preserved.
      // Best-effort optimization; the underlying jsonb merge guarantees
      // correctness even when two writers race past this check.
      const settingsPatch: Partial<GroupConversationSettings> = {};

      if (patch.mute_all !== undefined) {
        if (actorMember.role < GROUP_ROLE_ADMIN) {
          throw new BusinessError(
            "Only group admins can update mute-all state"
          );
        }
        if (patch.mute_all !== currentSettings.mute_all) {
          settingsPatch.mute_all = patch.mute_all;
        }
      }

      if (
        patch.invite_permission !== undefined ||
        patch.profile_edit_permission !== undefined
      ) {
        if (actorMember.role !== GROUP_ROLE_OWNER) {
          throw new BusinessError(
            "Only the group owner can update group permissions"
          );
        }
        if (
          patch.invite_permission !== undefined &&
          patch.invite_permission !== currentSettings.invite_permission
        ) {
          settingsPatch.invite_permission = patch.invite_permission;
        }
        if (
          patch.profile_edit_permission !== undefined &&
          patch.profile_edit_permission !==
            currentSettings.profile_edit_permission
        ) {
          settingsPatch.profile_edit_permission = patch.profile_edit_permission;
        }
      }

      // Nothing actually changed → don't touch the DB, don't dispatch, don't
      // emit system messages.
      if (Object.keys(settingsPatch).length === 0) {
        return {
          conversation,
          members,
          messages: []
        };
      }

      const updatedConversation =
        await ConversationCoreRepository.updateConversationSettings(t, {
          conversationId,
          settings: settingsPatch
        });
      if (!updatedConversation) {
        throw new BusinessError("Conversation settings update failed");
      }

      const messages: MessageRecord[] = [];
      if (settingsPatch.mute_all !== undefined) {
        const sequence =
          await ConversationCoreRepository.nextConversationSequence(
            t,
            conversationId
          );
        messages.push(
          await ConversationCoreRepository.insertSystemMessage(
            t,
            conversationId,
            createSystemMessageContent("group_mute_all_updated", {
              actor: {
                user_id: userId,
                nickname: actorMember.nickname
              },
              enabled: settingsPatch.mute_all
            }),
            sequence
          )
        );
      }

      if (
        settingsPatch.invite_permission !== undefined ||
        settingsPatch.profile_edit_permission !== undefined
      ) {
        const changedLabels: string[] = [];
        if (settingsPatch.invite_permission !== undefined) {
          changedLabels.push(
            `邀请权限已改为${settingsPatch.invite_permission === "all_members" ? "所有成员可邀请" : "仅管理员可邀请"}`
          );
        }
        if (settingsPatch.profile_edit_permission !== undefined) {
          changedLabels.push(
            `群资料编辑权限已改为${settingsPatch.profile_edit_permission === "owner_only" ? "仅群主" : "管理员"}`
          );
        }
        if (changedLabels.length > 0) {
          const sequence =
            await ConversationCoreRepository.nextConversationSequence(
              t,
              conversationId
            );
          messages.push(
            await ConversationCoreRepository.insertSystemMessage(
              t,
              conversationId,
              createSystemMessageContent("group_settings_updated", {
                actor: {
                  user_id: userId,
                  nickname: actorMember.nickname
                },
                text: `${actorMember.nickname || `用户 ${userId}`} 更新了群设置：${changedLabels.join("，")}`
              }),
              sequence
            )
          );
        }
      }

      if (messages.length > 0) {
        await finishGroupMutation(t, {
          conversation: updatedConversation,
          actorUserId: userId,
          members,
          messages
        });
      }

      getRequestLogger().info(
        {
          conversationId,
          actorUserId: userId,
          patch: settingsPatch
        },
        "Group settings updated"
      );

      return {
        conversation: updatedConversation,
        members,
        messages
      };
    });
  }

  async updateConversationState(
    userId: number,
    conversationId: string,
    patch: {
      isPinned?: boolean;
      isMuted?: boolean;
      isArchived?: boolean;
      draft?: string | null;
      draftProvided?: boolean;
    }
  ): Promise<Conversation> {
    return pg.tx(async (t: DbTx) => {
      const member = await ConversationMemberRepository.findMember(
        t,
        conversationId,
        userId
      );
      if (!member) {
        throw new BusinessError("User is not a member of this conversation");
      }

      const updatedState =
        await ConversationCoreRepository.updateConversationUserState(t, {
          conversationId,
          userId,
          isPinned: patch.isPinned,
          isMuted: patch.isMuted,
          isArchived: patch.isArchived,
          draft: patch.draft,
          draftProvided: patch.draftProvided
        });

      if (!updatedState) {
        throw new BusinessError("Conversation state update failed");
      }

      const updatedConversation =
        await ConversationCoreRepository.findByUserConversationId(
          t,
          userId,
          conversationId
        );

      if (!updatedConversation) {
        throw new BusinessError("Conversation not found after state update");
      }

      return updatedConversation;
    });
  }

  async deleteConversationForSelf(userId: number, conversationId: string) {
    return pg.tx(async (t: DbTx) => {
      const conversation = await ConversationCoreRepository.findById(
        conversationId,
        t
      );
      if (!conversation) {
        throw new BusinessError("Conversation not found");
      }
      const member = await ConversationMemberRepository.findMember(
        t,
        conversationId,
        userId
      );
      if (!member) {
        throw new BusinessError("User is not a member of this conversation");
      }

      const result = await ConversationCoreRepository.hideConversationForUser(
        t,
        conversationId,
        userId,
        Number(conversation.message_seq ?? 0)
      );
      if (result.rowCount === 0) {
        throw new BusinessError("Conversation delete failed");
      }
    });
  }
}

export default new ConversationProfileService();
