import pg, { pgp } from "../../db/pg";
import type { ConversationMemberRecord } from "../models";
import type { DbTx } from "./conversation_core_repository";

export type InsertConversationMemberInput = {
  conversation_id: string;
  user_id: number;
  role: number;
  nickname?: string | null;
};

class ConversationMemberRepository {
  async findMembers(
    conversationIds: string | string[],
    t: DbTx | typeof pg = pg
  ) {
    const ids = Array.isArray(conversationIds)
      ? conversationIds
      : [conversationIds];
    const sql = `
      SELECT cm.conversation_id, cm.user_id, cm.joined_at, cm.role, COALESCE(cm.nickname, u.nickname) AS nickname, COALESCE(cm.avatar_url, u.avatar_url) AS avatar_url, cm.join_seq, cm.mute_until, cm.muted_by
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = ANY($1::bigint[])
        AND cm.left_at IS NULL
      ORDER BY cm.conversation_id, cm.role DESC, cm.joined_at ASC, cm.user_id ASC
    `;

    return t.manyOrNone<ConversationMemberRecord>(sql, [ids]);
  }

  async findMember(t: DbTx, conversationId: string, userId: number) {
    return t.oneOrNone<ConversationMemberRecord>(
      `
      SELECT cm.conversation_id, cm.user_id, cm.joined_at, cm.role, COALESCE(cm.nickname, u.nickname) AS nickname, COALESCE(cm.avatar_url, u.avatar_url) AS avatar_url, cm.join_seq, cm.mute_until, cm.muted_by
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = $1
        AND cm.user_id = $2
        AND cm.left_at IS NULL
      `,
      [conversationId, userId]
    );
  }

  async findMembersByConversation(t: DbTx, conversationId: string) {
    return t.manyOrNone<ConversationMemberRecord>(
      `
      SELECT cm.conversation_id, cm.user_id, cm.joined_at, cm.role, COALESCE(cm.nickname, u.nickname) AS nickname, COALESCE(cm.avatar_url, u.avatar_url) AS avatar_url, cm.join_seq, cm.mute_until, cm.muted_by
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = $1
        AND cm.left_at IS NULL
      ORDER BY cm.role DESC, cm.joined_at ASC, cm.user_id ASC
      `,
      [conversationId]
    );
  }

  async insertMembers(t: DbTx, members: InsertConversationMemberInput[]) {
    const csMembers = new pgp.helpers.ColumnSet(
      ["conversation_id", "user_id", "role", "nickname"],
      { table: "conversation_members" }
    );

    const insertMembersQuery =
      pgp.helpers.insert(members, csMembers) +
      " ON CONFLICT (conversation_id, user_id) DO NOTHING RETURNING *";

    return t.manyOrNone<ConversationMemberRecord>(insertMembersQuery);
  }

  async upsertMembers(t: DbTx, members: InsertConversationMemberInput[]) {
    const csMembers = new pgp.helpers.ColumnSet(
      ["conversation_id", "user_id", "role", "nickname"],
      { table: "conversation_members" }
    );

    const query =
      pgp.helpers.insert(members, csMembers) +
      `
      ON CONFLICT (conversation_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          nickname = COALESCE(EXCLUDED.nickname, conversation_members.nickname),
          joined_at = NOW(),
          left_at = NULL,
          leave_seq = NULL
      RETURNING *
      `;

    return t.manyOrNone<ConversationMemberRecord>(query);
  }

  async backfillMemberJoinSequence(
    t: DbTx,
    conversationId: string,
    sequence: number
  ) {
    await t.none(
      `UPDATE conversation_members
       SET join_seq = CASE WHEN join_seq = 0 THEN $2 ELSE join_seq END
       WHERE conversation_id = $1`,
      [conversationId, sequence]
    );
  }

  async setMemberJoinSequence(
    t: DbTx,
    conversationId: string,
    userId: number,
    sequence: number
  ) {
    await t.none(
      `UPDATE conversation_members
       SET join_seq = $3
       WHERE conversation_id = $1
         AND user_id = $2`,
      [conversationId, userId, sequence]
    );
  }

  async markMemberLeft(
    t: DbTx,
    conversationId: string,
    userId: number,
    leaveSequence: number
  ) {
    return t.oneOrNone<ConversationMemberRecord>(
      `
      UPDATE conversation_members
      SET left_at = NOW(),
          leave_seq = $3
      WHERE conversation_id = $1
        AND user_id = $2
        AND left_at IS NULL
      RETURNING conversation_id, user_id, joined_at, role, nickname, avatar_url, join_seq, mute_until, muted_by
      `,
      [conversationId, userId, leaveSequence]
    );
  }

  async updateMemberRole(
    t: DbTx,
    conversationId: string,
    userId: number,
    role: number
  ) {
    return t.oneOrNone<ConversationMemberRecord>(
      `
      UPDATE conversation_members
      SET role = $3
      WHERE conversation_id = $1
        AND user_id = $2
        AND left_at IS NULL
      RETURNING conversation_id, user_id, joined_at, role, nickname, avatar_url, join_seq, mute_until, muted_by
      `,
      [conversationId, userId, role]
    );
  }

  async updateMemberMuteState(
    t: DbTx,
    conversationId: string,
    userId: number,
    muteUntil: Date | null,
    mutedBy: number | null
  ) {
    return t.oneOrNone<ConversationMemberRecord>(
      `
      UPDATE conversation_members
      SET mute_until = $3,
          muted_by = $4
      WHERE conversation_id = $1
        AND user_id = $2
        AND left_at IS NULL
      RETURNING conversation_id, user_id, joined_at, role, nickname, avatar_url, join_seq, mute_until, muted_by
      `,
      [conversationId, userId, muteUntil, mutedBy]
    );
  }

  async refreshMemberProfileCache(
    t: DbTx,
    userId: number,
    patch: {
      nickname?: string;
      avatar_url?: string | null;
    }
  ) {
    const updates: string[] = [];
    const values: Array<number | string | null> = [userId];
    let index = values.length + 1;

    if (patch.nickname !== undefined) {
      updates.push(`nickname = $${index}`);
      values.push(patch.nickname);
      index++;
    }

    if (patch.avatar_url !== undefined) {
      updates.push(`avatar_url = $${index}`);
      values.push(patch.avatar_url ?? null);
      index++;
    }

    if (updates.length === 0) {
      return;
    }

    await t.none(
      `
      UPDATE conversation_members
      SET ${updates.join(", ")}
      WHERE user_id = $1
        AND left_at IS NULL
      `,
      values
    );
  }
}

export default new ConversationMemberRepository();
