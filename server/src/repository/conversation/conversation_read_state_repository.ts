import pg, { pgp } from "../../db/pg";
import type { ConversationUserStateRecord } from "../models";
import type { DbTx } from "./conversation_core_repository";

export type UpsertConversationUserStateInput = Omit<
  ConversationUserStateRecord,
  "updated_at"
> & {
  settings?: string | null;
};

class ConversationReadStateRepository {
  async upsertConversationUserStates(
    t: DbTx,
    states: UpsertConversationUserStateInput[]
  ) {
    const cs = new pgp.helpers.ColumnSet(
      [
        "conversation_id",
        "user_id",
        "is_pinned",
        "is_muted",
        "is_archived",
        "draft",
        "hidden_before_seq",
        "last_read_seq",
        "last_delivered_seq",
        "unread_count",
        "peer_id",
        "settings"
      ],
      { table: "conversation_user_state" }
    );

    const query =
      pgp.helpers.insert(states, cs) +
      `
      ON CONFLICT (conversation_id, user_id) DO UPDATE
      SET
        -- pin / mute / archive 是用户偏好：成员加入/直接会话创建等调用方一律传 false 作占位，
        -- 这里显式自赋值表示"保留已存在记录的用户偏好"，禁止被默认值覆盖。
        is_pinned = conversation_user_state.is_pinned,
        is_muted = conversation_user_state.is_muted,
        is_archived = conversation_user_state.is_archived,
        draft = COALESCE(conversation_user_state.draft, EXCLUDED.draft),
        hidden_before_seq = GREATEST(conversation_user_state.hidden_before_seq, EXCLUDED.hidden_before_seq),
        last_read_seq = GREATEST(conversation_user_state.last_read_seq, EXCLUDED.last_read_seq),
        last_delivered_seq = GREATEST(conversation_user_state.last_delivered_seq, EXCLUDED.last_delivered_seq),
        unread_count = CASE
          WHEN EXCLUDED.unread_count = 0 THEN 0
          ELSE GREATEST(
            0,
            GREATEST(conversation_user_state.last_delivered_seq, EXCLUDED.last_delivered_seq)
            - GREATEST(conversation_user_state.last_read_seq, EXCLUDED.last_read_seq)
          )
        END,
        peer_id = EXCLUDED.peer_id,
        settings = COALESCE(EXCLUDED.settings, conversation_user_state.settings),
        updated_at = NOW()
      `;

    await t.none(query);
  }

  async applyMessageDeliveryStates(
    t: DbTx,
    states: Array<{
      conversation_id: string;
      user_id: number;
      last_read_seq: number;
      last_delivered_seq: number;
      unread_count: number;
      peer_id?: number | null;
      settings?: string | null;
      should_unarchive: boolean;
      clear_draft: boolean;
    }>
  ) {
    if (states.length === 0) {
      return;
    }

    await t.none(
      `
      WITH incoming AS (
        SELECT *
        FROM unnest(
          $1::BIGINT[],
          $2::BIGINT[],
          $3::BIGINT[],
          $4::BIGINT[],
          $5::BIGINT[],
          $6::BIGINT[],
          $7::TEXT[],
          $8::BOOLEAN[],
          $9::BOOLEAN[]
        ) AS item(
          conversation_id,
          user_id,
          last_read_seq,
          last_delivered_seq,
          unread_count,
          peer_id,
          settings,
          should_unarchive,
          clear_draft
        )
      )
      INSERT INTO conversation_user_state (
        conversation_id,
        user_id,
        is_pinned,
        is_muted,
        is_archived,
        draft,
        hidden_before_seq,
        last_read_seq,
        last_delivered_seq,
        unread_count,
        peer_id,
        settings,
        updated_at
      )
      SELECT
        incoming.conversation_id,
        incoming.user_id,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        0,
        incoming.last_read_seq,
        incoming.last_delivered_seq,
        incoming.unread_count,
        incoming.peer_id,
        CASE
          WHEN incoming.settings IS NULL THEN NULL
          ELSE incoming.settings::jsonb
        END,
        NOW()
      FROM incoming
      ON CONFLICT (conversation_id, user_id) DO UPDATE
      SET
        is_archived = CASE
          WHEN EXCLUDED.unread_count IS NOT NULL AND (
            SELECT item.should_unarchive
            FROM incoming AS item
            WHERE item.conversation_id = EXCLUDED.conversation_id
              AND item.user_id = EXCLUDED.user_id
          ) THEN FALSE
          ELSE conversation_user_state.is_archived
        END,
        draft = CASE
          WHEN (
            SELECT item.clear_draft
            FROM incoming AS item
            WHERE item.conversation_id = EXCLUDED.conversation_id
              AND item.user_id = EXCLUDED.user_id
          ) THEN NULL
          ELSE conversation_user_state.draft
        END,
        last_read_seq = GREATEST(conversation_user_state.last_read_seq, EXCLUDED.last_read_seq),
        last_delivered_seq = GREATEST(conversation_user_state.last_delivered_seq, EXCLUDED.last_delivered_seq),
        unread_count = CASE
          WHEN EXCLUDED.unread_count = 0 THEN 0
          ELSE GREATEST(
            0,
            GREATEST(conversation_user_state.last_delivered_seq, EXCLUDED.last_delivered_seq)
            - GREATEST(conversation_user_state.last_read_seq, EXCLUDED.last_read_seq)
          )
        END,
        peer_id = COALESCE(EXCLUDED.peer_id, conversation_user_state.peer_id),
        settings = COALESCE(EXCLUDED.settings, conversation_user_state.settings),
        updated_at = NOW()
      `,
      [
        states.map(state => String(state.conversation_id)),
        states.map(state => state.user_id),
        states.map(state => state.last_read_seq),
        states.map(state => state.last_delivered_seq),
        states.map(state => state.unread_count),
        states.map(state => state.peer_id ?? null),
        states.map(state => state.settings ?? null),
        states.map(state => state.should_unarchive),
        states.map(state => state.clear_draft)
      ]
    );
  }

  /**
   * P1 幂等短路：读取当前用户在该会话的 read 状态 + 会话最大 message_seq。
   * 用于 markRead 入口判断是否需要进入事务/写 outbox，避免重复 read 的无效写。
   * 仅当用户仍是有效成员（left_at IS NULL）时返回。
   */
  async getReadFastState(
    conversationId: string,
    userId: number
  ): Promise<{
    last_read_seq: number;
    unread_count: number;
    updated_at: Date;
    message_seq: number;
    conversation_type: number;
  } | null> {
    const row = await pg.oneOrNone<{
      last_read_seq: string | number | null;
      unread_count: string | number | null;
      updated_at: Date | null;
      message_seq: string | number | null;
      conversation_type: number | null;
    }>(
      `
        SELECT
          cus.last_read_seq AS last_read_seq,
          cus.unread_count  AS unread_count,
          cus.updated_at    AS updated_at,
          c.message_seq     AS message_seq,
          c.type            AS conversation_type
        FROM conversation_members cm
        JOIN conversations c ON c.id = cm.conversation_id
        LEFT JOIN conversation_user_state cus
          ON cus.conversation_id = cm.conversation_id
         AND cus.user_id = cm.user_id
        WHERE cm.conversation_id = $1
          AND cm.user_id = $2
          AND cm.left_at IS NULL
      `,
      [conversationId, userId]
    );
    if (!row) return null;
    return {
      last_read_seq: Number(row.last_read_seq ?? 0),
      unread_count: Number(row.unread_count ?? 0),
      updated_at: row.updated_at ?? new Date(0),
      message_seq: Number(row.message_seq ?? 0),
      conversation_type: Number(row.conversation_type ?? 1)
    };
  }

  /**
   * Total unread-message count across a user's non-muted conversations.
   * Used to populate the OS app-icon badge (APNs `aps.badge` / Android
   * fallback) so a killed iOS app still reflects the correct number. Muted
   * conversations are excluded to mirror the client-side WeChat-style badge.
   *
   * Backed by the `idx_conversation_user_state_user_unread` index.
   */
  async getTotalUnreadForUser(userId: number): Promise<number> {
    const row = await pg.oneOrNone<{ total: string | number | null }>(
      `
        SELECT COALESCE(SUM(cus.unread_count), 0) AS total
        FROM conversation_user_state cus
        WHERE cus.user_id = $1
          AND cus.unread_count > 0
          AND COALESCE(cus.is_muted, FALSE) = FALSE
      `,
      [userId]
    );
    return Number(row?.total ?? 0);
  }

  async markConversationRead(
    t: DbTx,
    params: {
      conversationId: string;
      userId: number;
      readSeq: number;
    }
  ) {
    const result = await t.oneOrNone<{
      conversation_id: string;
      previous_read_seq: string | number;
      read_seq: string | number;
      unread_count: string | number;
      updated_at: Date;
    }>(
      `
        WITH member_access AS (
          SELECT cm.conversation_id
          FROM conversation_members cm
          WHERE cm.conversation_id = $1
            AND cm.user_id = $2
            AND cm.left_at IS NULL
        ),
        previous AS (
          SELECT COALESCE(cus.last_read_seq, 0)::bigint AS previous_read_seq
          FROM member_access ma
          LEFT JOIN conversation_user_state cus
            ON cus.conversation_id = ma.conversation_id AND cus.user_id = $2
        ),
        bounded_seq AS (
          SELECT
            ma.conversation_id,
            LEAST(
              COALESCE($3::bigint, 0),
              COALESCE(c.message_seq, 0)
            ) AS read_seq
          FROM member_access ma
          JOIN conversations c ON c.id = ma.conversation_id
        ),
        upsert_state AS (
          INSERT INTO conversation_user_state (
            conversation_id,
            user_id,
            is_pinned,
            is_muted,
            is_archived,
            draft,
            hidden_before_seq,
            last_read_seq,
            last_delivered_seq,
            unread_count,
            peer_id,
            settings,
            updated_at
          )
          SELECT
            bs.conversation_id,
            $2,
            FALSE,
            FALSE,
            FALSE,
            NULL,
            0,
            bs.read_seq,
            GREATEST(bs.read_seq, bs.read_seq),
            0,
            NULL,
            NULL,
            NOW()
          FROM bounded_seq bs
          ON CONFLICT (conversation_id, user_id) DO UPDATE
          SET last_read_seq = GREATEST(conversation_user_state.last_read_seq, EXCLUDED.last_read_seq),
              unread_count = GREATEST(
                0,
                (
                  SELECT COALESCE(c.message_seq, 0)
                  FROM conversations c
                  WHERE c.id = EXCLUDED.conversation_id
                ) - GREATEST(conversation_user_state.last_read_seq, EXCLUDED.last_read_seq)
              ),
              updated_at = NOW()
          RETURNING conversation_id, last_read_seq, unread_count, updated_at
        )
        SELECT
          upsert_state.conversation_id,
          (SELECT previous_read_seq FROM previous) AS previous_read_seq,
          upsert_state.last_read_seq AS read_seq,
          upsert_state.unread_count,
          upsert_state.updated_at
        FROM upsert_state
      `,
      [params.conversationId, params.userId, params.readSeq]
    );

    if (!result) {
      return null;
    }

    return {
      conversation_id: result.conversation_id,
      previous_read_seq: Number(result.previous_read_seq ?? 0),
      read_seq: Number(result.read_seq),
      unread_count: Number(result.unread_count),
      updated_at: result.updated_at
    };
  }

  async findReadStateByConversation(
    conversationId: string,
    t: DbTx | typeof pg = pg
  ): Promise<
    Array<{ user_id: number; last_read_seq: number; updated_at: Date }>
  > {
    const rows = await t.manyOrNone<{
      user_id: string | number;
      last_read_seq: string | number | null;
      updated_at: Date | null;
    }>(
      `
      SELECT
        cm.user_id::integer AS user_id,
        COALESCE(cus.last_read_seq, 0) AS last_read_seq,
        COALESCE(cus.updated_at, cm.joined_at) AS updated_at
      FROM conversation_members cm
      LEFT JOIN conversation_user_state cus
        ON cus.conversation_id = cm.conversation_id
       AND cus.user_id = cm.user_id
      WHERE cm.conversation_id = $1
        AND cm.left_at IS NULL
      `,
      [conversationId]
    );
    return rows.map(row => ({
      user_id: Number(row.user_id),
      last_read_seq: Number(row.last_read_seq ?? 0),
      updated_at: row.updated_at ?? new Date(0)
    }));
  }
}

export default new ConversationReadStateRepository();
