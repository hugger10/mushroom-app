import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type { UserNotificationSettingsRecord } from "./models";

export type NotificationSettingsPatch = {
  messages_enabled?: boolean;
  calls_enabled?: boolean;
  sound_enabled?: boolean;
  group_messages_enabled?: boolean;
  mention_only?: boolean;
  in_app_banner_enabled?: boolean;
  preview_mode?: "full" | "sender" | "hidden";
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  quiet_hours_allow_mentions?: boolean;
  quiet_hours_allow_calls?: boolean;
};

const notificationSettingsSelect = `
  user_id::integer AS user_id,
  messages_enabled,
  calls_enabled,
  sound_enabled,
  group_messages_enabled,
  mention_only,
  in_app_banner_enabled,
  preview_mode,
  quiet_hours_enabled,
  quiet_hours_start,
  quiet_hours_end,
  quiet_hours_allow_mentions,
  quiet_hours_allow_calls,
  updated_at
`;

class NotificationSettingsRepository {
  async ensureForUser(userId: number, t: DbTx | typeof pg = pg) {
    return t.one<UserNotificationSettingsRecord>(
      `INSERT INTO user_notification_settings (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE
       SET user_id = EXCLUDED.user_id
       RETURNING ${notificationSettingsSelect}`,
      [userId]
    );
  }

  async findByUserId(userId: number, t: DbTx | typeof pg = pg) {
    const settings = await t.oneOrNone<UserNotificationSettingsRecord>(
      `SELECT ${notificationSettingsSelect}
       FROM user_notification_settings
       WHERE user_id = $1`,
      [userId]
    );

    if (settings) {
      return settings;
    }

    return this.ensureForUser(userId, t);
  }

  async update(
    userId: number,
    patch: NotificationSettingsPatch,
    t: DbTx | typeof pg = pg
  ) {
    await this.ensureForUser(userId, t);
    return t.one<UserNotificationSettingsRecord>(
      `UPDATE user_notification_settings
       SET
         messages_enabled = COALESCE($2, messages_enabled),
         calls_enabled = COALESCE($3, calls_enabled),
         group_messages_enabled = COALESCE($4, group_messages_enabled),
         mention_only = COALESCE($5, mention_only),
         in_app_banner_enabled = COALESCE($6, in_app_banner_enabled),
         preview_mode = COALESCE($7, preview_mode),
         quiet_hours_enabled = COALESCE($8, quiet_hours_enabled),
         quiet_hours_start = COALESCE($9, quiet_hours_start),
         quiet_hours_end = COALESCE($10, quiet_hours_end),
         quiet_hours_allow_mentions = COALESCE($11, quiet_hours_allow_mentions),
         quiet_hours_allow_calls = COALESCE($12, quiet_hours_allow_calls),
         sound_enabled = COALESCE($13, sound_enabled),
         updated_at = NOW()
       WHERE user_id = $1
       RETURNING ${notificationSettingsSelect}`,
      [
        userId,
        patch.messages_enabled ?? null,
        patch.calls_enabled ?? null,
        patch.group_messages_enabled ?? null,
        patch.mention_only ?? null,
        patch.in_app_banner_enabled ?? null,
        patch.preview_mode ?? null,
        patch.quiet_hours_enabled ?? null,
        patch.quiet_hours_start ?? null,
        patch.quiet_hours_end ?? null,
        patch.quiet_hours_allow_mentions ?? null,
        patch.quiet_hours_allow_calls ?? null,
        patch.sound_enabled ?? null
      ]
    );
  }
}

export default new NotificationSettingsRepository();
