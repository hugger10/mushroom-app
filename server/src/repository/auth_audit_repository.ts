import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type { AuthAuditLogRecord } from "./models";

type InsertAuditInput = {
  user_id?: number | null;
  device_id?: string | null;
  session_id?: string | null;
  action: string;
  action_status: number;
  ip?: string | null;
  user_agent?: string | null;
  details?: Record<string, unknown> | null;
};

class AuthAuditRepository {
  async insert(input: InsertAuditInput, t: DbTx | typeof pg = pg) {
    return t.one<AuthAuditLogRecord>(
      `
      INSERT INTO auth_audit_logs (
        user_id,
        device_id,
        session_id,
        action,
        action_status,
        ip,
        user_agent,
        details,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::inet, $7, $8::jsonb, NOW()
      )
      RETURNING *
      `,
      [
        input.user_id ?? null,
        input.device_id ?? null,
        input.session_id ?? null,
        input.action,
        input.action_status,
        input.ip ?? null,
        input.user_agent ?? null,
        input.details ? JSON.stringify(input.details) : null
      ]
    );
  }

  async listByUser(userId: number, limit = 50) {
    return pg.manyOrNone<AuthAuditLogRecord>(
      `
      SELECT id, user_id, device_id, session_id, action, action_status,
             ip, user_agent, details, created_at
      FROM auth_audit_logs
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
      `,
      [userId, limit]
    );
  }
}

export default new AuthAuditRepository();
