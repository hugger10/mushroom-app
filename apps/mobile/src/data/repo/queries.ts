import type {
  Conversation,
  Message,
  MessageStateRecord
} from "@mushroom/shared";
import type { LocalMessageReactionRecord } from "@mushroom/app-core";
import type {
  NitroSQLiteConnection,
  QueryResult,
  QueryResultRow
} from "react-native-nitro-sqlite";
import {
  applyMessageState,
  cloneConversation,
  compareMessagesForTimeline,
  getConversationHiddenFloor,
  safeJsonParse
} from "./helpers";

/**
 * 与 SQLite 句柄耦合的辅助函数集合。所有签名保持原 `sqlite-data-repository.ts`
 * 字面一致（接收 `db` 作为首参），方便 contacts / conversations / messages /
 * lifecycle 等子模块共享，避免重复 SQL 字符串与"读 → 反序列化 → 反应水化"链路。
 *
 * 跨子模块共享的核心入口：
 *   - `loadConversationByClientId`：messages / lifecycle / conversations 都需要。
 *   - `upsertConversationRecord`：messages（重算进度）/ conversations / lifecycle
 *     的共同落盘出口，内含**两段 ON CONFLICT** 的精细规则，详见函数体内注释。
 *   - `loadMessagesForConversation`：listMessages / upsertMessages 复算 /
 *     clearConversationMessages / softDeleteConversation 共享的"全量按时间轴
 *     拉取 + reaction 水化"路径。
 *   - `loadRecentMessagesForConversation`：snapshot/listRecentMessages 专用的
 *     "sequence DESC 早停 + outbox 补齐 + reaction 水化"路径。
 */

export type SQLiteRow = QueryResultRow;

export function rowsFromResult<Row extends SQLiteRow>(
  result: QueryResult<Row>
): Row[] {
  return (result.results as Row[] | undefined) ?? result.rows?._array ?? [];
}

export async function queryRows<Row extends SQLiteRow>(
  db: NitroSQLiteConnection,
  query: string,
  params: Parameters<NitroSQLiteConnection["executeAsync"]>[1] = []
) {
  return rowsFromResult(await db.executeAsync<Row>(query, params));
}

export async function findMessageState(
  db: NitroSQLiteConnection,
  serverMessageId: string
) {
  if (!serverMessageId) {
    return null;
  }

  const rows = await queryRows<SQLiteRow>(
    db,
    `SELECT payload FROM mobile_message_states WHERE message_id = ? LIMIT 1`,
    [serverMessageId]
  );
  return rows[0]?.payload
    ? safeJsonParse<MessageStateRecord>(rows[0].payload, null as never)
    : null;
}

export async function serializeMessageForPersistence(
  db: NitroSQLiteConnection,
  message: Message
) {
  const state = await findMessageState(db, message.server_message_id);
  const nextMessage = state ? applyMessageState(message, state) : message;
  return JSON.stringify(nextMessage);
}

export async function loadConversationByClientId(
  db: NitroSQLiteConnection,
  clientConversationId: string
) {
  const rows = await queryRows<SQLiteRow>(
    db,
    `SELECT payload FROM mobile_conversations WHERE client_conversation_id = ? LIMIT 1`,
    [clientConversationId]
  );
  return rows[0]?.payload
    ? safeJsonParse<Conversation>(rows[0].payload, null as never)
    : null;
}

export async function upsertConversationRecord(
  db: NitroSQLiteConnection,
  conversation: Conversation
) {
  // Dedup by server_conversation_id: if a row with the same server id but a
  // different client id already exists, reuse the existing client id to prevent
  // the same server conversation from appearing twice in the list.
  if (conversation.server_conversation_id) {
    const existing = await queryRows<SQLiteRow>(
      db,
      `SELECT client_conversation_id FROM mobile_conversations
       WHERE server_conversation_id = ? LIMIT 1`,
      [conversation.server_conversation_id]
    );
    if (
      existing.length > 0 &&
      existing[0].client_conversation_id !== conversation.client_conversation_id
    ) {
      // Remove the duplicate row that is about to be orphaned
      await db.executeAsync(
        `DELETE FROM mobile_conversations WHERE client_conversation_id = ?`,
        [conversation.client_conversation_id]
      );
      // Rewrite incoming data to use the pre-existing client id
      conversation = {
        ...conversation,
        client_conversation_id: existing[0].client_conversation_id as string
      };
    }
  }

  // NOTE: We declare two ON CONFLICT targets because two writers can race on
  // the same server_conversation_id with different freshly-minted
  // client_conversation_id values (e.g. startup `runMobileSync` vs.
  // `ensureDirectConversation`). The defensive SELECT above handles the serial
  // case; the second ON CONFLICT clause guarantees the concurrent case cannot
  // raise `UNIQUE constraint failed: mobile_conversations.server_conversation_id`.
  // The second arbiter is a *partial* unique index (see ensureSchema), so per
  // SQLite's UPSERT rules its WHERE predicate must be repeated here verbatim
  // — otherwise SQLite raises
  // `2nd ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint`.
  // We intentionally do NOT update client_conversation_id in the server-id
  // conflict branch: SQLite forbids changing the primary key in UPSERT, and
  // preserving the pre-existing client id matches the dedup intent above.
  await db.executeAsync(
    `INSERT INTO mobile_conversations (
       client_conversation_id,
       server_conversation_id,
       last_message_time,
       is_pinned,
       is_archived,
       payload
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_conversation_id) DO UPDATE SET
       server_conversation_id = excluded.server_conversation_id,
       last_message_time = excluded.last_message_time,
       is_pinned = excluded.is_pinned,
       is_archived = excluded.is_archived,
       payload = excluded.payload
     ON CONFLICT(server_conversation_id)
       WHERE server_conversation_id IS NOT NULL AND server_conversation_id <> ''
     DO UPDATE SET
       last_message_time = excluded.last_message_time,
       is_pinned = excluded.is_pinned,
       is_archived = excluded.is_archived,
       payload = excluded.payload`,
    [
      conversation.client_conversation_id,
      conversation.server_conversation_id,
      conversation.last_message_time || "",
      Number(conversation.is_pinned || 0),
      Number(conversation.is_archived || 0),
      JSON.stringify(cloneConversation(conversation))
    ]
  );
}

export async function loadMessagesForConversation(
  db: NitroSQLiteConnection,
  clientConversationId: string
) {
  const rows = await queryRows<SQLiteRow>(
    db,
    `SELECT payload
     FROM mobile_messages
     WHERE client_conversation_id = ?
     ORDER BY sequence ASC, created_at ASC, client_message_id ASC`,
    [clientConversationId]
  );
  const messages = rows
    .map(row => safeJsonParse<Message>(row.payload, null as never))
    .filter((item): item is Message => item !== null)
    .sort(compareMessagesForTimeline);
  return hydrateMessagesWithReactions(db, messages);
}

/**
 * 仅加载某会话最近的 N 条可见消息，命中 idx_mobile_messages_conversation
 * 索引早停，避免在历史很长的会话上扫描整张表。
 *
 * 实现分两段：
 *   1) sequenced 主查询：sequence > hiddenFloor ORDER BY sequence DESC LIMIT N。
 *   2) 仅当 sequenced 不足以填满 limit 时，补查未编号本地消息
 *      (COALESCE(sequence,0) <= 0)，按 created_at DESC 取剩余配额。
 *
 * 这是与 Electron 端 db:get-messages 无 cursor 分支对齐的"两步法 + LIMIT
 * 下推"实现。
 */
export async function loadRecentMessagesForConversation(
  db: NitroSQLiteConnection,
  clientConversationId: string,
  limit: number
) {
  const safeLimit = Math.max(1, Math.floor(limit) || 1);
  const conversation = await loadConversationByClientId(
    db,
    clientConversationId
  );
  const hiddenFloor = conversation
    ? getConversationHiddenFloor(conversation)
    : 0;

  const sequencedRows = await queryRows<SQLiteRow>(
    db,
    `SELECT payload
     FROM mobile_messages
     WHERE client_conversation_id = ?
       AND sequence > ?
     ORDER BY sequence DESC
     LIMIT ?`,
    [clientConversationId, hiddenFloor, safeLimit]
  );

  const sequencedMessages = sequencedRows
    .map(row => safeJsonParse<Message>(row.payload, null as never))
    .filter((item): item is Message => item !== null);

  let outboxMessages: Message[] = [];
  if (sequencedMessages.length < safeLimit) {
    const remaining = safeLimit - sequencedMessages.length;
    const outboxRows = await queryRows<SQLiteRow>(
      db,
      `SELECT payload
       FROM mobile_messages
       WHERE client_conversation_id = ?
         AND COALESCE(sequence, 0) <= 0
       ORDER BY created_at DESC
       LIMIT ?`,
      [clientConversationId, remaining]
    );
    outboxMessages = outboxRows
      .map(row => safeJsonParse<Message>(row.payload, null as never))
      .filter((item): item is Message => item !== null);
  }

  // 合并后按时间轴排序得到 ASC 序，与 listMessages 的输出语义保持一致。
  const merged = [...sequencedMessages, ...outboxMessages].sort(
    compareMessagesForTimeline
  );
  return hydrateMessagesWithReactions(db, merged);
}

export async function loadReactionsForMessageIds(
  db: NitroSQLiteConnection,
  messageIds: string[]
): Promise<LocalMessageReactionRecord[]> {
  if (messageIds.length === 0) {
    return [];
  }
  const placeholders = messageIds.map(() => "?").join(",");
  const rows = await queryRows<SQLiteRow>(
    db,
    `SELECT message_id, conversation_id, user_id, emoji, sequence, updated_at
     FROM mobile_message_reactions
     WHERE message_id IN (${placeholders}) AND is_deleted = 0
     ORDER BY message_id, updated_at ASC`,
    messageIds
  );
  return rows.map(row => ({
    message_id: String(row.message_id),
    conversation_id: String(row.conversation_id),
    user_id: Number(row.user_id),
    emoji: String(row.emoji),
    sequence: Number(row.sequence ?? 0),
    updated_at: String(row.updated_at)
  }));
}

export async function hydrateMessagesWithReactions(
  db: NitroSQLiteConnection,
  messages: Message[]
): Promise<Message[]> {
  if (messages.length === 0) {
    return messages;
  }
  const ids = Array.from(
    new Set(
      messages
        .map(m => String(m.server_message_id || ""))
        .filter(id => id.length > 0)
    )
  );
  if (ids.length === 0) {
    return messages;
  }
  const reactions = await loadReactionsForMessageIds(db, ids);
  if (reactions.length === 0) {
    return messages;
  }
  const grouped = new Map<string, LocalMessageReactionRecord[]>();
  for (const r of reactions) {
    const list = grouped.get(r.message_id) ?? [];
    list.push(r);
    grouped.set(r.message_id, list);
  }
  return messages.map(message => {
    const list = grouped.get(String(message.server_message_id || ""));
    if (!list || list.length === 0) {
      return message;
    }
    return {
      ...message,
      reactions: list.map(entry => ({
        user_id: entry.user_id,
        emoji: entry.emoji,
        updated_at: entry.updated_at
      }))
    };
  });
}
