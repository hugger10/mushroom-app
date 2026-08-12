import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";

export type IdempotencyKey = {
  userId: number;
  method: string;
  path: string;
  clientRequestId: string;
};

export type IdempotencyRecord = {
  user_id: string;
  method: string;
  path: string;
  client_request_id: string;
  request_hash: string;
  status_code: number;
  response_body: unknown;
  created_at: Date;
  expires_at: Date;
};

type InsertInput = IdempotencyKey & {
  requestHash: string;
  statusCode: number;
  responseBody: unknown;
  ttlSeconds: number;
};

class IdempotencyRepository {
  async findOne(
    key: IdempotencyKey,
    t: DbTx | typeof pg = pg
  ): Promise<IdempotencyRecord | null> {
    const row = await t.oneOrNone<IdempotencyRecord>(
      `SELECT user_id, method, path, client_request_id, request_hash,
              status_code, response_body, created_at, expires_at
         FROM api_idempotency_keys
        WHERE user_id = $1 AND method = $2 AND path = $3 AND client_request_id = $4
          AND expires_at > NOW()`,
      [key.userId, key.method, key.path, key.clientRequestId]
    );
    return row ?? null;
  }

  /**
   * 写入幂等记录；并发场景下若已被其他请求先写入则 ON CONFLICT DO NOTHING。
   * 返回 true 表示真正写入，false 表示已存在或被跳过。
   */
  async insert(input: InsertInput, t: DbTx | typeof pg = pg): Promise<boolean> {
    const result = await t.result(
      `INSERT INTO api_idempotency_keys
         (user_id, method, path, client_request_id, request_hash,
          status_code, response_body, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW() + ($8 || ' seconds')::interval)
       ON CONFLICT (user_id, method, path, client_request_id) DO NOTHING`,
      [
        input.userId,
        input.method,
        input.path,
        input.clientRequestId,
        input.requestHash,
        input.statusCode,
        JSON.stringify(input.responseBody ?? null),
        String(input.ttlSeconds)
      ]
    );
    return result.rowCount > 0;
  }

  async deleteExpired(t: DbTx | typeof pg = pg): Promise<number> {
    const result = await t.result(
      `DELETE FROM api_idempotency_keys WHERE expires_at <= NOW()`
    );
    return result.rowCount;
  }
}

export const idempotencyRepository = new IdempotencyRepository();
export default idempotencyRepository;
