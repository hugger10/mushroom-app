import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type {
  CallEventRecord,
  CallParticipantRecord,
  CallSessionRecord
} from "./models";

// Phase 3：显式列清单。
const CALL_SESSION_COLUMNS = `
  id, call_id, conversation_id, call_scope, media_type, initiator_user_id,
  status, active_device_count, participant_count,
  started_at, answered_at, ended_at, end_reason, created_at, updated_at
`;
const CALL_PARTICIPANT_COLUMNS = `
  id, call_id, conversation_id, user_id, device_id, participant_role,
  participant_status, ringing_at, answered_at, joined_at, left_at,
  end_reason, created_at, updated_at
`;

type InsertCallSessionInput = {
  call_id: string;
  conversation_id: string;
  call_scope: number;
  media_type: number;
  initiator_user_id: number;
  status: number;
  active_device_count?: number;
  participant_count?: number;
  started_at?: Date;
};

type InsertCallParticipantInput = {
  call_id: string;
  conversation_id: string;
  user_id: number;
  device_id: string;
  participant_role: number;
  participant_status: number;
  ringing_at?: Date | null;
  answered_at?: Date | null;
  joined_at?: Date | null;
  left_at?: Date | null;
  end_reason?: number | null;
};

class CallRepository {
  async findStaleRingingJoinedCallIdsByUser(userId: number, staleBefore: Date) {
    return pg.manyOrNone<{ call_id: string }>(
      `
      SELECT DISTINCT cp.call_id
      FROM call_participants cp
      JOIN call_sessions cs ON cs.call_id = cp.call_id
      WHERE cp.user_id = $1
        AND cp.participant_status = 4
        AND cs.status = 2
        AND cs.started_at <= $2
        AND EXISTS (
          SELECT 1
          FROM call_participants cp2
          WHERE cp2.call_id = cp.call_id
            AND NOT (
              cp2.user_id = cp.user_id
              AND cp2.device_id = cp.device_id
            )
            AND cp2.participant_status IN (1, 2, 3, 4)
        )
      ORDER BY cp.call_id ASC
      `,
      [userId, staleBefore]
    );
  }

  async findStaleActiveCallIdsByDevice(
    userId: number,
    deviceId: string,
    staleBefore: Date
  ) {
    return pg.manyOrNone<{ call_id: string }>(
      `
      SELECT DISTINCT cp.call_id
      FROM call_participants cp
      JOIN call_sessions cs ON cs.call_id = cp.call_id
      WHERE cp.user_id = $1
        AND cp.device_id = $2
        AND cp.participant_status IN (1, 2, 4)
        AND cs.status IN (2, 3)
        AND cs.started_at <= $3
      ORDER BY cp.call_id ASC
      `,
      [userId, deviceId, staleBefore]
    );
  }

  async findActiveJoinedParticipantByUser(userId: number) {
    return pg.oneOrNone<CallParticipantRecord>(
      `
      SELECT cp.*
      FROM call_participants cp
      JOIN call_sessions cs ON cs.call_id = cp.call_id
      WHERE cp.user_id = $1
        AND cp.participant_status = 4
        AND cs.status IN (1, 2, 3)
        AND EXISTS (
          SELECT 1
          FROM call_participants cp2
          WHERE cp2.call_id = cp.call_id
            AND NOT (
              cp2.user_id = cp.user_id
              AND cp2.device_id = cp.device_id
            )
            AND cp2.participant_status IN (1, 2, 3, 4)
        )
      ORDER BY cp.updated_at DESC, cp.id DESC
      LIMIT 1
      `,
      [userId]
    );
  }

  async insertCallSession(t: DbTx, input: InsertCallSessionInput) {
    return t.one<CallSessionRecord>(
      `
      INSERT INTO call_sessions (
        call_id,
        conversation_id,
        call_scope,
        media_type,
        initiator_user_id,
        status,
        active_device_count,
        participant_count,
        started_at,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()), NOW(), NOW()
      )
      RETURNING *
      `,
      [
        input.call_id,
        input.conversation_id,
        input.call_scope,
        input.media_type,
        input.initiator_user_id,
        input.status,
        input.active_device_count ?? 0,
        input.participant_count ?? 0,
        input.started_at ?? null
      ]
    );
  }

  async insertCallParticipants(t: DbTx, inputs: InsertCallParticipantInput[]) {
    const results: CallParticipantRecord[] = [];
    for (const input of inputs) {
      const participant = await t.one<CallParticipantRecord>(
        `
        INSERT INTO call_participants (
          call_id,
          conversation_id,
          user_id,
          device_id,
          participant_role,
          participant_status,
          ringing_at,
          answered_at,
          joined_at,
          left_at,
          end_reason,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
        )
        ON CONFLICT (call_id, device_id) DO UPDATE
        SET
          participant_role = EXCLUDED.participant_role,
          participant_status = EXCLUDED.participant_status,
          ringing_at = EXCLUDED.ringing_at,
          answered_at = EXCLUDED.answered_at,
          joined_at = EXCLUDED.joined_at,
          left_at = EXCLUDED.left_at,
          end_reason = EXCLUDED.end_reason,
          updated_at = NOW()
        RETURNING *
        `,
        [
          input.call_id,
          input.conversation_id,
          input.user_id,
          input.device_id,
          input.participant_role,
          input.participant_status,
          input.ringing_at ?? null,
          input.answered_at ?? null,
          input.joined_at ?? null,
          input.left_at ?? null,
          input.end_reason ?? null
        ]
      );
      results.push(participant);
    }
    return results;
  }

  async findCallSessionByCallId(callId: string) {
    return pg.oneOrNone<CallSessionRecord>(
      `SELECT ${CALL_SESSION_COLUMNS} FROM call_sessions WHERE call_id = $1`,
      [callId]
    );
  }

  async findCallParticipantsByCallId(callId: string) {
    return pg.manyOrNone<CallParticipantRecord>(
      `
      SELECT ${CALL_PARTICIPANT_COLUMNS}
      FROM call_participants
      WHERE call_id = $1
      ORDER BY created_at ASC, id ASC
      `,
      [callId]
    );
  }

  async findJoinedParticipantByUser(
    callId: string,
    userId: number,
    joinedStatus: number
  ) {
    return pg.oneOrNone<CallParticipantRecord>(
      `
      SELECT ${CALL_PARTICIPANT_COLUMNS}
      FROM call_participants
      WHERE call_id = $1
        AND user_id = $2
        AND participant_status = $3
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
      `,
      [callId, userId, joinedStatus]
    );
  }

  async updateCallSessionState(
    t: DbTx,
    input: {
      call_id: string;
      status: number;
      media_type?: number;
      active_device_count?: number;
      participant_count?: number;
      answered_at?: Date | null;
      ended_at?: Date | null;
      end_reason?: number | null;
    }
  ) {
    return t.oneOrNone<CallSessionRecord>(
      `
      UPDATE call_sessions
      SET
        status = $2,
        media_type = COALESCE($3, media_type),
        active_device_count = COALESCE($4, active_device_count),
        participant_count = COALESCE($5, participant_count),
        answered_at = COALESCE($6, answered_at),
        ended_at = COALESCE($7, ended_at),
        end_reason = COALESCE($8, end_reason),
        updated_at = NOW()
      WHERE call_id = $1
      RETURNING *
      `,
      [
        input.call_id,
        input.status,
        input.media_type ?? null,
        input.active_device_count ?? null,
        input.participant_count ?? null,
        input.answered_at ?? null,
        input.ended_at ?? null,
        input.end_reason ?? null
      ]
    );
  }

  async updateParticipantStateForDevice(
    t: DbTx,
    input: {
      call_id: string;
      user_id: number;
      device_id: string;
      participant_status: number;
      answered_at?: Date | null;
      joined_at?: Date | null;
      left_at?: Date | null;
      end_reason?: number | null;
    }
  ) {
    return t.oneOrNone<CallParticipantRecord>(
      `
      UPDATE call_participants
      SET
        participant_status = $4,
        answered_at = COALESCE($5, answered_at),
        joined_at = COALESCE($6, joined_at),
        left_at = COALESCE($7, left_at),
        end_reason = COALESCE($8, end_reason),
        updated_at = NOW()
      WHERE call_id = $1
        AND user_id = $2
        AND device_id = $3
      RETURNING *
      `,
      [
        input.call_id,
        input.user_id,
        input.device_id,
        input.participant_status,
        input.answered_at ?? null,
        input.joined_at ?? null,
        input.left_at ?? null,
        input.end_reason ?? null
      ]
    );
  }

  async updateSiblingDevicesForUser(
    t: DbTx,
    input: {
      call_id: string;
      user_id: number;
      exclude_device_id: string;
      participant_status: number;
      left_at?: Date | null;
      end_reason?: number | null;
    }
  ) {
    return t.manyOrNone<CallParticipantRecord>(
      `
      UPDATE call_participants
      SET
        participant_status = $4,
        left_at = COALESCE($5, left_at),
        end_reason = COALESCE($6, end_reason),
        updated_at = NOW()
      WHERE call_id = $1
        AND user_id = $2
        AND device_id <> $3
        AND participant_status IN (1, 2, 3, 4)
      RETURNING *
      `,
      [
        input.call_id,
        input.user_id,
        input.exclude_device_id,
        input.participant_status,
        input.left_at ?? null,
        input.end_reason ?? null
      ]
    );
  }

  async updateRemainingParticipantsForCall(
    t: DbTx,
    input: {
      call_id: string;
      exclude_user_id?: number;
      exclude_device_id?: string;
      participant_status: number;
      left_at?: Date | null;
      end_reason?: number | null;
    }
  ) {
    return t.manyOrNone<CallParticipantRecord>(
      `
      UPDATE call_participants
      SET
        participant_status = $4,
        left_at = COALESCE($5, left_at),
        end_reason = COALESCE($6, end_reason),
        updated_at = NOW()
      WHERE call_id = $1
        AND ($2::bigint IS NULL OR user_id <> $2)
        AND ($3::text IS NULL OR device_id <> $3)
        AND participant_status IN (1, 2, 3, 4)
      RETURNING *
      `,
      [
        input.call_id,
        input.exclude_user_id ?? null,
        input.exclude_device_id ?? null,
        input.participant_status,
        input.left_at ?? null,
        input.end_reason ?? null
      ]
    );
  }

  async countParticipantsByStatus(t: DbTx, callId: string, statuses: number[]) {
    const row = await t.one<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM call_participants
      WHERE call_id = $1
        AND participant_status = ANY($2::smallint[])
      `,
      [callId, statuses]
    );

    return Number(row.count);
  }

  async countParticipantsByStatusGlobal(callId: string, statuses: number[]) {
    const row = await pg.one<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM call_participants
      WHERE call_id = $1
        AND participant_status = ANY($2::smallint[])
      `,
      [callId, statuses]
    );

    return Number(row.count);
  }

  async insertCallEvent(
    t: DbTx,
    input: {
      call_id: string;
      conversation_id: string;
      event_type: string;
      request_id?: string | null;
      sender_user_id?: number | null;
      sender_device_id?: string | null;
      payload: Record<string, unknown> | string;
    }
  ) {
    const payload =
      typeof input.payload === "string"
        ? input.payload
        : JSON.stringify(input.payload);

    return t.one<CallEventRecord>(
      `
      INSERT INTO call_events (
        call_id,
        conversation_id,
        event_type,
        request_id,
        sender_user_id,
        sender_device_id,
        payload,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
      RETURNING *
      `,
      [
        input.call_id,
        input.conversation_id,
        input.event_type,
        input.request_id ?? null,
        input.sender_user_id ?? null,
        input.sender_device_id ?? null,
        payload
      ]
    );
  }
}

export default new CallRepository();
