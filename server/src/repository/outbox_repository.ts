import pg, { pgp } from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type { MessageOutboxRecord } from "./models";
import { parseJsonValue } from "../utils/json";

type InsertOutboxInput = {
  event_type: string;
  message_id?: string | null;
  conversation_id?: string | null;
  target_user_id?: number | null;
  target_device_id?: string | null;
  payload: unknown;
};

export type OutboxQueueStats = {
  pending: number;
  dispatched: number;
  retry: number;
  processing: number;
  dead: number;
};

const STATUS_PENDING = 0;
const STATUS_DISPATCHED = 1;
const STATUS_PROCESSING = 9;
const STATUS_DEAD = 2;
const STATUS_RETRY = 3;

class OutboxRepository {
  async insertEvents(t: DbTx | typeof pg = pg, events: InsertOutboxInput[]) {
    if (events.length === 0) {
      return;
    }

    const cs = new pgp.helpers.ColumnSet(
      [
        "event_type",
        "message_id",
        "conversation_id",
        "target_user_id",
        "target_device_id",
        "payload:json"
      ],
      { table: "message_outbox" }
    );

    const rows = events.map(event => ({
      event_type: event.event_type,
      message_id: event.message_id ?? null,
      conversation_id: event.conversation_id ?? null,
      target_user_id: event.target_user_id ?? null,
      target_device_id: event.target_device_id ?? null,
      payload: parseJsonValue<unknown>(event.payload)
    }));

    const query =
      pgp.helpers.insert(rows, cs) +
      `
      RETURNING *
      `;

    return t.manyOrNone<MessageOutboxRecord>(query);
  }

  async claimPending(limit = 100, leaseMs = 30_000) {
    return pg.manyOrNone<MessageOutboxRecord>(
      `
      WITH candidate AS (
        SELECT id
        FROM message_outbox
        WHERE (
          status = $1
          OR (status = $2 AND next_retry_at IS NOT NULL AND next_retry_at <= NOW())
          OR (status = $3 AND lease_expires_at IS NOT NULL AND lease_expires_at <= NOW())
        )
        ORDER BY created_at ASC
        LIMIT $4
        FOR UPDATE SKIP LOCKED
      )
      UPDATE message_outbox mo
      SET status = $5,
          processing_started_at = NOW(),
          lease_expires_at = NOW() + make_interval(secs => $6::double precision / 1000.0),
          updated_at = NOW()
      FROM candidate
      WHERE mo.id = candidate.id
      RETURNING mo.*
      `,
      [
        STATUS_PENDING,
        STATUS_RETRY,
        STATUS_PROCESSING,
        limit,
        STATUS_PROCESSING,
        leaseMs
      ]
    );
  }

  async markDispatched(id: number) {
    await pg.none(
      `
      UPDATE message_outbox
      SET status = $2,
          next_retry_at = NULL,
          processing_started_at = NULL,
          lease_expires_at = NULL,
          updated_at = NOW()
      WHERE id = $1
      `,
      [id, STATUS_DISPATCHED]
    );
  }

  async markRetry(id: number, retryCount: number, nextRetryAt: Date) {
    await pg.none(
      `
      UPDATE message_outbox
      SET status = $2,
          retry_count = $3,
          next_retry_at = $4,
          processing_started_at = NULL,
          lease_expires_at = NULL,
          updated_at = NOW()
      WHERE id = $1
      `,
      [id, STATUS_RETRY, retryCount, nextRetryAt]
    );
  }

  async markDead(id: number, retryCount: number) {
    await pg.none(
      `
      UPDATE message_outbox
      SET status = $2,
          retry_count = $3,
          next_retry_at = NULL,
          processing_started_at = NULL,
          lease_expires_at = NULL,
          updated_at = NOW()
      WHERE id = $1
      `,
      [id, STATUS_DEAD, retryCount]
    );
  }

  /**
   * Phase 3：按状态批量删除已超过保留时长的 outbox 行。使用 FOR UPDATE SKIP LOCKED
   * 避免与 worker 抢锁；LIMIT 限制单次事务大小。返回实际删除条数。
   */
  async deleteOlderThan(
    status: number,
    olderThan: Date,
    limit: number
  ): Promise<number> {
    const rows = await pg.manyOrNone<{ id: number }>(
      `
      WITH victims AS (
        SELECT id FROM message_outbox
        WHERE status = $1
          AND updated_at < $2
        ORDER BY updated_at ASC
        LIMIT $3
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM message_outbox mo
      USING victims
      WHERE mo.id = victims.id
      RETURNING mo.id
      `,
      [status, olderThan, Math.max(1, Math.min(limit, 50_000))]
    );
    return rows.length;
  }

  async getStats(): Promise<OutboxQueueStats> {
    const rows = await pg.manyOrNone<{ status: number; count: string }>(
      `
      SELECT status, COUNT(*)::text AS count
      FROM message_outbox
      GROUP BY status
      `
    );

    const counts = new Map<number, number>(
      rows.map((row: { status: number; count: string }) => [
        row.status,
        Number(row.count)
      ])
    );

    return {
      pending: counts.get(STATUS_PENDING) ?? 0,
      dispatched: counts.get(STATUS_DISPATCHED) ?? 0,
      retry: counts.get(STATUS_RETRY) ?? 0,
      processing: counts.get(STATUS_PROCESSING) ?? 0,
      dead: counts.get(STATUS_DEAD) ?? 0
    };
  }
}

export const outboxStatus = {
  pending: STATUS_PENDING,
  dispatched: STATUS_DISPATCHED,
  retry: STATUS_RETRY,
  processing: STATUS_PROCESSING,
  dead: STATUS_DEAD
};

export default new OutboxRepository();
