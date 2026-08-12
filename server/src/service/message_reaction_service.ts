import {
  ALLOWED_REACTION_EMOJIS,
  REACTION_EMOJI_MAX_LENGTH,
  type MessageReaction,
  type MessageReactionAction,
  type SetMessageReactionResponse
} from "@mushroom/shared";
import pg from "../db/pg";
import { BusinessError } from "../handler/business_error";
import ConversationService from "./conversation/conversation_query_service";
import ConversationMemberRepository from "../repository/conversation/conversation_member_repository";
import type { DbTx } from "../repository/conversation/conversation_core_repository";
import MessageRepository from "../repository/message_repository";
import MessageReactionRepository from "../repository/message_reaction_repository";
import OutboxRepository from "../repository/outbox_repository";

const MAX_DELTA_LIMIT = 1000;
const DEFAULT_DELTA_LIMIT = 500;
const MAX_LIST_MESSAGE_IDS = 200;

const ALLOWED_EMOJI_SET: ReadonlySet<string> = new Set(ALLOWED_REACTION_EMOJIS);

function validateEmoji(emoji: string): string {
  const trimmed = emoji.trim();
  if (!trimmed) {
    throw new BusinessError("emoji cannot be empty");
  }
  if (trimmed.length > REACTION_EMOJI_MAX_LENGTH) {
    throw new BusinessError("emoji is too long");
  }
  if (!ALLOWED_EMOJI_SET.has(trimmed)) {
    throw new BusinessError("emoji is not allowed");
  }
  return trimmed;
}

class MessageReactionService {
  /**
   * Apply or remove a reaction. Behaviour matrix:
   *   - emoji=null               -> always treated as a remove. Allowed even
   *                                  on recalled / system messages so a stale
   *                                  reaction can be cleaned up.
   *   - emoji=existing.emoji     -> toggle removal (also allowed on
   *                                  recalled / system messages for cleanup).
   *   - emoji=different / no row -> add or replace. Rejected when the message
   *                                  is recalled or is a system message.
   * In every case we assign a fresh per-conversation sequence and enqueue a
   * persisted outbox event per active member so delta sync stays consistent.
   */
  async setReaction(
    userId: number,
    conversationId: string,
    messageId: string,
    rawEmoji: string | null
  ): Promise<SetMessageReactionResponse> {
    const emoji = rawEmoji === null ? null : validateEmoji(rawEmoji);

    return pg.tx(async (t: DbTx) => {
      const member = await ConversationMemberRepository.findMember(
        t,
        conversationId,
        userId
      );
      if (!member) {
        throw new BusinessError("Conversation member not found");
      }

      const message = await MessageRepository.findMessageById(
        messageId,
        undefined,
        t
      );
      if (!message || String(message.conversation_id) !== conversationId) {
        throw new BusinessError("Message not found");
      }

      const existing = await MessageReactionRepository.findByMessageAndUser(
        t,
        messageId,
        userId
      );

      // Removal request: emoji=null OR same-emoji toggle. Allowed unconditionally
      // (so a user can clean up reactions on recalled messages).
      const isRemoval =
        emoji === null ||
        (existing && !existing.is_deleted && existing.emoji === emoji);

      if (!isRemoval) {
        // Add / change requires the message to be reactable.
        if (message.is_recalled) {
          throw new BusinessError("Cannot react to a recalled message");
        }
        if (Number(message.type) === 0) {
          throw new BusinessError("Cannot react to a system message");
        }
      }

      let action: MessageReactionAction;
      let resultEmoji: string | null;
      let sequence: number;
      let updatedAt: Date;
      let isDeleted: 0 | 1;

      if (isRemoval) {
        if (!existing || existing.is_deleted) {
          // Nothing to remove. Synthesize a no-op response without touching
          // the DB so the client can converge optimistic state if needed.
          // sequence=0 signals "no event was assigned".
          return {
            message_id: messageId,
            conversation_id: conversationId,
            user_id: userId,
            emoji: null,
            action: "removed" as MessageReactionAction,
            sequence: 0,
            updated_at: new Date().toISOString()
          };
        }
        const removed = await MessageReactionRepository.removeReaction(
          t,
          conversationId,
          messageId,
          userId
        );
        if (!removed) {
          throw new BusinessError("Failed to remove reaction");
        }
        action = "removed";
        resultEmoji = null;
        sequence = Number(removed.sequence);
        updatedAt = removed.updated_at;
        isDeleted = 1;
      } else {
        // emoji is non-null here (otherwise isRemoval would be true).
        const upserted = await MessageReactionRepository.applyReaction(t, {
          message_id: messageId,
          conversation_id: conversationId,
          user_id: userId,
          emoji: emoji as string
        });
        action =
          existing && !existing.is_deleted && existing.emoji !== emoji
            ? "updated"
            : "added";
        resultEmoji = upserted.emoji;
        sequence = Number(upserted.sequence);
        updatedAt = upserted.updated_at;
        isDeleted = 0;
      }

      const members = await ConversationService.getConversationMembers(
        conversationId,
        t
      );

      const wsPayload = {
        messageClassify: "message_reaction" as const,
        server_message_id: messageId,
        server_conversation_id: conversationId,
        user_id: userId,
        emoji: resultEmoji,
        action,
        sequence,
        is_deleted: isDeleted,
        updated_at: updatedAt.toISOString()
      };

      // Persist one outbox row per member so delivery survives broker restarts
      // and follows the same retry policy as message.recall.
      await OutboxRepository.insertEvents(
        t,
        members.map(m => ({
          event_type: "message.reaction",
          message_id: messageId,
          conversation_id: conversationId,
          target_user_id: m.user_id,
          payload: wsPayload
        }))
      );

      return {
        message_id: messageId,
        conversation_id: conversationId,
        user_id: userId,
        emoji: resultEmoji,
        action,
        sequence,
        updated_at: updatedAt.toISOString()
      };
    });
  }

  async listReactionsByMessageIds(
    userId: number,
    messageIds: string[]
  ): Promise<MessageReaction[]> {
    if (messageIds.length === 0) {
      return [];
    }
    if (messageIds.length > MAX_LIST_MESSAGE_IDS) {
      throw new BusinessError(
        `messageIds cannot exceed ${MAX_LIST_MESSAGE_IDS} entries`
      );
    }
    const records =
      await MessageReactionRepository.findActiveByMessageIds(messageIds);

    if (records.length === 0) {
      return [];
    }

    // authorize: filter only reactions on messages the user can see
    const conversationIds = Array.from(
      new Set(records.map(r => String(r.conversation_id)))
    );
    const memberRows = await pg.manyOrNone<{ conversation_id: string }>(
      `SELECT conversation_id::text AS conversation_id
       FROM conversation_members
       WHERE user_id = $1
         AND left_at IS NULL
         AND conversation_id IN ($2:csv)`,
      [userId, conversationIds]
    );
    const allowedConvs = new Set(memberRows.map(r => r.conversation_id));

    return records
      .filter(r => allowedConvs.has(String(r.conversation_id)))
      .map(r => ({
        message_id: r.message_id,
        conversation_id: String(r.conversation_id),
        user_id: r.user_id,
        emoji: r.emoji,
        sequence: Number(r.sequence),
        updated_at: r.updated_at.toISOString()
      }));
  }

  /**
   * List reaction events for a conversation strictly after `afterSequence`.
   * Includes tombstones so removals can propagate. Authorizes by checking
   * the caller is an active member of the conversation.
   */
  async listReactionDeltas(
    userId: number,
    conversationId: string,
    afterSequence: number,
    rawLimit: number | undefined
  ): Promise<{
    conversation_id: string;
    reactions: MessageReaction[];
    has_more: boolean;
    next_after_sequence: number;
    max_sequence: number;
  }> {
    const limit = Math.min(
      Math.max(1, Math.floor(rawLimit ?? DEFAULT_DELTA_LIMIT)),
      MAX_DELTA_LIMIT
    );
    const after = Math.max(0, Math.floor(afterSequence));

    const member = await pg.oneOrNone<{ user_id: number }>(
      `SELECT user_id
       FROM conversation_members
       WHERE conversation_id = $1
         AND user_id = $2
         AND left_at IS NULL`,
      [conversationId, userId]
    );
    if (!member) {
      throw new BusinessError("Conversation member not found", 403);
    }

    // Pull one extra row to detect has_more without an additional COUNT(*).
    const records = await MessageReactionRepository.listDeltasForConversation(
      conversationId,
      after,
      limit + 1
    );
    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const maxSequence =
      await MessageReactionRepository.getMaxSequenceForConversation(
        conversationId
      );
    const nextAfter =
      page.length > 0 ? Number(page[page.length - 1].sequence) : after;

    return {
      conversation_id: conversationId,
      reactions: page.map(r => ({
        message_id: r.message_id,
        conversation_id: String(r.conversation_id),
        user_id: r.user_id,
        emoji: r.emoji,
        sequence: Number(r.sequence),
        is_deleted: r.is_deleted ? 1 : 0,
        updated_at: r.updated_at.toISOString()
      })),
      has_more: hasMore,
      next_after_sequence: nextAfter,
      max_sequence: maxSequence
    };
  }
}

export default new MessageReactionService();
