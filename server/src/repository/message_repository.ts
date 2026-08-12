import type { MessageSyncCursor, SyncCursorToken } from "@mushroom/shared";
import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type { MessageRecord, MessageReactionRecord } from "./models";

/**
 * P2-A：在 list / around / delta 三类查询里通过 LATERAL JOIN 一次性把 active reactions
 * 聚合为 JSONB 数组，省掉原先 `MessageReactionRepository.findActiveByMessageIds` 这次
 * 额外 SQL 与一轮 round-trip。 - 字段顺序与 `MessageReactionRecord` 对齐，便于 toRemoteMessage
 * 直接复用既有形状。
 */
const REACTIONS_JSON_SUBQUERY = `
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'message_id', r.message_id::text,
        'conversation_id', r.conversation_id::text,
        'user_id', r.user_id,
        'emoji', r.emoji,
        'sequence', r.sequence,
        'is_deleted', r.is_deleted,
        'created_at', r.created_at,
        'updated_at', r.updated_at
      )
      ORDER BY r.updated_at ASC
    )
    FROM message_reactions r
    WHERE r.message_id = m.id
      AND r.is_deleted = FALSE
  ), '[]'::jsonb) AS reactions
`;

export type MessageSyncRecord = MessageRecord & {
  client_conversation_id: string;
  sender_nickname?: string;
  sender_avatar?: string;
  /**
   * Reactions aggregated via the main query (P2-A). May be undefined for
   * code paths that don't request them, in which case the caller falls back
   * to the per-batch `loadReactionsByMessageIds` path.
   */
  reactions?: MessageReactionRecord[];
};

export type UpsertMessageResult = MessageRecord & {
  inserted: boolean;
  // P2-Task3: 与 findMessageById 的 sender 字段对齐，便于 insertMessage 一次返回 nickname/avatar
  sender_nickname?: string;
  sender_avatar?: string;
};

export type RecalledMessageRecord = MessageRecord & {
  recalled_at?: Date;
};

class MessageRepository {
  async findMessageBySenderClientId(
    senderId: number,
    clientMessageId: string,
    t: DbTx | typeof pg = pg
  ) {
    return t.oneOrNone<
      MessageRecord & {
        sender_nickname?: string;
        sender_avatar?: string;
      }
    >(
      `
      SELECT
        m.id,
        m.client_message_id,
        m.reply_to_message_id,
        m.conversation_id,
        m.sender_id,
        m.type,
        m.content,
        m.created_at,
        m.updated_at,
        m.is_recalled,
        m.seq AS sequence,
        u.nickname AS sender_nickname,
        u.avatar_url AS sender_avatar
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.sender_id = $1
        AND m.client_message_id = $2
      `,
      [senderId, clientMessageId]
    );
  }

  async findMessages(
    convs: MessageSyncCursor[],
    userId: number,
    perConversationLimit = 200
  ) {
    // P2-Task5: 用 unnest(bigint[], bigint[], text[]) 替代 N 行 VALUES。
    // - 参数个数固定为 5（3 个数组 + userId + limit），SQL 文本不再随 convs.length
    //   线性膨胀，prepared statement / plan cache 命中率更稳定。
    // - 与原 SQL 语义等价：unnest 多列同步展开成 conv_params 的行集。
    const conversationIds = convs.map(c => c.conversation_id);
    const lastSequences = convs.map(c => c.last_sequence);
    const clientConversationIds = convs.map(c => c.client_conversation_id);

    const sql = `
      WITH conv_params(conversation_id, last_sequence, client_conversation_id) AS (
        SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::text[])
      ),
      ranked AS (
        SELECT
          m.id,
          m.client_message_id,
          m.conversation_id,
          m.reply_to_message_id,
          m.sender_id,
          m.type,
          m.content,
          m.created_at,
          m.updated_at,
          m.seq AS sequence,
          m.is_recalled,
          COALESCE(mus.is_favorited, FALSE) AS is_favorited,
          COALESCE(mus.is_pinned, FALSE) AS is_pinned,
          cp.client_conversation_id,
          rm.sender_id AS reply_to_sender_id,
          rm.content AS reply_to_content,
          ru.nickname AS reply_to_sender_nickname,
          u.nickname AS sender_nickname,
          u.avatar_url AS sender_avatar,
          ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.seq ASC) AS rn
        FROM messages m
        JOIN conv_params cp ON cp.conversation_id = m.conversation_id
        JOIN conversation_members cm
          ON cm.conversation_id = m.conversation_id
         AND cm.user_id = $4
        JOIN conversation_user_state cus
          ON cus.conversation_id = m.conversation_id
         AND cus.user_id = $4
        LEFT JOIN message_user_state mus
          ON mus.message_id = m.id
         AND mus.user_id = $4
        LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
        LEFT JOIN users ru ON ru.id = rm.sender_id
        LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.seq > cp.last_sequence
          AND m.seq >= COALESCE(cm.join_seq, 0)
          AND m.seq > COALESCE(cus.hidden_before_seq, 0)
          AND cm.left_at IS NULL
      )
      SELECT id, client_message_id, conversation_id, reply_to_message_id,
             sender_id, type, content, created_at, updated_at, sequence,
             is_recalled, is_favorited, is_pinned, client_conversation_id,
             reply_to_sender_id, reply_to_content, reply_to_sender_nickname,
             sender_nickname, sender_avatar
      FROM ranked
      WHERE rn <= $5
      ORDER BY conversation_id, sequence ASC
    `;

    return pg.manyOrNone<MessageSyncRecord>(sql, [
      conversationIds,
      lastSequences,
      clientConversationIds,
      userId,
      perConversationLimit
    ]);
  }

  async findMessageDelta(params: {
    conversationId: string;
    clientConversationId: string;
    userId: number;
    afterSequence: number;
    limit: number;
  }) {
    return pg.manyOrNone<MessageSyncRecord>(
      `
      SELECT
        m.id,
        m.client_message_id,
        m.conversation_id,
        m.reply_to_message_id,
        m.sender_id,
        m.type,
        m.content,
        m.created_at,
        m.updated_at,
        m.seq AS sequence,
        m.is_recalled,
        COALESCE(mus.is_favorited, FALSE) AS is_favorited,
        COALESCE(mus.is_pinned, FALSE) AS is_pinned,
        $2::text AS client_conversation_id,
        rm.sender_id AS reply_to_sender_id,
        rm.content AS reply_to_content,
        ru.nickname AS reply_to_sender_nickname,
        u.nickname AS sender_nickname,
        u.avatar_url AS sender_avatar,
        ${REACTIONS_JSON_SUBQUERY}
      FROM messages m
      JOIN conversation_members cm
        ON cm.conversation_id = m.conversation_id
       AND cm.user_id = $3
       AND cm.left_at IS NULL
      JOIN conversation_user_state cus
        ON cus.conversation_id = m.conversation_id
       AND cus.user_id = $3
      LEFT JOIN message_user_state mus
        ON mus.message_id = m.id
       AND mus.user_id = $3
      LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
      LEFT JOIN users ru ON ru.id = rm.sender_id
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1::bigint
        AND m.seq > $4
        AND m.seq >= COALESCE(cm.join_seq, 0)
        AND m.seq > COALESCE(cus.hidden_before_seq, 0)
      ORDER BY m.seq ASC
      LIMIT $5
      `,
      [
        params.conversationId,
        params.clientConversationId,
        params.userId,
        params.afterSequence,
        params.limit
      ]
    );
  }

  async insertMessage(
    t: DbTx,
    params: {
      id: string | number;
      client_message_id: string;
      conversation_id: string;
      sender_id: number;
      type: number;
      content: Record<string, unknown> | string;
      sequence: number;
      reply_to_message_id?: string | null;
    }
  ) {
    const serializedContent =
      typeof params.content === "string"
        ? params.content
        : JSON.stringify(params.content);

    return t.one<UpsertMessageResult>(
      `WITH upsert AS (
         INSERT INTO messages (
           id,
           client_message_id,
           reply_to_message_id,
           conversation_id,
           sender_id,
           type,
           content,
           seq,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW(), NOW())
         ON CONFLICT (sender_id, client_message_id)
         WHERE client_message_id IS NOT NULL DO UPDATE
         SET client_message_id = EXCLUDED.client_message_id
         RETURNING id, client_message_id, reply_to_message_id, conversation_id,
                   sender_id, type, content, created_at, updated_at,
                   seq AS sequence, (xmax = 0) AS inserted
       )
       SELECT upsert.*,
              u.nickname AS sender_nickname,
              u.avatar_url AS sender_avatar
       FROM upsert
       LEFT JOIN users u ON u.id = upsert.sender_id`,
      [
        params.id,
        params.client_message_id,
        params.reply_to_message_id ?? null,
        params.conversation_id,
        params.sender_id,
        params.type,
        serializedContent,
        params.sequence
      ]
    );
  }

  async listMessagesAround(params: {
    conversationId: string;
    clientConversationId: string;
    userId: number;
    pivotSequence: number;
    limit: number;
  }) {
    const limitBefore = Math.ceil(params.limit / 2);
    const limitAfter = Math.floor(params.limit / 2);
    const queryParams: Array<string | number> = [
      params.clientConversationId,
      params.conversationId,
      params.userId,
      params.pivotSequence,
      limitBefore,
      limitAfter
    ];

    return pg.manyOrNone<MessageSyncRecord>(
      `
      WITH visible AS (
        SELECT
          m.id,
          m.client_message_id,
          m.conversation_id,
          m.reply_to_message_id,
          m.sender_id,
          m.type,
          m.content,
          m.created_at,
          m.updated_at,
          m.seq AS sequence,
          m.is_recalled,
          COALESCE(mus.is_favorited, FALSE) AS is_favorited,
          COALESCE(mus.is_pinned, FALSE) AS is_pinned,
          $1::text AS client_conversation_id,
          rm.sender_id AS reply_to_sender_id,
          rm.content AS reply_to_content,
          ru.nickname AS reply_to_sender_nickname,
          u.nickname AS sender_nickname,
          u.avatar_url AS sender_avatar,
          ${REACTIONS_JSON_SUBQUERY}
        FROM messages m
        JOIN conversation_members cm
          ON cm.conversation_id = m.conversation_id
         AND cm.user_id = $3
         AND cm.left_at IS NULL
        JOIN conversation_user_state cus
          ON cus.conversation_id = m.conversation_id
         AND cus.user_id = $3
        LEFT JOIN message_user_state mus
          ON mus.message_id = m.id
         AND mus.user_id = $3
        LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
        LEFT JOIN users ru ON ru.id = rm.sender_id
        LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = $2::bigint
          AND m.seq >= COALESCE(cm.join_seq, 0)
          AND m.seq > COALESCE(cus.hidden_before_seq, 0)
      )
      (
        SELECT * FROM visible
        WHERE sequence <= $4
        ORDER BY sequence DESC
        LIMIT $5
      )
      UNION ALL
      (
        SELECT * FROM visible
        WHERE sequence > $4
        ORDER BY sequence ASC
        LIMIT $6
      )
      `,
      queryParams
    );
  }

  async listMessages(params: {
    conversationId: string;
    clientConversationId: string;
    userId: number;
    beforeSequence?: number;
    limit: number;
  }) {
    const queryParams: Array<string | number> = [
      params.clientConversationId,
      params.conversationId,
      params.userId
    ];
    let beforeCondition = "";
    if (params.beforeSequence && params.beforeSequence > 0) {
      queryParams.push(params.beforeSequence);
      beforeCondition = `AND m.seq < $4`;
    }
    queryParams.push(params.limit);

    return pg.manyOrNone<MessageSyncRecord>(
      `
      SELECT
        m.id,
        m.client_message_id,
        m.conversation_id,
        m.reply_to_message_id,
        m.sender_id,
        m.type,
        m.content,
        m.created_at,
        m.updated_at,
        m.seq AS sequence,
        m.is_recalled,
        COALESCE(mus.is_favorited, FALSE) AS is_favorited,
        COALESCE(mus.is_pinned, FALSE) AS is_pinned,
        $1::text AS client_conversation_id,
        rm.sender_id AS reply_to_sender_id,
        rm.content AS reply_to_content,
        ru.nickname AS reply_to_sender_nickname,
        u.nickname AS sender_nickname,
        u.avatar_url AS sender_avatar,
        ${REACTIONS_JSON_SUBQUERY}
      FROM messages m
      JOIN conversation_members cm
        ON cm.conversation_id = m.conversation_id
       AND cm.user_id = $3
       AND cm.left_at IS NULL
      JOIN conversation_user_state cus
        ON cus.conversation_id = m.conversation_id
       AND cus.user_id = $3
      LEFT JOIN message_user_state mus
        ON mus.message_id = m.id
       AND mus.user_id = $3
      LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
      LEFT JOIN users ru ON ru.id = rm.sender_id
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $2::bigint
        AND m.seq >= COALESCE(cm.join_seq, 0)
        AND m.seq > COALESCE(cus.hidden_before_seq, 0)
        ${beforeCondition}
      ORDER BY m.seq DESC
      LIMIT $${queryParams.length}
      `,
      queryParams
    );
  }

  async findMessageById(
    messageId: string,
    userId?: number,
    t: DbTx | typeof pg = pg
  ) {
    const params: Array<string | number> = [messageId];
    const userStateJoin = userId
      ? `LEFT JOIN message_user_state mus ON mus.message_id = m.id AND mus.user_id = $2`
      : "";
    const userStateSelect = userId
      ? `, COALESCE(mus.is_favorited, FALSE) AS is_favorited,
        COALESCE(mus.is_pinned, FALSE) AS is_pinned`
      : "";
    if (userId) {
      params.push(userId);
    }

    return t.oneOrNone<
      MessageRecord & {
        sender_nickname?: string;
        sender_avatar?: string;
        is_favorited?: boolean;
        is_pinned?: boolean;
      }
    >(
      `
      SELECT
        m.id,
        m.client_message_id,
        m.reply_to_message_id,
        m.conversation_id,
        m.sender_id,
        m.type,
        m.content,
        m.created_at,
        m.updated_at,
        m.is_recalled,
        m.seq AS sequence,
        u.nickname AS sender_nickname,
        u.avatar_url AS sender_avatar
        ${userStateSelect}
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      ${userStateJoin}
      WHERE m.id = $1
      `,
      params
    );
  }

  async upsertMessageUserState(
    t: DbTx,
    params: {
      message_id: string;
      user_id: number;
      is_favorited?: boolean;
      is_pinned?: boolean;
    }
  ) {
    return t.one<{
      message_id: string;
      user_id: number;
      is_favorited: boolean;
      is_pinned: boolean;
      updated_at: Date;
    }>(
      `
      INSERT INTO message_user_state (
        message_id, user_id, is_favorited, is_pinned, updated_at
      )
      VALUES ($1, $2, COALESCE($3, FALSE), COALESCE($4, FALSE), NOW())
      ON CONFLICT (message_id, user_id) DO UPDATE
      SET
        is_favorited = COALESCE($3, message_user_state.is_favorited),
        is_pinned = COALESCE($4, message_user_state.is_pinned),
        updated_at = NOW()
      RETURNING message_id, user_id, is_favorited, is_pinned, updated_at
      `,
      [
        params.message_id,
        params.user_id,
        params.is_favorited ?? null,
        params.is_pinned ?? null
      ]
    );
  }

  async findMessageStatesByUser(
    userId: number,
    syncCursor?: SyncCursorToken | null,
    limit = 200
  ) {
    const params: Array<number | Date | string> = [userId];
    const syncCondition = syncCursor
      ? `AND (
          mus.updated_at > $2
          OR (mus.updated_at = $2 AND m.id::bigint > $3::bigint)
        )`
      : "";
    if (syncCursor) {
      params.push(new Date(syncCursor.updated_at), syncCursor.entity_id);
    }

    params.push(limit + 1);

    return pg.manyOrNone<{
      message_id: string;
      conversation_id: string;
      is_favorited: boolean;
      is_pinned: boolean;
      updated_at: Date;
    }>(
      `
      SELECT
        mus.message_id,
        m.conversation_id,
        mus.is_favorited,
        mus.is_pinned,
        mus.updated_at
      FROM message_user_state mus
      JOIN messages m ON m.id = mus.message_id
      JOIN conversation_members cm
        ON cm.conversation_id = m.conversation_id
       AND cm.user_id = $1
       AND cm.left_at IS NULL
      WHERE mus.user_id = $1
        ${syncCondition}
      ORDER BY mus.updated_at ASC, m.id::bigint ASC
      LIMIT $${params.length}
      `,
      params
    );
  }

  async recallMessage(
    t: DbTx,
    params: {
      message_id: string;
      conversation_id: string;
      sender_id: number;
      content: Record<string, unknown>;
    }
  ) {
    return t.oneOrNone<RecalledMessageRecord>(
      `
      UPDATE messages
      SET
        is_recalled = TRUE,
        recalled_at = NOW(),
        content = $4::jsonb,
        updated_at = NOW()
      WHERE id = $1
        AND conversation_id = $2
        AND sender_id = $3
        AND is_recalled = FALSE
      RETURNING
        id,
        client_message_id,
        reply_to_message_id,
        conversation_id,
        sender_id,
        type,
        content,
        created_at,
        updated_at,
        recalled_at,
        seq AS sequence,
        is_recalled
      `,
      [
        params.message_id,
        params.conversation_id,
        params.sender_id,
        JSON.stringify(params.content)
      ]
    );
  }

  /**
   * 拉取当前用户对某会话"可见的最小 seq"。
   * 计算口径：max(join_seq, hidden_before_seq + 1, 1)，与 listMessages/around/delta
   * 的 SQL 可见过滤保持一致。
   * - 返回 0 表示成员不存在 / 已退群（caller 应保守按 0 处理）。
   */
  async getVisibleFromSequence(params: {
    conversationId: string;
    userId: number;
  }): Promise<number> {
    const row = await pg.oneOrNone<{ visible_from_sequence: string | null }>(
      `
      SELECT
        GREATEST(
          COALESCE(cm.join_seq, 0),
          COALESCE(cus.hidden_before_seq, 0) + 1,
          1
        )::bigint AS visible_from_sequence
      FROM conversation_members cm
      LEFT JOIN conversation_user_state cus
        ON cus.conversation_id = cm.conversation_id
       AND cus.user_id = cm.user_id
      WHERE cm.conversation_id = $1::bigint
        AND cm.user_id = $2
        AND cm.left_at IS NULL
      `,
      [params.conversationId, params.userId]
    );
    return row?.visible_from_sequence ? Number(row.visible_from_sequence) : 0;
  }

  /**
   * 返回在 (fromSeqExclusive, toSeqInclusive] 区间内、在指定会话出现过的所有 sender_id。
   * 用于群聊已读高水位推进时，按消息原作者聚合 group_read 事件的扇出目标。
   *
   * 排除已撤回消息（is_recalled = TRUE）：撤回后不应再被视为"被新读到"。
   * 排除 reader 自己（excludeSenderId）：避免自己读到自己的消息触发回环。
   */
  async findDistinctSenderIdsInSeqRange(
    t: DbTx | typeof pg,
    params: {
      conversationId: string;
      fromSeqExclusive: number;
      toSeqInclusive: number;
      excludeSenderId: number;
    }
  ): Promise<number[]> {
    if (params.toSeqInclusive <= params.fromSeqExclusive) {
      return [];
    }
    const rows = await t.manyOrNone<{ sender_id: string | number }>(
      `
      SELECT DISTINCT m.sender_id
      FROM messages m
      WHERE m.conversation_id = $1::bigint
        AND m.seq > $2::bigint
        AND m.seq <= $3::bigint
        AND m.sender_id <> $4
        AND m.is_recalled = FALSE
      `,
      [
        params.conversationId,
        params.fromSeqExclusive,
        params.toSeqInclusive,
        params.excludeSenderId
      ]
    );
    return rows.map(row => Number(row.sender_id));
  }
}

export default new MessageRepository();
