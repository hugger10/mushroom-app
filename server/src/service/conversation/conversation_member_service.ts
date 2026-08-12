import {
  createSystemMessageContent,
  type ConversationSyncMessage
} from "@mushroom/shared";
import pg from "../../db/pg";
import { BusinessError } from "../../handler/business_error";
import ConversationCoreRepository, {
  type DbTx
} from "../../repository/conversation/conversation_core_repository";
import ConversationMemberRepository from "../../repository/conversation/conversation_member_repository";
import type {
  ConversationMemberRecord as ConversationMember,
  ConversationRecord as Conversation,
  MessageRecord
} from "../../repository/models";
import OutboxRepository from "../../repository/outbox_repository";
import UserRepository from "../../repository/user_repository";
import { getRequestLogger } from "../../utils/log_context";
import {
  finishGroupMutation,
  getGroupContext
} from "./conversation_group_context";
import {
  GROUP_ROLE_ADMIN,
  GROUP_ROLE_MEMBER,
  GROUP_ROLE_OWNER,
  assertCanRemoveMember,
  canInviteGroupMembers,
  getGroupSettings,
  getRoleLabel
} from "./conversation_permissions";
import type { ConversationCreateMemberInput } from "./conversation_lifecycle_service";

export interface ConversationMemberMutationResult {
  conversation: Conversation;
  members: ConversationMember[];
  messages: MessageRecord[];
}

class ConversationMemberService {
  async addConversationMembers(
    userId: number,
    conversationId: string,
    members: ConversationCreateMemberInput[]
  ): Promise<ConversationMemberMutationResult> {
    return pg.tx(async (t: DbTx) => {
      const {
        conversation,
        actorMember,
        members: activeMembers
      } = await getGroupContext(t, conversationId, userId);
      const settings = getGroupSettings(conversation);

      if (!canInviteGroupMembers(actorMember.role, settings)) {
        throw new BusinessError("You do not have permission to invite members");
      }

      const uniqueInputs = Array.from(
        new Map(
          members.map(member => [
            member.user_id,
            {
              ...member,
              role:
                member.role === GROUP_ROLE_OWNER
                  ? GROUP_ROLE_MEMBER
                  : member.role
            }
          ])
        ).values()
      );

      const activeMemberIds = new Set(
        activeMembers.map(member => member.user_id)
      );
      const pendingInputs = uniqueInputs.filter(
        member => !activeMemberIds.has(member.user_id)
      );

      if (pendingInputs.length === 0) {
        throw new BusinessError("No new members to add");
      }

      const users = await UserRepository.findProfilesByIds(
        t,
        pendingInputs.map(member => member.user_id)
      );
      if (users.length !== pendingInputs.length) {
        throw new BusinessError("Some users do not exist");
      }

      const userMap = new Map(users.map(user => [user.id, user]));
      await ConversationMemberRepository.upsertMembers(
        t,
        pendingInputs.map(member => ({
          conversation_id: conversationId,
          user_id: member.user_id,
          role:
            member.role === GROUP_ROLE_ADMIN &&
            actorMember.role === GROUP_ROLE_OWNER
              ? GROUP_ROLE_ADMIN
              : GROUP_ROLE_MEMBER,
          nickname:
            member.nickname ?? userMap.get(member.user_id)?.nickname ?? null
        }))
      );

      const systemMessages: MessageRecord[] = [];
      for (const member of pendingInputs) {
        const sequence =
          await ConversationCoreRepository.nextConversationSequence(
            t,
            conversationId
          );
        const systemMessage =
          await ConversationCoreRepository.insertSystemMessage(
            t,
            conversationId,
            createSystemMessageContent("group_member_joined", {
              actor: {
                user_id: member.user_id,
                nickname:
                  member.nickname ?? userMap.get(member.user_id)?.nickname
              }
            }),
            sequence
          );
        await ConversationMemberRepository.setMemberJoinSequence(
          t,
          conversationId,
          member.user_id,
          sequence
        );
        systemMessages.push(systemMessage);
      }

      const nextMembers =
        await ConversationMemberRepository.findMembersByConversation(
          t,
          conversationId
        );
      await finishGroupMutation(t, {
        conversation,
        actorUserId: userId,
        members: nextMembers,
        messages: systemMessages,
        readUserIds: pendingInputs.map(member => member.user_id)
      });

      await OutboxRepository.insertEvents(
        t,
        pendingInputs.map(member => ({
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

      getRequestLogger().info(
        {
          conversationId,
          actorUserId: userId,
          addedUserIds: pendingInputs.map(m => m.user_id)
        },
        "Group members added"
      );

      return {
        conversation,
        members: nextMembers,
        messages: systemMessages
      };
    });
  }

  async leaveConversation(
    userId: number,
    conversationId: string
  ): Promise<ConversationMemberMutationResult> {
    return pg.tx(async (t: DbTx) => {
      const {
        conversation,
        actorMember,
        members: activeMembers
      } = await getGroupContext(t, conversationId, userId);

      if (actorMember.role === GROUP_ROLE_OWNER && activeMembers.length > 1) {
        throw new BusinessError(
          "Group owner must transfer ownership before leaving"
        );
      }

      const sequence =
        await ConversationCoreRepository.nextConversationSequence(
          t,
          conversationId
        );
      const leftMember = await ConversationMemberRepository.markMemberLeft(
        t,
        conversationId,
        userId,
        sequence
      );

      if (!leftMember) {
        throw new BusinessError(
          "User is not an active member of this conversation"
        );
      }

      const systemMessage =
        await ConversationCoreRepository.insertSystemMessage(
          t,
          conversationId,
          createSystemMessageContent("group_member_left", {
            actor: {
              user_id: userId,
              nickname: actorMember.nickname
            }
          }),
          sequence
        );

      const nextMembers =
        await ConversationMemberRepository.findMembersByConversation(
          t,
          conversationId
        );
      await finishGroupMutation(t, {
        conversation,
        actorUserId: userId,
        members: nextMembers,
        messages: [systemMessage]
      });

      getRequestLogger().info(
        { conversationId, actorUserId: userId },
        "Member left group"
      );

      return {
        conversation,
        members: nextMembers,
        messages: [systemMessage]
      };
    });
  }

  async removeConversationMember(
    userId: number,
    conversationId: string,
    targetUserId: number
  ): Promise<ConversationMemberMutationResult> {
    return pg.tx(async (t: DbTx) => {
      const { conversation, actorMember } = await getGroupContext(
        t,
        conversationId,
        userId
      );
      const targetMember = await ConversationMemberRepository.findMember(
        t,
        conversationId,
        targetUserId
      );

      if (!targetMember) {
        throw new BusinessError("Target member not found");
      }
      if (targetUserId === userId) {
        throw new BusinessError("Use leave conversation to remove yourself");
      }

      assertCanRemoveMember(actorMember, targetMember);

      const sequence =
        await ConversationCoreRepository.nextConversationSequence(
          t,
          conversationId
        );
      const removedMember = await ConversationMemberRepository.markMemberLeft(
        t,
        conversationId,
        targetUserId,
        sequence
      );
      if (!removedMember) {
        throw new BusinessError("Target member is no longer active");
      }

      const systemMessage =
        await ConversationCoreRepository.insertSystemMessage(
          t,
          conversationId,
          createSystemMessageContent("group_member_removed", {
            actor: {
              user_id: userId,
              nickname: actorMember.nickname
            },
            target: {
              user_id: targetUserId,
              nickname: targetMember.nickname
            }
          }),
          sequence
        );

      const nextMembers =
        await ConversationMemberRepository.findMembersByConversation(
          t,
          conversationId
        );
      await finishGroupMutation(t, {
        conversation,
        actorUserId: userId,
        members: nextMembers,
        messages: [systemMessage]
      });

      getRequestLogger().info(
        { conversationId, actorUserId: userId, targetUserId },
        "Group member removed"
      );

      return {
        conversation,
        members: nextMembers,
        messages: [systemMessage]
      };
    });
  }

  async updateConversationMemberRole(
    userId: number,
    conversationId: string,
    targetUserId: number,
    role: number
  ): Promise<ConversationMemberMutationResult> {
    return pg.tx(async (t: DbTx) => {
      const { conversation, actorMember } = await getGroupContext(
        t,
        conversationId,
        userId
      );
      const targetMember = await ConversationMemberRepository.findMember(
        t,
        conversationId,
        targetUserId
      );

      if (!targetMember) {
        throw new BusinessError("Target member not found");
      }
      if (actorMember.role !== GROUP_ROLE_OWNER) {
        throw new BusinessError("Only the group owner can update member roles");
      }
      if (targetMember.role === GROUP_ROLE_OWNER) {
        throw new BusinessError("Group owner role cannot be changed here");
      }
      if (targetUserId === userId) {
        throw new BusinessError("Cannot update your own role");
      }
      if (![GROUP_ROLE_MEMBER, GROUP_ROLE_ADMIN].includes(role)) {
        throw new BusinessError("Unsupported group role");
      }
      if (targetMember.role === role) {
        throw new BusinessError("Member role is already up to date");
      }

      const updatedMember = await ConversationMemberRepository.updateMemberRole(
        t,
        conversationId,
        targetUserId,
        role
      );
      if (!updatedMember) {
        throw new BusinessError("Target member is no longer active");
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
          createSystemMessageContent("group_role_updated", {
            actor: {
              user_id: userId,
              nickname: actorMember.nickname
            },
            target: {
              user_id: targetUserId,
              nickname: targetMember.nickname
            },
            role: getRoleLabel(role)
          }),
          sequence
        );

      const nextMembers =
        await ConversationMemberRepository.findMembersByConversation(
          t,
          conversationId
        );
      await finishGroupMutation(t, {
        conversation,
        actorUserId: userId,
        members: nextMembers,
        messages: [systemMessage]
      });

      getRequestLogger().info(
        { conversationId, actorUserId: userId, targetUserId, role },
        "Group member role updated"
      );

      return {
        conversation,
        members: nextMembers,
        messages: [systemMessage]
      };
    });
  }

  async updateConversationMemberMute(
    userId: number,
    conversationId: string,
    targetUserId: number,
    muteMinutes?: number | null
  ): Promise<ConversationMemberMutationResult> {
    return pg.tx(async (t: DbTx) => {
      const { conversation, actorMember } = await getGroupContext(
        t,
        conversationId,
        userId
      );
      const targetMember = await ConversationMemberRepository.findMember(
        t,
        conversationId,
        targetUserId
      );

      if (!targetMember) {
        throw new BusinessError("Target member not found");
      }
      if (targetUserId === userId) {
        throw new BusinessError("Cannot mute yourself");
      }
      if (targetMember.role === GROUP_ROLE_OWNER) {
        throw new BusinessError("Group owner cannot be muted");
      }
      if (actorMember.role < GROUP_ROLE_ADMIN) {
        throw new BusinessError("Only group admins can mute members");
      }
      if (
        actorMember.role < GROUP_ROLE_OWNER &&
        targetMember.role >= GROUP_ROLE_ADMIN
      ) {
        throw new BusinessError("Admins can only mute regular members");
      }

      const nextMuteUntil =
        muteMinutes && muteMinutes > 0
          ? new Date(Date.now() + muteMinutes * 60 * 1000)
          : null;
      const updatedMember =
        await ConversationMemberRepository.updateMemberMuteState(
          t,
          conversationId,
          targetUserId,
          nextMuteUntil,
          nextMuteUntil ? userId : null
        );
      if (!updatedMember) {
        throw new BusinessError("Target member is no longer active");
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
          createSystemMessageContent(
            nextMuteUntil ? "group_member_muted" : "group_member_unmuted",
            {
              actor: {
                user_id: userId,
                nickname: actorMember.nickname
              },
              target: {
                user_id: targetUserId,
                nickname: targetMember.nickname
              }
            }
          ),
          sequence
        );

      const nextMembers =
        await ConversationMemberRepository.findMembersByConversation(
          t,
          conversationId
        );
      await finishGroupMutation(t, {
        conversation,
        actorUserId: userId,
        members: nextMembers,
        messages: [systemMessage]
      });

      getRequestLogger().info(
        {
          conversationId,
          actorUserId: userId,
          targetUserId,
          muteUntil: nextMuteUntil?.toISOString() ?? null,
          muteMinutes: muteMinutes ?? null
        },
        nextMuteUntil ? "Group member muted" : "Group member unmuted"
      );

      return {
        conversation,
        members: nextMembers,
        messages: [systemMessage]
      };
    });
  }

  async transferConversationOwner(
    userId: number,
    conversationId: string,
    targetUserId: number
  ): Promise<ConversationMemberMutationResult> {
    return pg.tx(async (t: DbTx) => {
      const { actorMember } = await getGroupContext(t, conversationId, userId);
      const targetMember = await ConversationMemberRepository.findMember(
        t,
        conversationId,
        targetUserId
      );

      if (!targetMember) {
        throw new BusinessError("Target member not found");
      }
      if (actorMember.role !== GROUP_ROLE_OWNER) {
        throw new BusinessError("Only the group owner can transfer ownership");
      }
      if (targetUserId === userId) {
        throw new BusinessError("Target member is already the group owner");
      }

      const nextOwner = await ConversationMemberRepository.updateMemberRole(
        t,
        conversationId,
        targetUserId,
        GROUP_ROLE_OWNER
      );
      const previousOwner = await ConversationMemberRepository.updateMemberRole(
        t,
        conversationId,
        userId,
        GROUP_ROLE_ADMIN
      );
      const updatedConversation =
        await ConversationCoreRepository.updateConversationOwner(
          t,
          conversationId,
          targetUserId
        );

      if (!nextOwner || !previousOwner || !updatedConversation) {
        throw new BusinessError("Transfer ownership failed");
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
          createSystemMessageContent("group_owner_transferred", {
            actor: {
              user_id: userId,
              nickname: actorMember.nickname
            },
            target: {
              user_id: targetUserId,
              nickname: targetMember.nickname
            }
          }),
          sequence
        );

      const nextMembers =
        await ConversationMemberRepository.findMembersByConversation(
          t,
          conversationId
        );
      await finishGroupMutation(t, {
        conversation: updatedConversation,
        actorUserId: userId,
        members: nextMembers,
        messages: [systemMessage]
      });

      getRequestLogger().info(
        { conversationId, fromUserId: userId, toUserId: targetUserId },
        "Group ownership transferred"
      );

      return {
        conversation: updatedConversation,
        members: nextMembers,
        messages: [systemMessage]
      };
    });
  }
}

export default new ConversationMemberService();
