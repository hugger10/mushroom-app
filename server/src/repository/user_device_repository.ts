import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type { UserDeviceRecord } from "./models";

// Phase 3：显式列清单，对应 UserDeviceRecord。
const USER_DEVICE_COLUMNS = `
  id, user_id, device_id, device_type, device_name, push_provider, push_token,
  voip_token, push_app_id, app_version, last_seen_at, last_login_at, last_ip, status,
  metadata, created_at, updated_at
`;

type UserDeviceUpsertInput = {
  user_id: number;
  device_id: string;
  device_type?: number | null;
  device_name?: string | null;
  push_provider?: string | null;
  push_token?: string | null;
  voip_token?: string | null;
  push_app_id?: string | null;
  app_version?: string | null;
  last_ip?: string | null;
  metadata?: Record<string, unknown> | null;
  markLoggedIn?: boolean;
};

class UserDeviceRepository {
  async upsertDevice(input: UserDeviceUpsertInput, t: DbTx | typeof pg = pg) {
    // 注意：INSERT 侧 `device_type` 用 `COALESCE($3, 0)` 把 null 折叠为 0，因此
    // ON CONFLICT 里的 `EXCLUDED.device_type` 恒为 0（而非 null）——若沿用
    // `COALESCE(EXCLUDED.device_type, user_devices.device_type)` 会在任何不带
    // device_type 的 upsert（如 WS 握手注册）中把已有设备的 device_type 覆盖成 0。
    // 故此处用 `CASE WHEN $3 IS NULL` 基于原始入参判断，null 时保留已有值。
    // 其余字段 INSERT 侧直接传 null，EXCLUDED 为 null，COALESCE 语义正确无需特判。
    return t.one<UserDeviceRecord>(
      `
      INSERT INTO user_devices (
        user_id,
        device_id,
        device_type,
        device_name,
        push_provider,
        push_token,
        voip_token,
        push_app_id,
        app_version,
        last_seen_at,
        last_login_at,
        last_ip,
        status,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        $1,
        $2,
        COALESCE($3, 0),
        $4,
        $5,
        $6,
        $12,
        $7,
        $8,
        NOW(),
        NOW(),
        $9::inet,
        1,
        $10::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id, device_id) DO UPDATE
      SET
        device_type = CASE
          WHEN $3 IS NULL THEN user_devices.device_type
          ELSE $3
        END,
        device_name = COALESCE(EXCLUDED.device_name, user_devices.device_name),
        push_provider = COALESCE(EXCLUDED.push_provider, user_devices.push_provider),
        push_token = COALESCE(EXCLUDED.push_token, user_devices.push_token),
        voip_token = COALESCE(EXCLUDED.voip_token, user_devices.voip_token),
        push_app_id = COALESCE(EXCLUDED.push_app_id, user_devices.push_app_id),
        app_version = COALESCE(EXCLUDED.app_version, user_devices.app_version),
        last_seen_at = NOW(),
        last_login_at = CASE
          WHEN $11 THEN NOW()
          ELSE user_devices.last_login_at
        END,
        last_ip = COALESCE(EXCLUDED.last_ip, user_devices.last_ip),
        status = 1,
        metadata = CASE
          WHEN EXCLUDED.metadata IS NULL THEN user_devices.metadata
          ELSE COALESCE(user_devices.metadata, '{}'::jsonb) || EXCLUDED.metadata
        END,
        updated_at = NOW()
      RETURNING *
      `,
      [
        input.user_id,
        input.device_id,
        input.device_type ?? null,
        input.device_name ?? null,
        input.push_provider ?? null,
        input.push_token ?? null,
        input.push_app_id ?? null,
        input.app_version ?? null,
        input.last_ip ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.markLoggedIn === true,
        input.voip_token ?? null
      ]
    );
  }

  async touchDeviceSeen(
    userId: number,
    deviceId: string,
    patch?: {
      last_ip?: string | null;
      push_provider?: string | null;
      push_token?: string | null;
      voip_token?: string | null;
      push_app_id?: string | null;
      metadata?: Record<string, unknown> | null;
    },
    t: DbTx | typeof pg = pg
  ) {
    return t.oneOrNone<UserDeviceRecord>(
      `
      UPDATE user_devices
      SET
        last_seen_at = NOW(),
        last_ip = COALESCE($3::inet, last_ip),
        push_provider = COALESCE($4::text, push_provider),
        push_token = COALESCE($5::text, push_token),
        push_app_id = COALESCE($6::text, push_app_id),
        voip_token = COALESCE($8::text, voip_token),
        metadata = CASE
          WHEN $7::jsonb IS NULL THEN metadata
          ELSE COALESCE(metadata, '{}'::jsonb) || $7::jsonb
        END,
        updated_at = NOW()
      WHERE user_id = $1
        AND device_id = $2
        AND status = 1
      RETURNING *
      `,
      [
        userId,
        deviceId,
        patch?.last_ip ?? null,
        patch?.push_provider ?? null,
        patch?.push_token ?? null,
        patch?.push_app_id ?? null,
        patch?.metadata ? JSON.stringify(patch.metadata) : null,
        patch?.voip_token ?? null
      ]
    );
  }

  async findByUserAndDevice(userId: number, deviceId: string) {
    return pg.oneOrNone<UserDeviceRecord>(
      `
      SELECT ${USER_DEVICE_COLUMNS}
      FROM user_devices
      WHERE user_id = $1
        AND device_id = $2
      `,
      [userId, deviceId]
    );
  }

  async listByUser(userId: number) {
    return pg.manyOrNone<UserDeviceRecord>(
      `
      SELECT ${USER_DEVICE_COLUMNS}
      FROM user_devices
      WHERE user_id = $1
        AND (status = 1 OR last_seen_at >= NOW() - INTERVAL '30 days')
      ORDER BY
        CASE WHEN status = 1 THEN 0 ELSE 1 END,
        last_seen_at DESC,
        updated_at DESC,
        id DESC
      LIMIT 20
      `,
      [userId]
    );
  }

  async listLatestActivityByUsers(
    userIds: number[],
    t: DbTx | typeof pg = pg
  ): Promise<Array<{ user_id: number; last_active_at: Date | null }>> {
    if (userIds.length === 0) {
      return [];
    }

    return t.manyOrNone<{ user_id: number; last_active_at: Date | null }>(
      `
      SELECT
        user_id,
        MAX(COALESCE(last_seen_at, last_login_at)) AS last_active_at
      FROM user_devices
      WHERE user_id = ANY($1::int[])
      GROUP BY user_id
      `,
      [userIds]
    );
  }

  async updateDeviceStatus(
    userId: number,
    deviceId: string,
    status: number,
    t: DbTx | typeof pg = pg
  ) {
    return t.oneOrNone<UserDeviceRecord>(
      `
      UPDATE user_devices
      SET
        status = $3,
        updated_at = NOW()
      WHERE user_id = $1
        AND device_id = $2
        AND status <> $3
      RETURNING *
      `,
      [userId, deviceId, status]
    );
  }

  async updateDevicesStatusByUser(
    userId: number,
    status: number,
    options?: {
      excludeDeviceId?: string | null;
    },
    t: DbTx | typeof pg = pg
  ) {
    return t.manyOrNone<UserDeviceRecord>(
      `
      UPDATE user_devices
      SET
        status = $2,
        updated_at = NOW()
      WHERE user_id = $1
        AND ($3::text IS NULL OR device_id <> $3)
        AND status <> $2
      RETURNING *
      `,
      [userId, status, options?.excludeDeviceId ?? null]
    );
  }

  /**
   * 客户端退出登录时，主动清除该设备的 push 凭据并把状态置为 2（logged
   * out）。和 `updateDeviceStatus` 区别：还会把 `push_token` 置 NULL，
   * 防止推送路由继续命中已注销设备。
   *
   * 注意：调用方必须先校验 `deviceId` 来自 JWT，不能信任 body 字段。
   */
  async unregisterPushAndLogout(
    userId: number,
    deviceId: string,
    t: DbTx | typeof pg = pg
  ) {
    return t.oneOrNone<UserDeviceRecord>(
      `
      UPDATE user_devices
      SET
        push_token = NULL,
        voip_token = NULL,
        status = 2,
        updated_at = NOW()
      WHERE user_id = $1
        AND device_id = $2
      RETURNING *
      `,
      [userId, deviceId]
    );
  }
}

export default new UserDeviceRepository();
