import { generateId } from "../../utils/id_generator";
import pg from "../../db/pg";
import type { ConversationMemberRecord, ConversationRecord } from "../models";
import type { DbTx } from "./conversation_core_repository";
import ConversationReadStateRepository from "./conversation_read_state_repository";

function normalizeDirectPair(userId: number, peerId: number) {
  return {
    userLowId: Math.min(userId, peerId),
    userHighId: Math.max(userId, peerId)
  };
}

class DirectConversationRepository {
  async findDirectConversationBetweenUsers(
    t: DbTx | typeof pg,
    userId: number,
    peerId: number
  ) {
    const pair = normalizeDirectPair(userId, peerId);
    return t.oneOrNone<ConversationRecord>(
      `
      WITH paired_conversation AS (
        SELECT c.*
        FROM direct_conversation_pairs p
        JOIN conversations c ON c.id = p.conversation_id
        WHERE p.user_low_id = $3
          AND p.user_high_id = $4
          AND c.type = 1
          AND c.is_deleted = FALSE
        LIMIT 1
      ),
      legacy_conversation AS (
        SELECT c.*
        FROM conversations c
        JOIN conversation_members left_member
          ON left_member.conversation_id = c.id
         AND left_member.user_id = $1
         AND left_member.left_at IS NULL
        JOIN conversation_members right_member
          ON right_member.conversation_id = c.id
         AND right_member.user_id = $2
         AND right_member.left_at IS NULL
        WHERE c.type = 1
          AND c.is_deleted = FALSE
          AND NOT EXISTS (SELECT 1 FROM paired_conversation)
        ORDER BY c.updated_at DESC
        LIMIT 1
      )
      SELECT *
      FROM paired_conversation
      UNION ALL
      SELECT *
      FROM legacy_conversation
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [userId, peerId, pair.userLowId, pair.userHighId]
    );
  }

  async insertDirectConversationPair(
    t: DbTx,
    conversationId: string,
    userId: number,
    peerId: number
  ) {
    const pair = normalizeDirectPair(userId, peerId);
    return t.oneOrNone<{ conversation_id: string }>(
      `
      INSERT INTO direct_conversation_pairs (
        user_low_id,
        user_high_id,
        conversation_id,
        created_at
      )
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_low_id, user_high_id) DO NOTHING
      RETURNING conversation_id
      `,
      [pair.userLowId, pair.userHighId, conversationId]
    );
  }

  async insertDirectConversation(t: DbTx) {
    return t.one<ConversationRecord>(
      `INSERT INTO conversations (id, type, name, is_deleted, status, message_seq, created_at, updated_at)
       VALUES ($1, 1, '', FALSE, 0, 0, NOW(), NOW())
       RETURNING *`,
      [generateId()]
    );
  }

  async insertDirectMembers(
    t: DbTx,
    conversationId: string,
    userId: number,
    contactId: number,
    userNickname?: string,
    contactNickname?: string
  ) {
    return t.any<ConversationMemberRecord>(
      `INSERT INTO conversation_members (conversation_id, user_id, role, nickname, joined_at)
       VALUES ($1, $2, 0, $4, NOW()), ($1, $3, 0, $5, NOW())
       RETURNING *`,
      [conversationId, userId, contactId, userNickname, contactNickname]
    );
  }

  async insertDirectConversationUserStates(
    t: DbTx,
    userId: number,
    contactId: number,
    conversationId: string
  ) {
    await ConversationReadStateRepository.upsertConversationUserStates(t, [
      {
        conversation_id: conversationId,
        user_id: userId,
        is_pinned: false,
        is_muted: false,
        is_archived: false,
        draft: null,
        hidden_before_seq: 0,
        last_read_seq: 0,
        last_delivered_seq: 0,
        unread_count: 0,
        peer_id: contactId,
        settings: null
      },
      {
        conversation_id: conversationId,
        user_id: contactId,
        is_pinned: false,
        is_muted: false,
        is_archived: false,
        draft: null,
        hidden_before_seq: 0,
        last_read_seq: 0,
        last_delivered_seq: 0,
        unread_count: 0,
        peer_id: userId,
        settings: null
      }
    ]);
  }

  async archiveDirectConversations(t: DbTx, userId: number, contactId: number) {
    await t.none(
      `UPDATE conversations
       SET is_deleted = TRUE, updated_at = NOW()
       WHERE type = 1 AND id IN (
         SELECT conversation_id FROM conversation_members
         WHERE user_id = $1 OR user_id = $2
         GROUP BY conversation_id
         HAVING COUNT(DISTINCT user_id) = 2
       )`,
      [userId, contactId]
    );
  }
}

export default new DirectConversationRepository();
