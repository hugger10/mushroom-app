import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type { UserRecord, UserProfile } from "./models";

class UserRepository {
  async findById(id: number) {
    return pg.oneOrNone<UserRecord>(
      `SELECT
         id::integer AS id,
         username,
         password,
         email,
         phone,
         avatar_url,
         nickname,
         gender,
         birthday,
         signature,
         is_deleted,
         created_at,
         updated_at,
         last_login_at,
         status
       FROM users
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * 批量按 id 查询用户。返回顺序不保证；调用方按 id 做 Map 索引使用。
   * 仅返回存在行；不存在的 id 静默忽略。
   */
  async findByIds(ids: number[]) {
    if (ids.length === 0) {
      return [];
    }
    return pg.manyOrNone<UserRecord>(
      `SELECT
         id::integer AS id,
         username,
         password,
         email,
         phone,
         avatar_url,
         nickname,
         gender,
         birthday,
         signature,
         is_deleted,
         created_at,
         updated_at,
         last_login_at,
         status
       FROM users
       WHERE id = ANY($1::bigint[])`,
      [ids]
    );
  }

  /**
   * Batch lookup that returns only the public profile fields, used by
   * cross-domain callers (e.g. conversation creation / member additions) to
   * verify user existence without pulling secrets/audit columns. Tx-aware so
   * callers can run the check inside the same transaction as the write.
   */
  async findProfilesByIds(t: DbTx, ids: number[]): Promise<UserProfile[]> {
    if (ids.length === 0) {
      return [];
    }
    return t.any<UserProfile>(
      `SELECT
         id::integer AS id,
         username,
         nickname,
         avatar_url,
         gender,
         signature
       FROM users
       WHERE id = ANY($1)`,
      [ids]
    );
  }

  async findByUsername(username: string) {
    return pg.oneOrNone<UserRecord>(
      `SELECT
         id::integer AS id,
         username,
         password,
         email,
         phone,
         avatar_url,
         nickname,
         gender,
         birthday,
         signature,
         is_deleted,
         created_at,
         updated_at,
         last_login_at,
         status
       FROM users
       WHERE username = $1`,
      [username]
    );
  }

  async create(
    username: string,
    password: string,
    nickname: string,
    t: DbTx | typeof pg = pg
  ) {
    return t.one<UserRecord>(
      `INSERT INTO users(username, password, nickname)
       VALUES($1, $2, $3)
       RETURNING
         id::integer AS id,
         username,
         password,
         email,
         phone,
         avatar_url,
         nickname,
         gender,
         birthday,
         signature,
         is_deleted,
         created_at,
         updated_at,
         last_login_at,
         status`,
      [username, password, nickname]
    );
  }

  async search(keyword: string, selfId?: number) {
    // P2-Task4: ILIKE 通配符注入防护。
    // - 转义 \ % _ ，避免用户输入的 % / _ 把模糊匹配放大为全表扫描或穿透到非预期前缀；
    //   保留 `%kw%` 的"两侧模糊"语义。
    // - keyword 截断到 50 字符，防止超长串导致索引失效 + 内存放大。
    const trimmed = keyword.trim().slice(0, 50);
    const escaped = trimmed.replace(/[\\%_]/g, ch => `\\${ch}`);
    const pattern = `%${escaped}%`;
    const sql = `
      SELECT
        id::integer AS id,
        username,
        password,
        email,
        phone,
        avatar_url,
        nickname,
        gender,
        birthday,
        signature,
        is_deleted,
        created_at,
        updated_at,
        last_login_at,
        status
      FROM users
      WHERE username ILIKE $1 ESCAPE '\\'
      ${selfId ? "AND id != $2" : ""}
      ORDER BY created_at DESC
      LIMIT 10
    `;
    const params = selfId ? [pattern, selfId] : [pattern];
    return pg.manyOrNone<UserRecord>(sql, params);
  }

  async updateProfile(
    userId: number,
    patch: {
      nickname?: string;
      avatar_url?: string | null;
      email?: string | null;
      phone?: string | null;
      gender?: number | null;
      birthday?: string | null;
      signature?: string | null;
    },
    t: DbTx | typeof pg = pg
  ) {
    return t.one<UserRecord>(
      `UPDATE users
       SET
         nickname = COALESCE($2, nickname),
         avatar_url = COALESCE($3, avatar_url),
         signature = COALESCE($4, signature),
         gender = COALESCE($5, gender),
         email = COALESCE($6, email),
         phone = COALESCE($7, phone),
         birthday = COALESCE($8::date, birthday),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING
         id::integer AS id,
         username,
         password,
         email,
         phone,
         avatar_url,
         nickname,
         gender,
         birthday,
         signature,
         is_deleted,
         created_at,
         updated_at,
         last_login_at,
         status`,
      [
        userId,
        patch.nickname ?? null,
        patch.avatar_url ?? null,
        patch.signature ?? null,
        patch.gender ?? null,
        patch.email ?? null,
        patch.phone ?? null,
        patch.birthday ?? null
      ]
    );
  }

  async updatePassword(
    userId: number,
    password: string,
    t: DbTx | typeof pg = pg
  ) {
    return t.none(
      `UPDATE users
       SET password = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId, password]
    );
  }

  /**
   * Phase 3：DB 层节流——仅当距上次写入超过 1 分钟才真正 UPDATE，
   * 配合 UserService.markLogin 的进程内 LRU 做双层节流，避免 users 表 hot row 频繁更新。
   */
  async updateLastLoginAt(userId: number) {
    return pg.none(
      `UPDATE users
       SET last_login_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND (last_login_at IS NULL
              OR last_login_at < NOW() - INTERVAL '1 minute')`,
      [userId]
    );
  }

  /**
   * P2-Task2：直聊发送前置门控 —— 一条 SQL 同时取出：
   *   - sender_blocked_recipient：sender 是否拉黑 recipient
   *   - recipient_blocked_sender：recipient 是否拉黑 sender
   *   - recipient_message_permission：recipient 的 message_permission（0/1/2；缺省按 0 处理）
   *   - recipient_saved_sender：recipient 是否把 sender 加为联系人（用于 permission=1 校验）
   * 替代原 message_service 中 hasBlocked × 2 + getPrivacySettings + areContacts 的串行 4 次 round-trip。
   * 隐私设置缺省值 0（与 user_privacy_settings 表默认列保持一致）。
   */
  async loadDirectMessageGate(
    senderId: number,
    recipientId: number,
    t: DbTx | typeof pg = pg
  ) {
    const row = await t.one<{
      sender_blocked_recipient: boolean;
      recipient_blocked_sender: boolean;
      recipient_message_permission: 0 | 1 | 2;
      recipient_saved_sender: boolean;
    }>(
      `SELECT
         EXISTS(
           SELECT 1 FROM user_blocks
           WHERE blocker_id = $1 AND blocked_id = $2
         ) AS sender_blocked_recipient,
         EXISTS(
           SELECT 1 FROM user_blocks
           WHERE blocker_id = $2 AND blocked_id = $1
         ) AS recipient_blocked_sender,
         COALESCE(
           (SELECT message_permission FROM user_privacy_settings WHERE user_id = $2),
           0
         )::int AS recipient_message_permission,
         EXISTS(
           SELECT 1 FROM user_contacts
           WHERE owner_user_id = $2
             AND contact_user_id = $1
             AND status = 'normal'
         ) AS recipient_saved_sender`,
      [senderId, recipientId]
    );
    return row;
  }
}

export default new UserRepository();
