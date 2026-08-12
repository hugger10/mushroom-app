import type { ConversationSyncMessage } from "@mushroom/shared";
import pg from "../../db/pg";
import { BusinessError } from "../../handler/business_error";
import ConversationCoreRepository, {
  type DbTx
} from "../../repository/conversation/conversation_core_repository";
import ConversationMemberRepository from "../../repository/conversation/conversation_member_repository";
import DirectConversationRepository from "../../repository/conversation/direct_conversation_repository";
import type {
  ConversationMemberRecord,
  ConversationRecord
} from "../../repository/models";
import OutboxRepository from "../../repository/outbox_repository";
import UserRepository from "../../repository/user_repository";
import BlockService from "../block_service";

class DirectConversationPairConflictError extends Error {
  constructor() {
    super("Direct conversation already exists");
    Object.setPrototypeOf(this, DirectConversationPairConflictError.prototype);
  }
}

async function loadDirectConversation(
  userId: number,
  targetUserId: number
): Promise<
  (ConversationRecord & { members: ConversationMemberRecord[] }) | null
> {
  return pg.tx(async (t: DbTx) => {
    const existing =
      await DirectConversationRepository.findDirectConversationBetweenUsers(
        t,
        userId,
        targetUserId
      );
    if (!existing) {
      return null;
    }

    const hydrated = await ConversationCoreRepository.findByUserConversationId(
      t,
      userId,
      existing.id
    );
    const members =
      await ConversationMemberRepository.findMembersByConversation(
        t,
        existing.id
      );
    if (!hydrated) {
      return null;
    }

    return {
      ...hydrated,
      members
    };
  });
}

export async function createDirectConversation(
  userId: number,
  targetUserId: number
): Promise<ConversationRecord & { members: ConversationMemberRecord[] }> {
  if (userId === targetUserId) {
    throw new BusinessError("Cannot start a direct conversation with yourself");
  }

  const targetUser = await UserRepository.findById(targetUserId);
  if (!targetUser) {
    throw new BusinessError("User not found");
  }

  if (
    (await BlockService.hasBlocked(userId, targetUserId)) ||
    (await BlockService.hasBlocked(targetUserId, userId))
  ) {
    throw new BusinessError("由于拉黑设置，无法发起单聊");
  }

  try {
    return await pg.tx(async (t: DbTx) => {
      const existing =
        await DirectConversationRepository.findDirectConversationBetweenUsers(
          t,
          userId,
          targetUserId
        );
      if (existing) {
        const hydrated =
          await ConversationCoreRepository.findByUserConversationId(
            t,
            userId,
            existing.id
          );
        const members =
          await ConversationMemberRepository.findMembersByConversation(
            t,
            existing.id
          );
        if (!hydrated) {
          throw new BusinessError("Conversation not found");
        }
        return {
          ...hydrated,
          members
        };
      }

      const conversation =
        await DirectConversationRepository.insertDirectConversation(t);
      await DirectConversationRepository.insertDirectMembers(
        t,
        conversation.id,
        userId,
        targetUserId
      );
      const pair =
        await DirectConversationRepository.insertDirectConversationPair(
          t,
          conversation.id,
          userId,
          targetUserId
        );
      if (!pair) {
        throw new DirectConversationPairConflictError();
      }
      await DirectConversationRepository.insertDirectConversationUserStates(
        t,
        userId,
        targetUserId,
        conversation.id
      );
      const members =
        await ConversationMemberRepository.findMembersByConversation(
          t,
          conversation.id
        );
      const hydrated =
        await ConversationCoreRepository.findByUserConversationId(
          t,
          userId,
          conversation.id
        );
      if (!hydrated) {
        throw new BusinessError("Conversation create failed");
      }

      await OutboxRepository.insertEvents(
        t,
        [userId, targetUserId].map(memberUserId => ({
          event_type: "conversation.sync",
          conversation_id: conversation.id,
          target_user_id: memberUserId,
          payload: {
            messageClassify: "conversation_sync" as const,
            action: "upsert" as const,
            conversation_id: conversation.id
          } satisfies ConversationSyncMessage
        }))
      );

      return {
        ...hydrated,
        members
      };
    });
  } catch (error) {
    if (error instanceof DirectConversationPairConflictError) {
      const existing = await loadDirectConversation(userId, targetUserId);
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}
