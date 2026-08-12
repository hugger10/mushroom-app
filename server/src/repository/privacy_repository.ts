import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type { UserPrivacySettingsRecord } from "./models";

const SELECT_COLUMNS = `
  user_id::integer AS user_id,
  discoverable_by_username,
  discoverable_by_phone,
  message_permission,
  presence_visibility,
  read_receipts_visibility,
  version,
  updated_at
`;

class PrivacyRepository {
  async ensureForUser(userId: number, t: DbTx | typeof pg = pg) {
    return t.one<UserPrivacySettingsRecord>(
      `INSERT INTO user_privacy_settings (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE
       SET user_id = EXCLUDED.user_id
       RETURNING ${SELECT_COLUMNS}`,
      [userId]
    );
  }

  async findByUserId(userId: number, t: DbTx | typeof pg = pg) {
    const settings = await t.oneOrNone<UserPrivacySettingsRecord>(
      `SELECT ${SELECT_COLUMNS}
       FROM user_privacy_settings
       WHERE user_id = $1`,
      [userId]
    );

    if (settings) {
      return settings;
    }

    return this.ensureForUser(userId, t);
  }

  /**
   * 批量获取多个用户的隐私设置（仅返回已存在行；缺失行视为默认值，由调用方处理）。
   */
  async findManyByUserIds(
    userIds: number[],
    t: DbTx | typeof pg = pg
  ): Promise<UserPrivacySettingsRecord[]> {
    if (userIds.length === 0) {
      return [];
    }
    return t.manyOrNone<UserPrivacySettingsRecord>(
      `SELECT ${SELECT_COLUMNS}
       FROM user_privacy_settings
       WHERE user_id = ANY($1::bigint[])`,
      [userIds]
    );
  }

  async update(
    userId: number,
    patch: {
      discoverable_by_username?: 0 | 1 | 2;
      discoverable_by_phone?: 0 | 1 | 2;
      message_permission?: 0 | 1 | 2;
      presence_visibility?: 0 | 1 | 2;
      read_receipts_visibility?: 0 | 1 | 2;
    },
    t: DbTx | typeof pg = pg
  ) {
    await this.ensureForUser(userId, t);
    return t.one<UserPrivacySettingsRecord>(
      `UPDATE user_privacy_settings
       SET
         discoverable_by_username = COALESCE($2, discoverable_by_username),
         discoverable_by_phone = COALESCE($3, discoverable_by_phone),
         message_permission = COALESCE($4, message_permission),
         presence_visibility = COALESCE($5, presence_visibility),
         read_receipts_visibility = COALESCE($6, read_receipts_visibility),
         version = version + 1,
         updated_at = NOW()
       WHERE user_id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [
        userId,
        patch.discoverable_by_username ?? null,
        patch.discoverable_by_phone ?? null,
        patch.message_permission ?? null,
        patch.presence_visibility ?? null,
        patch.read_receipts_visibility ?? null
      ]
    );
  }
}

export default new PrivacyRepository();
