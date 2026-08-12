import {
  createSystemMessageContent,
  type Conversation as SharedConversation,
  type ConversationSyncMessage
} from "@mushroom/shared";
import { GROUP_NAME_MAX_LENGTH } from "@mushroom/shared";
import pg from "../../db/pg";
import { BusinessError } from "../../handler/business_error";
import ConversationCoreRepository, {
  type DbTx
} from "../../repository/conversation/conversation_core_repository";
import ConversationMemberRepository from "../../repository/conversation/conversation_member_repository";
import ConversationReadStateRepository from "../../repository/conversation/conversation_read_state_repository";
import type {
  ConversationMemberRecord as ConversationMember,
  ConversationRecord as Conversation
} from "../../repository/models";
import OutboxRepository from "../../repository/outbox_repository";
import UserRepository from "../../repository/user_repository";
import { getRequestLogger } from "../../utils/log_context";
import { createDirectConversation } from "./direct_conversation_service";
import { getGroupContext } from "./conversation_group_context";
import {
  GROUP_ROLE_MEMBER,
  GROUP_ROLE_OWNER
} from "./conversation_permissions";

export interface ConversationCreateMemberInput {
  user_id: number;
  role: number;
  nickname?: string;
}

export type ConversationCreateInput = Pick<
  SharedConversation,
  | "type"
  | "name"
  | "avatar_url"
  | "owner_id"
  | "description"
  | "last_message_content"
  | "last_message_time"
>;

class ConversationLifecycleService {
  async createConversation(
    conversation: ConversationCreateInput,
    members: ConversationCreateMemberInput[]
  ): Promise<Conversation & { members: ConversationCreateMemberInput[] }> {
    return pg.tx(async (t: DbTx) => {
      if (conversation.type !== 2) {
        throw new BusinessError("Only group conversations can be created here");
      }
      if (!conversation.owner_id) {
        throw new BusinessError("Group owner is required");
      }
      const trimmedName = conversation.name?.trim() ?? "";
      if (trimmedName.length > GROUP_NAME_MAX_LENGTH) {
        throw new BusinessError(
          `群名称不能超过 ${GROUP_NAME_MAX_LENGTH} 个字符`
        );
      }
      const ownerMember =
        members.find(member => member.user_id === conversation.owner_id) ??
        members.find(member => member.role === GROUP_ROLE_OWNER);
      if (!ownerMember || ownerMember.user_id !== conversation.owner_id) {
        throw new BusinessError("Group owner must be a member");
      }
      const normalizedMembers = Array.from(
        new Map(
          members.map(member => [
            member.user_id,
            {
              ...member,
              role:
                member.user_id === conversation.owner_id
                  ? GROUP_ROLE_OWNER
                  : GROUP_ROLE_MEMBER
            }
          ])
        ).values()
      );
      const users = await UserRepository.findProfilesByIds(
        t,
        normalizedMembers.map(member => member.user_id)
      );
      if (users.length !== normalizedMembers.length) {
        throw new BusinessError("Some users do not exist");
      }
      const conv = await ConversationCoreRepository.insertConversation(t, {
        type: conversation.type,
        name: trimmedName,
        avatar_url: conversation.avatar_url,
        owner_id: conversation.owner_id,
        description: conversation.description
      });

      await ConversationMemberRepository.insertMembers(
        t,
        normalizedMembers.map(member => ({
          conversation_id: conv.id,
          user_id: member.user_id,
          role: member.role,
          nickname: member.nickname ?? null
        }))
      );

      const sequence =
        await ConversationCoreRepository.nextConversationSequence(t, conv.id);
      const ownerUser = users.find(
        u => Number(u.id) === Number(conversation.owner_id)
      );
      const systemMessage =
        await ConversationCoreRepository.insertSystemMessage(
          t,
          conv.id,
          createSystemMessageContent("conversation_created", {
            actor: ownerMember
              ? {
                  user_id: ownerMember.user_id,
                  nickname:
                    ownerMember.nickname || ownerUser?.nickname || undefined
                }
              : conversation.owner_id
                ? {
                    user_id: conversation.owner_id,
                    nickname: ownerUser?.nickname || undefined
                  }
                : undefined
          }),
          sequence
        );

      await ConversationCoreRepository.updateConversationPointers(t, {
        conversationId: conv.id,
        lastMessageId: systemMessage.id,
        lastMessageAt: systemMessage.created_at
      });

      await ConversationReadStateRepository.upsertConversationUserStates(
        t,
        normalizedMembers.map(member => ({
          conversation_id: conv.id,
          user_id: member.user_id,
          is_pinned: false,
          is_muted: false,
          is_archived: false,
          draft: null,
          hidden_before_seq: 0,
          last_read_seq: systemMessage.sequence,
          last_delivered_seq: systemMessage.sequence,
          unread_count: 0,
          peer_id: 0,
          settings: null
        }))
      );

      await ConversationMemberRepository.backfillMemberJoinSequence(
        t,
        conv.id,
        systemMessage.sequence
      );

      await OutboxRepository.insertEvents(
        t,
        normalizedMembers.map(member => ({
          event_type: "conversation.sync",
          conversation_id: conv.id,
          target_user_id: member.user_id,
          payload: {
            messageClassify: "conversation_sync" as const,
            action: "upsert" as const,
            conversation_id: conv.id
          } satisfies ConversationSyncMessage
        }))
      );

      getRequestLogger().info(
        {
          conversationId: conv.id,
          ownerId: conversation.owner_id,
          memberCount: normalizedMembers.length
        },
        "Group conversation created"
      );

      return {
        ...conv,
        members: normalizedMembers
      };
    });
  }

  async createDirectConversation(
    userId: number,
    targetUserId: number
  ): Promise<Conversation & { members: ConversationMember[] }> {
    return createDirectConversation(userId, targetUserId);
  }

  async disbandConversation(userId: number, conversationId: string) {
    return pg.tx(async (t: DbTx) => {
      const { actorMember, members } = await getGroupContext(
        t,
        conversationId,
        userId
      );

      if (actorMember.role !== GROUP_ROLE_OWNER) {
        throw new BusinessError("Only the group owner can disband this group");
      }

      const result = await ConversationCoreRepository.disbandConversation(
        t,
        conversationId
      );
      if (result.rowCount === 0) {
        throw new BusinessError("Group disband failed");
      }

      await OutboxRepository.insertEvents(
        t,
        members.map(member => ({
          event_type: "conversation.sync",
          conversation_id: conversationId,
          target_user_id: member.user_id,
          payload: {
            messageClassify: "conversation_sync" as const,
            action: "remove" as const,
            conversation_id: conversationId
          }
        }))
      );

      getRequestLogger().info(
        {
          conversationId,
          actorUserId: userId,
          memberCount: members.length
        },
        "Group disbanded"
      );
    });
  }
}

export default new ConversationLifecycleService();
