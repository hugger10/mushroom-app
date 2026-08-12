import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type { UserBlockRecord } from "./models";

class BlockRepository {
  async listByBlocker(blockerId: number, t: DbTx | typeof pg = pg) {
    return t.manyOrNone<UserBlockRecord>(
      `SELECT
         b.blocker_id::integer AS blocker_id,
         b.blocked_id::integer AS blocked_id,
         b.created_at,
         u.username,
         u.nickname,
         u.avatar_url,
         u.gender,
         u.signature
       FROM user_blocks b
       JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = $1
       ORDER BY b.created_at DESC, u.nickname ASC, u.username ASC`,
      [blockerId]
    );
  }

  async exists(
    blockerId: number,
    blockedId: number,
    t: DbTx | typeof pg = pg
  ): Promise<boolean> {
    const row = await t.oneOrNone<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
         FROM user_blocks
         WHERE blocker_id = $1 AND blocked_id = $2
       ) AS exists`,
      [blockerId, blockedId]
    );
    return Boolean(row?.exists);
  }

  async insert(blockerId: number, blockedId: number, t: DbTx | typeof pg = pg) {
    return t.none(
      `INSERT INTO user_blocks (blocker_id, blocked_id)
       VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [blockerId, blockedId]
    );
  }

  async delete(blockerId: number, blockedId: number, t: DbTx | typeof pg = pg) {
    return t.result(
      `DELETE FROM user_blocks
       WHERE blocker_id = $1 AND blocked_id = $2`,
      [blockerId, blockedId]
    );
  }
}

export default new BlockRepository();
