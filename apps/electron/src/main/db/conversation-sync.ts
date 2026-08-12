import type Database from "better-sqlite3";
import {
  calculateContiguousSyncSequence as sharedCalculateContiguousSyncSequence,
  calculateTailWindow as sharedCalculateTailWindow,
  normalizeProgress as sharedNormalizeProgress,
  reconcileProgress as sharedReconcileProgress
} from "@mushroom/shared";

export function getConversationVisibilityState(
  dbInstance: InstanceType<typeof Database>,
  clientConversationId: string
) {
  return (dbInstance
    .prepare(
      `
      SELECT
        COALESCE(local_hidden_before_seq, 0) AS local_hidden_before_seq,
        COALESCE(is_locally_deleted, 0) AS is_locally_deleted,
        COALESCE(last_sync_sequence, 0) AS last_sync_sequence,
        COALESCE(last_server_sequence, COALESCE(last_sync_sequence, 0)) AS last_server_sequence,
        COALESCE(tail_loaded_to_seq, 0) AS tail_loaded_to_seq,
        COALESCE(last_read_sequence, 0) AS last_read_sequence
      FROM local_conversations
      WHERE client_conversation_id = ?
      `
    )
    .get(clientConversationId) ?? null) as {
    local_hidden_before_seq?: number;
    is_locally_deleted?: number;
    last_sync_sequence?: number;
    last_server_sequence?: number;
    tail_loaded_to_seq?: number;
    last_read_sequence?: number;
  } | null;
}

export function calculateConversationCutoff(
  dbInstance: InstanceType<typeof Database>,
  clientConversationId: string
) {
  const conversation = getConversationVisibilityState(
    dbInstance,
    clientConversationId
  );
  const message = dbInstance
    .prepare(
      `
      SELECT MAX(COALESCE(sequence, 0)) AS max_sequence
      FROM local_messages
      WHERE client_conversation_id = ?
      `
    )
    .get(clientConversationId) as { max_sequence?: number | null } | undefined;

  return Math.max(
    Number(conversation?.local_hidden_before_seq ?? 0),
    Number(conversation?.last_sync_sequence ?? 0),
    Number(conversation?.last_server_sequence ?? 0),
    Number(conversation?.tail_loaded_to_seq ?? 0),
    Number(message?.max_sequence ?? 0)
  );
}

export function shouldStoreConversationMessage(
  dbInstance: InstanceType<typeof Database>,
  clientConversationId: string,
  sequence?: number | null
) {
  const normalizedSequence = Number(sequence ?? 0);
  if (normalizedSequence <= 0) {
    return true;
  }

  const conversation = getConversationVisibilityState(
    dbInstance,
    clientConversationId
  );
  return (
    normalizedSequence > Number(conversation?.local_hidden_before_seq ?? 0)
  );
}

export function upsertConversationBackfillJob(
  dbInstance: InstanceType<typeof Database>,
  clientConversationId: string
) {
  const conversation = dbInstance
    .prepare(
      `
      SELECT
        client_conversation_id,
        server_conversation_id,
        unread_count,
        last_message_time,
        last_sync_sequence,
        last_server_sequence,
        tail_loaded_from_seq,
        tail_loaded_to_seq,
        history_complete,
        needs_backfill,
        is_locally_deleted
      FROM local_conversations
      WHERE client_conversation_id = ?
      `
    )
    .get(clientConversationId) as
    | {
        client_conversation_id?: string;
        server_conversation_id?: string | null;
        unread_count?: number;
        last_message_time?: string | null;
        last_sync_sequence?: number;
        last_server_sequence?: number;
        tail_loaded_from_seq?: number;
        tail_loaded_to_seq?: number;
        history_complete?: number;
        needs_backfill?: number;
        is_locally_deleted?: number;
      }
    | undefined;

  if (!conversation) {
    dbInstance
      .prepare(
        `DELETE FROM sync_backfill_jobs WHERE client_conversation_id = ?`
      )
      .run(clientConversationId);
    return;
  }

  if (
    Number(conversation.is_locally_deleted || 0) > 0 ||
    Number(conversation.needs_backfill || 0) <= 0 ||
    !conversation.server_conversation_id
  ) {
    dbInstance
      .prepare(
        `DELETE FROM sync_backfill_jobs WHERE client_conversation_id = ?`
      )
      .run(clientConversationId);
    return;
  }

  const tailLoadedToSequence = Number(conversation.tail_loaded_to_seq || 0);
  const lastSyncSequence = Number(conversation.last_sync_sequence || 0);
  const lastServerSequence = Number(conversation.last_server_sequence || 0);
  const historyComplete = Number(conversation.history_complete || 0);
  const jobKind =
    tailLoadedToSequence <= 0 && lastSyncSequence <= 0
      ? "tail"
      : lastServerSequence > Math.max(tailLoadedToSequence, lastSyncSequence)
        ? "delta"
        : historyComplete === 0
          ? "history"
          : "delta";
  const priorityBase =
    jobKind === "tail" ? 300 : jobKind === "delta" ? 200 : 100;
  const priority =
    priorityBase + Math.min(Number(conversation.unread_count || 0), 99);

  dbInstance
    .prepare(
      `
      INSERT INTO sync_backfill_jobs (
        client_conversation_id,
        job_kind,
        priority,
        payload,
        updated_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(client_conversation_id) DO UPDATE SET
        job_kind = excluded.job_kind,
        priority = excluded.priority,
        payload = excluded.payload,
        updated_at = CURRENT_TIMESTAMP
      `
    )
    .run(
      clientConversationId,
      jobKind,
      priority,
      JSON.stringify({
        server_conversation_id: conversation.server_conversation_id,
        unread_count: Number(conversation.unread_count || 0),
        last_message_time: conversation.last_message_time ?? null
      })
    );
}

export function getConversationSyncProgress(
  dbInstance: InstanceType<typeof Database>,
  clientConversationId: string
) {
  return (dbInstance
    .prepare(
      `
      SELECT
        COALESCE(last_sync_sequence, 0) AS last_sync_sequence,
        COALESCE(last_server_sequence, COALESCE(last_sync_sequence, 0)) AS last_server_sequence,
        COALESCE(tail_loaded_from_seq, 0) AS tail_loaded_from_seq,
        COALESCE(tail_loaded_to_seq, 0) AS tail_loaded_to_seq,
        COALESCE(history_complete, 0) AS history_complete,
        COALESCE(local_hidden_before_seq, 0) AS local_hidden_before_seq
      FROM local_conversations
      WHERE client_conversation_id = ?
      `
    )
    .get(clientConversationId) ?? null) as {
    last_sync_sequence?: number;
    last_server_sequence?: number;
    tail_loaded_from_seq?: number;
    tail_loaded_to_seq?: number;
    history_complete?: number;
    local_hidden_before_seq?: number;
  } | null;
}

export function calculateContiguousSyncSequence(
  dbInstance: InstanceType<typeof Database>,
  clientConversationId: string,
  baseSequence: number
) {
  const rows = dbInstance
    .prepare(
      `
      SELECT sequence
      FROM local_messages
      WHERE client_conversation_id = ?
        AND COALESCE(sequence, 0) > ?
      ORDER BY sequence ASC
      `
    )
    .all(clientConversationId, baseSequence) as Array<{
    sequence?: number | null;
  }>;

  return sharedCalculateContiguousSyncSequence(
    baseSequence,
    rows.map(row => Number(row.sequence || 0))
  );
}

export function calculateTailWindow(
  dbInstance: InstanceType<typeof Database>,
  clientConversationId: string
) {
  const rows = dbInstance
    .prepare(
      `
      SELECT sequence
      FROM local_messages
      WHERE client_conversation_id = ?
        AND COALESCE(sequence, 0) > 0
      ORDER BY sequence DESC
      `
    )
    .all(clientConversationId) as Array<{
    sequence?: number | null;
  }>;

  const tail = sharedCalculateTailWindow(
    rows.map(row => Number(row.sequence || 0))
  );
  return {
    tailLoadedFromSequence: tail.tail_loaded_from_seq,
    tailLoadedToSequence: tail.tail_loaded_to_seq
  };
}

export function reconcileConversationSyncProgress(
  dbInstance: InstanceType<typeof Database>,
  clientConversationId: string,
  observedServerSequence?: number | null
) {
  const currentProgress = getConversationSyncProgress(
    dbInstance,
    clientConversationId
  );
  if (!currentProgress) {
    return null;
  }

  const progress = sharedNormalizeProgress({
    last_sync_sequence: Number(currentProgress.last_sync_sequence ?? 0),
    last_server_sequence: Number(currentProgress.last_server_sequence ?? 0),
    tail_loaded_from_seq: Number(currentProgress.tail_loaded_from_seq ?? 0),
    tail_loaded_to_seq: Number(currentProgress.tail_loaded_to_seq ?? 0),
    history_complete:
      Number(currentProgress.history_complete ?? 0) === 1 ? 1 : 0,
    local_hidden_before_seq: Number(
      currentProgress.local_hidden_before_seq ?? 0
    )
  });
  const baseSequence = Math.max(
    progress.last_sync_sequence,
    progress.local_hidden_before_seq
  );
  const nextContiguous = calculateContiguousSyncSequence(
    dbInstance,
    clientConversationId,
    baseSequence
  );
  const { tailLoadedFromSequence, tailLoadedToSequence } = calculateTailWindow(
    dbInstance,
    clientConversationId
  );

  const result = sharedReconcileProgress({
    ...progress,
    next_contiguous_sequence: nextContiguous,
    tail_loaded_from_seq: tailLoadedFromSequence,
    tail_loaded_to_seq: tailLoadedToSequence,
    observed_server_sequence: observedServerSequence ?? null
  });

  dbInstance
    .prepare(
      `
      UPDATE local_conversations
      SET
        last_sync_sequence = ?,
        last_server_sequence = ?,
        sync_gap_detected = ?,
        tail_loaded_from_seq = ?,
        tail_loaded_to_seq = ?,
        history_complete = ?,
        needs_backfill = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE client_conversation_id = ?
      `
    )
    .run(
      result.last_sync_sequence,
      result.last_server_sequence,
      result.sync_gap_detected,
      result.tail_loaded_from_seq,
      result.tail_loaded_to_seq,
      result.history_complete,
      result.needs_backfill,
      clientConversationId
    );

  upsertConversationBackfillJob(dbInstance, clientConversationId);

  return result;
}
