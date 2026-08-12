import { generateId } from "../../utils/id_generator";
import type { SyncCursorToken } from "@mushroom/shared";
import pg from "../../db/pg";
import type { ITask } from "pg-promise";
import type {
  ConversationRecord,
  ConversationUserStateRecord,
  MessageRecord
} from "../models";

export type DbTx = ITask<unknown>;

export type InsertConversationInput = {
  type: number;
  name: string;
  avatar_url?: string;
  owner_id?: number;
  description?: string;
};

type ConversationSyncTarget = {
  conversation_id: string;
  user_id: number;
};

class ConversationCoreRepository {
  async findById(conversationId: string, t: DbTx | typeof pg = pg) {
    return t.oneOrNone<ConversationRecord>(
      `SELECT id, type, owner_id, name, avatar_url, description, settings,
              status, is_deleted, message_seq, last_message_id, last_message_at,
              last_reaction_sequence, created_at, updated_at
         FROM conversations
        WHERE id = $1 AND is_deleted = FALSE`,
      [conversationId]
    );
  }

  async findByUser(
    userId: number,
    pageSize: number,
    syncCursor?: SyncCursorToken | null
  ) {
    const sql = `
      WITH scoped_conversations AS (
        SELECT
          c.id,
          c.type,
          c.name,
          c.owner_id,
          c.avatar_url,
          c.description,
          c.settings,
          c.status,
          c.is_deleted,
          c.message_seq,
          c.last_reaction_sequence,
          c.created_at,
          GREATEST(
            c.updated_at,
            s.updated_at,
            COALESCE(peer_state.updated_at, c.updated_at)
          ) AS updated_at,
          s.peer_id,
          peer_user.username AS peer_username,
          peer_user.nickname AS peer_nickname,
          COALESCE(m.content, '{}'::jsonb) AS last_message_content,
          COALESCE(c.last_message_at, c.updated_at, c.created_at) AS last_message_time,
          COALESCE(m.sender_id, 0) AS last_message_send_id,
          s.unread_count,
          s.last_read_seq AS last_read_sequence,
          s.last_delivered_seq AS last_sync_sequence,
          CASE
            WHEN c.type = 1
              AND COALESCE(caller_priv.read_receipts_visibility, 0) <> 2
              AND COALESCE(peer_priv.read_receipts_visibility, 0) <> 2
            THEN peer_state.last_read_seq
            ELSE NULL
          END AS peer_last_read_sequence,
          s.is_pinned,
          s.is_muted,
          s.is_archived,
          s.draft
        FROM conversations c
        JOIN conversation_members cm
          ON cm.conversation_id = c.id
         AND cm.user_id = $1
         AND cm.left_at IS NULL
        JOIN conversation_user_state s
          ON c.id = s.conversation_id
         AND s.user_id = $1
        LEFT JOIN messages m ON c.last_message_id = m.id
        LEFT JOIN LATERAL (
          SELECT other_state.last_read_seq, other_state.updated_at
          FROM conversation_user_state other_state
          WHERE other_state.conversation_id = c.id
            AND other_state.user_id <> $1
          ORDER BY other_state.user_id ASC
          LIMIT 1
        ) peer_state ON c.type = 1
        LEFT JOIN users peer_user
          ON c.type = 1
         AND peer_user.id = s.peer_id
         AND peer_user.is_deleted = FALSE
        LEFT JOIN user_privacy_settings caller_priv
          ON caller_priv.user_id = $1
        LEFT JOIN user_privacy_settings peer_priv
          ON c.type = 1
         AND peer_priv.user_id = s.peer_id
        WHERE c.is_deleted = FALSE
          AND (
            COALESCE(s.hidden_before_seq, 0) = 0
            OR COALESCE(c.message_seq, 0) > COALESCE(s.hidden_before_seq, 0)
          )
      )
      SELECT *
      FROM scoped_conversations
      WHERE 1 = 1
        ${
          syncCursor
            ? `AND (
              updated_at > $3
              OR (updated_at = $3 AND id::bigint > $4::bigint)
            )`
            : ""
        }
      ORDER BY updated_at ASC, id::bigint ASC
      LIMIT $2
    `;

    return pg.manyOrNone<ConversationRecord>(
      sql,
      syncCursor
        ? [
            userId,
            pageSize,
            new Date(syncCursor.updated_at),
            syncCursor.entity_id
          ]
        : [userId, pageSize]
    );
  }

  async findByUserConversationId(
    t: DbTx,
    userId: number,
    conversationId: string
  ) {
    return t.oneOrNone<ConversationRecord>(
      `
      SELECT
        c.id,
        c.type,
        c.name,
        c.owner_id,
        c.avatar_url,
        c.description,
        c.settings,
        c.status,
        c.is_deleted,
        c.last_reaction_sequence,
        c.created_at,
        GREATEST(
          c.updated_at,
          s.updated_at,
          COALESCE(peer_state.updated_at, c.updated_at)
        ) AS updated_at,
        s.peer_id,
        peer_user.username AS peer_username,
        peer_user.nickname AS peer_nickname,
        COALESCE(m.content, '{}'::jsonb) AS last_message_content,
        COALESCE(c.last_message_at, c.updated_at, c.created_at) AS last_message_time,
        COALESCE(m.sender_id, 0) AS last_message_send_id,
        s.unread_count,
        s.last_read_seq AS last_read_sequence,
        s.last_delivered_seq AS last_sync_sequence,
        CASE
          WHEN c.type = 1
            AND COALESCE(caller_priv.read_receipts_visibility, 0) <> 2
            AND COALESCE(peer_priv.read_receipts_visibility, 0) <> 2
          THEN peer_state.last_read_seq
          ELSE NULL
        END AS peer_last_read_sequence,
        s.is_pinned,
        s.is_muted,
        s.is_archived,
        s.draft
      FROM conversations c
      JOIN conversation_members cm
        ON cm.conversation_id = c.id
       AND cm.user_id = $1
       AND cm.left_at IS NULL
      JOIN conversation_user_state s
        ON c.id = s.conversation_id
       AND s.user_id = $1
      LEFT JOIN messages m ON c.last_message_id = m.id
      LEFT JOIN LATERAL (
        SELECT other_state.last_read_seq, other_state.updated_at
        FROM conversation_user_state other_state
        WHERE other_state.conversation_id = c.id
          AND other_state.user_id <> $1
        ORDER BY other_state.user_id ASC
        LIMIT 1
      ) peer_state ON c.type = 1
      LEFT JOIN users peer_user
        ON c.type = 1
       AND peer_user.id = s.peer_id
       AND peer_user.is_deleted = FALSE
      LEFT JOIN user_privacy_settings caller_priv
        ON caller_priv.user_id = $1
      LEFT JOIN user_privacy_settings peer_priv
        ON c.type = 1
       AND peer_priv.user_id = s.peer_id
      WHERE c.id = $2
        AND c.is_deleted = FALSE
        AND (COALESCE(s.hidden_before_seq, 0) = 0 OR COALESCE(c.message_seq, 0) > COALESCE(s.hidden_before_seq, 0))
      `,
      [userId, conversationId]
    );
  }

  async insertConversation(t: DbTx, conversation: InsertConversationInput) {
    const sql = `
      INSERT INTO conversations (
        id, type, name, avatar_url, owner_id, description, settings, status, is_deleted, message_seq, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NULL, 0, FALSE, 0, NOW(), NOW()
      )
      RETURNING *
    `;

    return t.one<ConversationRecord>(sql, [
      generateId(),
      conversation.type,
      conversation.name,
      conversation.avatar_url,
      conversation.owner_id,
      conversation.description || null
    ]);
  }

  async nextConversationSequence(t: DbTx, conversationId: string) {
    const row = await t.one<{ message_seq: string | number }>(
      `UPDATE conversations
       SET message_seq = COALESCE(message_seq, 0) + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING message_seq`,
      [conversationId]
    );

    return Number(row.message_seq);
  }

  async insertSystemMessage(
    t: DbTx,
    conversationId: string,
    content: Record<string, unknown> | string,
    sequence: number
  ) {
    return t.one<MessageRecord>(
      `INSERT INTO messages (id, conversation_id, sender_id, type, content, created_at, updated_at, seq)
       VALUES ($1, $2, 0, 0, $3::jsonb, NOW(), NOW(), $4)
       RETURNING id, conversation_id, sender_id, type, content, created_at, updated_at, seq AS sequence`,
      [
        generateId(),
        conversationId,
        typeof content === "string" ? content : JSON.stringify(content),
        sequence
      ]
    );
  }

  async updateConversationPointers(
    t: DbTx,
    params: {
      conversationId: string;
      lastMessageId: string | number;
      lastMessageAt?: Date | string | null;
    }
  ) {
    await t.none(
      `UPDATE conversations
       SET last_message_id = $2,
           last_message_at = COALESCE($3, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [
        params.conversationId,
        String(params.lastMessageId),
        params.lastMessageAt ?? null
      ]
    );
  }

  async touchConversation(t: DbTx, conversationId: string) {
    await t.none(
      `
      UPDATE conversations
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [conversationId]
    );
  }

  async findActiveConversationIdsByUser(t: DbTx, userId: number) {
    return t.manyOrNone<{ conversation_id: string }>(
      `
      SELECT DISTINCT conversation_id
      FROM conversation_members
      WHERE user_id = $1
        AND left_at IS NULL
      ORDER BY conversation_id ASC
      `,
      [userId]
    );
  }

  async touchConversations(t: DbTx, conversationIds: string[]) {
    if (conversationIds.length === 0) {
      return;
    }

    await t.none(
      `
      UPDATE conversations
      SET updated_at = NOW()
      WHERE id = ANY($1::bigint[])
      `,
      [conversationIds]
    );
  }

  async findConversationSyncTargets(
    t: DbTx,
    conversationIds: string[]
  ): Promise<ConversationSyncTarget[]> {
    if (conversationIds.length === 0) {
      return [];
    }

    return t.manyOrNone<ConversationSyncTarget>(
      `
      SELECT DISTINCT conversation_id, user_id
      FROM conversation_members
      WHERE conversation_id = ANY($1::bigint[])
        AND left_at IS NULL
      ORDER BY conversation_id ASC, user_id ASC
      `,
      [conversationIds]
    );
  }

  async updateConversationOwner(
    t: DbTx,
    conversationId: string,
    ownerId: number
  ) {
    return t.oneOrNone<ConversationRecord>(
      `
      UPDATE conversations
      SET owner_id = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [conversationId, ownerId]
    );
  }

  async updateConversationProfile(
    t: DbTx,
    params: {
      conversationId: string;
      name: string;
      description?: string | null;
      avatarUrl?: string | null;
    }
  ) {
    return t.oneOrNone<ConversationRecord>(
      `
      UPDATE conversations
      SET name = $2,
          description = $3,
          avatar_url = $4,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        params.conversationId,
        params.name,
        params.description ?? null,
        params.avatarUrl ?? null
      ]
    );
  }

  /**
   * Apply a field-level patch to conversations.settings JSONB.
   *
   * Uses the jsonb `||` operator to merge `params.settings` into the existing
   * settings object instead of overwriting it. This avoids the read-modify-
   * write race that previously allowed concurrent updates (e.g. settings vs.
   * announcement) to silently overwrite each other's fields.
   *
   * NOTE: this does NOT support deleting keys via `undefined`/`null`; callers
   * that need to clear a field must pass an explicit empty value (e.g. "").
   */
  async updateConversationSettings(
    t: DbTx,
    params: {
      conversationId: string;
      settings: object;
    }
  ) {
    return t.oneOrNone<ConversationRecord>(
      `
      UPDATE conversations
      SET settings = COALESCE(settings, '{}'::jsonb) || $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [params.conversationId, JSON.stringify(params.settings)]
    );
  }

  async updateConversationUserState(
    t: DbTx,
    params: {
      conversationId: string;
      userId: number;
      isPinned?: boolean;
      isMuted?: boolean;
      isArchived?: boolean;
      draftProvided?: boolean;
      draft?: string | null;
    }
  ) {
    return t.oneOrNone<ConversationUserStateRecord>(
      `
      UPDATE conversation_user_state
      SET
        is_pinned = COALESCE($3, is_pinned),
        is_muted = COALESCE($4, is_muted),
        is_archived = COALESCE($5, is_archived),
        draft = CASE WHEN $6 THEN $7 ELSE draft END,
        updated_at = NOW()
      WHERE conversation_id = $1
        AND user_id = $2
      RETURNING *
      `,
      [
        params.conversationId,
        params.userId,
        params.isPinned,
        params.isMuted,
        params.isArchived,
        params.draftProvided === true,
        params.draft ?? null
      ]
    );
  }

  async hideConversationForUser(
    t: DbTx,
    conversationId: string,
    userId: number,
    hiddenBeforeSeq: number
  ) {
    return t.result(
      `
      UPDATE conversation_user_state
      SET hidden_before_seq = GREATEST(COALESCE(hidden_before_seq, 0), $3),
          unread_count = 0,
          draft = NULL,
          updated_at = NOW()
      WHERE conversation_id = $1
        AND user_id = $2
      `,
      [conversationId, userId, hiddenBeforeSeq]
    );
  }

  async disbandConversation(t: DbTx, conversationId: string) {
    return t.result(
      `
      UPDATE conversations
      SET is_deleted = TRUE,
          updated_at = NOW()
      WHERE id = $1
        AND is_deleted = FALSE
      `,
      [conversationId]
    );
  }
}

export default new ConversationCoreRepository();
