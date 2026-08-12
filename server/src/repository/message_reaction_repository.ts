import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type { MessageReactionRecord } from "./models";

const REACTION_COLUMNS = `
  message_id,
  conversation_id::text AS conversation_id,
  user_id,
  emoji,
  sequence,
  is_deleted,
  created_at,
  updated_at
`;

class MessageReactionRepository {
  /**
   * Locate a reaction row regardless of tombstone state (so we can revive
   * a previously-deleted row instead of inserting a duplicate). Caller is
   * responsible for filtering out tombstones when only "active" rows matter.
   */
  async findByMessageAndUser(
    t: DbTx | typeof pg,
    messageId: string,
    userId: number
  ) {
    return t.oneOrNone<MessageReactionRecord>(
      `SELECT ${REACTION_COLUMNS}
       FROM message_reactions
       WHERE message_id = $1 AND user_id = $2`,
      [messageId, userId]
    );
  }

  /**
   * Reserve the next per-conversation reaction sequence inside the current
   * transaction. Uses `UPDATE ... RETURNING` so concurrent callers serialize
   * on the conversations row update. Returns a strictly monotonic value.
   */
  async nextReactionSequence(t: DbTx, conversationId: string): Promise<number> {
    const row = await t.one<{ last_reaction_sequence: string | number }>(
      `UPDATE conversations
       SET last_reaction_sequence = COALESCE(last_reaction_sequence, 0) + 1
       WHERE id = $1
       RETURNING last_reaction_sequence`,
      [conversationId]
    );
    return Number(row.last_reaction_sequence);
  }

  /**
   * Apply (insert or update) an active reaction for `(message_id, user_id)`.
   * Always assigns a fresh sequence and clears the tombstone flag so the
   * change can propagate via delta sync.
   */
  async applyReaction(
    t: DbTx,
    params: {
      message_id: string;
      conversation_id: string;
      user_id: number;
      emoji: string;
    }
  ): Promise<MessageReactionRecord> {
    const sequence = await this.nextReactionSequence(t, params.conversation_id);
    return t.one<MessageReactionRecord>(
      `INSERT INTO message_reactions (
         message_id,
         conversation_id,
         user_id,
         emoji,
         sequence,
         is_deleted,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, FALSE, NOW(), NOW())
       ON CONFLICT (message_id, user_id) DO UPDATE
       SET emoji = EXCLUDED.emoji,
           sequence = EXCLUDED.sequence,
           is_deleted = FALSE,
           updated_at = NOW()
       RETURNING ${REACTION_COLUMNS}`,
      [
        params.message_id,
        params.conversation_id,
        params.user_id,
        params.emoji,
        sequence
      ]
    );
  }

  /**
   * Mark an existing reaction as deleted (tombstone) so the removal can be
   * propagated through delta sync. We deliberately keep the row around so
   * future delta scans observe the deletion event. Returns the updated row,
   * or null when no matching row exists.
   */
  async removeReaction(
    t: DbTx,
    conversationId: string,
    messageId: string,
    userId: number
  ): Promise<MessageReactionRecord | null> {
    const existing = await this.findByMessageAndUser(t, messageId, userId);
    if (!existing) {
      return null;
    }
    const sequence = await this.nextReactionSequence(t, conversationId);
    return t.one<MessageReactionRecord>(
      `UPDATE message_reactions
       SET is_deleted = TRUE,
           sequence = $4,
           updated_at = NOW()
       WHERE message_id = $1 AND user_id = $2 AND conversation_id = $3
       RETURNING ${REACTION_COLUMNS}`,
      [messageId, userId, conversationId, sequence]
    );
  }

  /**
   * Snapshot lookup used by legacy paths (initial conversation load, message
   * batch endpoints). Returns only ACTIVE reactions; tombstones are filtered.
   * The new code path should rely on `listDeltasForConversation` instead.
   */
  async findActiveByMessageIds(messageIds: string[]) {
    if (messageIds.length === 0) {
      return [] as MessageReactionRecord[];
    }
    return pg.manyOrNone<MessageReactionRecord>(
      `SELECT ${REACTION_COLUMNS}
       FROM message_reactions
       WHERE is_deleted = FALSE
         AND message_id IN ($1:csv)
       ORDER BY message_id, updated_at ASC`,
      [messageIds]
    );
  }

  /**
   * Page through reaction events for a conversation strictly after the given
   * sequence. Returns both active rows and tombstones so clients can apply
   * the deltas idempotently in order. Capped by `limit` (caller-validated).
   */
  async listDeltasForConversation(
    conversationId: string,
    afterSequence: number,
    limit: number
  ) {
    return pg.manyOrNone<MessageReactionRecord>(
      `SELECT ${REACTION_COLUMNS}
       FROM message_reactions
       WHERE conversation_id = $1
         AND sequence > $2
       ORDER BY sequence ASC
       LIMIT $3`,
      [conversationId, afterSequence, limit]
    );
  }

  /** Returns the highest sequence ever assigned in the conversation, or 0. */
  async getMaxSequenceForConversation(conversationId: string): Promise<number> {
    const row = await pg.oneOrNone<{ last_reaction_sequence: string | number }>(
      `SELECT COALESCE(last_reaction_sequence, 0) AS last_reaction_sequence
       FROM conversations
       WHERE id = $1`,
      [conversationId]
    );
    return row ? Number(row.last_reaction_sequence) : 0;
  }
}

export default new MessageReactionRepository();
