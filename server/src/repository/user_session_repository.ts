import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type { UserSessionRecord } from "./models";

// Phase 3：显式列清单，对应 UserSessionRecord。
const USER_SESSION_COLUMNS = `
  id, session_id, user_id, device_id, refresh_token_hash,
  previous_refresh_token_hash, previous_refresh_rotated_at,
  access_jti, previous_access_jti, previous_access_rotated_at,
  issued_at, expires_at, last_seen_at, last_ip, user_agent,
  status, revoked_at, revoke_reason, created_at, updated_at
`;

type CreateSessionInput = {
  session_id: string;
  user_id: number;
  device_id?: string | null;
  refresh_token_hash: string;
  access_jti?: string | null;
  expires_at: Date;
  last_ip?: string | null;
  user_agent?: string | null;
};

class UserSessionRepository {
  async create(input: CreateSessionInput, t: DbTx | typeof pg = pg) {
    return t.one<UserSessionRecord>(
      `
      INSERT INTO user_sessions (
        session_id,
        user_id,
        device_id,
        refresh_token_hash,
        access_jti,
        issued_at,
        expires_at,
        last_seen_at,
        last_ip,
        user_agent,
        status,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, NOW(), $6, NOW(), $7::inet, $8, 0, NOW(), NOW()
      )
      RETURNING *
      `,
      [
        input.session_id,
        input.user_id,
        input.device_id ?? null,
        input.refresh_token_hash,
        input.access_jti ?? null,
        input.expires_at,
        input.last_ip ?? null,
        input.user_agent ?? null
      ]
    );
  }

  async findBySessionId(sessionId: string) {
    return pg.oneOrNone<UserSessionRecord>(
      `
      SELECT ${USER_SESSION_COLUMNS}
      FROM user_sessions
      WHERE session_id = $1
      `,
      [sessionId]
    );
  }

  async findByRefreshTokenHash(refreshTokenHash: string) {
    return pg.oneOrNone<UserSessionRecord>(
      `
      SELECT ${USER_SESSION_COLUMNS}
      FROM user_sessions
      WHERE refresh_token_hash = $1
      `,
      [refreshTokenHash]
    );
  }

  async findByPreviousRefreshTokenHash(refreshTokenHash: string) {
    return pg.oneOrNone<UserSessionRecord>(
      `
      SELECT ${USER_SESSION_COLUMNS}
      FROM user_sessions
      WHERE previous_refresh_token_hash = $1
      `,
      [refreshTokenHash]
    );
  }

  async rotateSession(
    sessionId: string,
    patch: {
      current_refresh_token_hash: string;
      refresh_token_hash: string;
      access_jti: string;
      expires_at: Date;
      last_ip?: string | null;
      user_agent?: string | null;
    },
    t: DbTx | typeof pg = pg
  ) {
    return t.oneOrNone<UserSessionRecord>(
      `
      UPDATE user_sessions
      SET
        previous_access_jti = access_jti,
        previous_access_rotated_at = NOW(),
        refresh_token_hash = $2,
        previous_refresh_token_hash = $7,
        previous_refresh_rotated_at = NOW(),
        access_jti = $3,
        expires_at = $4,
        last_seen_at = NOW(),
        last_ip = COALESCE($5::inet, last_ip),
        user_agent = COALESCE($6, user_agent),
        updated_at = NOW()
      WHERE session_id = $1
        AND status = 0
        AND refresh_token_hash = $7
      RETURNING *
      `,
      [
        sessionId,
        patch.refresh_token_hash,
        patch.access_jti,
        patch.expires_at,
        patch.last_ip ?? null,
        patch.user_agent ?? null,
        patch.current_refresh_token_hash
      ]
    );
  }

  async touchSession(
    sessionId: string,
    patch?: {
      last_ip?: string | null;
      user_agent?: string | null;
    },
    t: DbTx | typeof pg = pg
  ) {
    return t.oneOrNone<UserSessionRecord>(
      `
      UPDATE user_sessions
      SET
        last_seen_at = NOW(),
        last_ip = COALESCE($2::inet, last_ip),
        user_agent = COALESCE($3, user_agent),
        updated_at = NOW()
      WHERE session_id = $1
        AND status = 0
      RETURNING *
      `,
      [sessionId, patch?.last_ip ?? null, patch?.user_agent ?? null]
    );
  }

  async revokeSession(
    sessionId: string,
    reason: string,
    nextStatus = 1,
    t: DbTx | typeof pg = pg
  ) {
    return t.oneOrNone<UserSessionRecord>(
      `
      UPDATE user_sessions
      SET
        status = $3,
        revoked_at = NOW(),
        revoke_reason = $2,
        updated_at = NOW()
      WHERE session_id = $1
        AND status = 0
      RETURNING *
      `,
      [sessionId, reason, nextStatus]
    );
  }

  async revokeSessionsByUser(
    userId: number,
    options?: {
      targetDeviceId?: string | null;
      excludeDeviceId?: string | null;
      excludeSessionId?: string | null;
      reason?: string;
      nextStatus?: number;
    },
    t: DbTx | typeof pg = pg
  ) {
    return t.manyOrNone<UserSessionRecord>(
      `
      UPDATE user_sessions
      SET
        status = $5,
        revoked_at = NOW(),
        revoke_reason = $4,
        updated_at = NOW()
      WHERE user_id = $1
        AND status = 0
        AND ($2::text IS NULL OR device_id = $2)
        AND ($3::text IS NULL OR device_id <> $3)
        AND ($6::text IS NULL OR session_id <> $6)
      RETURNING *
      `,
      [
        userId,
        options?.targetDeviceId ?? null,
        options?.excludeDeviceId ?? null,
        options?.reason ?? "revoked",
        options?.nextStatus ?? 1,
        options?.excludeSessionId ?? null
      ]
    );
  }

  async countActiveSessionsByUser(userId: number) {
    return pg.manyOrNone<{
      device_id: string | null;
      active_session_count: number;
    }>(
      `
      SELECT
        device_id,
        COUNT(*)::integer AS active_session_count
      FROM user_sessions
      WHERE user_id = $1
        AND status = 0
        AND expires_at > NOW()
      GROUP BY device_id
      `,
      [userId]
    );
  }
}

export default new UserSessionRepository();
