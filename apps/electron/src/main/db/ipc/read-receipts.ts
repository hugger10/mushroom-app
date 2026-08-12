import { ipcMain } from "electron";
import type { ConversationSyncPayload } from "@mushroom/shared";
import { getCurrentUserDbPath, getDb } from "../connection";
import log from "../../../utils/log";

// 群已读高水位：SQLite 持久化 + 进程内 Map 热缓存。
//
// 这份状态用于渲染"我发出的群消息是否被至少一名成员读过"。它不是
// 本人的会话已读位置；服务端仍通过 conversation_user_state 持久化真实
// 高水位，本地表只是一个可离线展示、可被 /read-state 校准的缓存。
//
// 内存结构：`Map<serverConversationId, Map<readerUserId, lastReadSeq>>`。
// SQLite 结构：`local_group_read_states(server_conversation_id,
// reader_user_id, last_read_seq)`，写入永远取 max，避免回退。
//
// 生命周期：`registerReadReceiptHandlers` 在进程内只由 `index.ts` 调用
// 一次（启动时）。账号 DB 切换时用 currentDbPath 识别并重新 hydrate。
const groupReadCache = new Map<string, Map<number, number>>();
let hydratedDbPath: string | null = null;

function ensureGroupReadCacheHydrated() {
  const dbPath = getCurrentUserDbPath();
  if (hydratedDbPath === dbPath) {
    return;
  }
  groupReadCache.clear();
  hydratedDbPath = dbPath;
  if (!dbPath) {
    return;
  }
  const rows = getDb()
    .prepare(
      `
      SELECT server_conversation_id,
             reader_user_id,
             last_read_seq
      FROM local_group_read_states
      WHERE last_read_seq > 0
    `
    )
    .all() as Array<{
    server_conversation_id?: string;
    reader_user_id?: number;
    last_read_seq?: number;
  }>;
  for (const row of rows) {
    const conversationId = String(row.server_conversation_id ?? "").trim();
    const readerUserId = Number(row.reader_user_id ?? 0);
    const lastReadSeq = Number(row.last_read_seq ?? 0);
    if (!conversationId || readerUserId <= 0 || lastReadSeq <= 0) {
      continue;
    }
    let bucket = groupReadCache.get(conversationId);
    if (!bucket) {
      bucket = new Map();
      groupReadCache.set(conversationId, bucket);
    }
    bucket.set(readerUserId, lastReadSeq);
  }
}

function persistGroupReadState(params: {
  serverConversationId: string;
  readerUserId: number;
  lastReadSeq: number;
  updatedAt?: string | null;
}) {
  getDb()
    .prepare(
      `
      INSERT INTO local_group_read_states (
        server_conversation_id,
        reader_user_id,
        last_read_seq,
        updated_at
      ) VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
      ON CONFLICT(server_conversation_id, reader_user_id) DO UPDATE SET
        last_read_seq = CASE
          WHEN excluded.last_read_seq > local_group_read_states.last_read_seq
          THEN excluded.last_read_seq
          ELSE local_group_read_states.last_read_seq
        END,
        updated_at = CASE
          WHEN excluded.last_read_seq > local_group_read_states.last_read_seq
          THEN excluded.updated_at
          ELSE local_group_read_states.updated_at
        END
    `
    )
    .run(
      params.serverConversationId,
      params.readerUserId,
      params.lastReadSeq,
      params.updatedAt ?? null
    );
}

/**
 * 跨模块清理接口：删除指定会话的群已读高水位（SQLite + 内存缓存）。
 * 供 conversations handler 在删除 / 软删除 / 清空会话时调用。
 */
export function clearGroupReadCacheForConversation(
  serverConversationId: string
): boolean {
  if (!serverConversationId) return false;
  ensureGroupReadCacheHydrated();
  const had = groupReadCache.delete(serverConversationId);
  getDb()
    .prepare(
      `DELETE FROM local_group_read_states WHERE server_conversation_id = ?`
    )
    .run(serverConversationId);
  return had;
}

export function registerReadReceiptHandlers() {
  ipcMain.handle(
    "db:mark-conversation-read",
    (_event, clientConversationId) => {
      const db = getDb();
      const conversation = db
        .prepare(
          `
        SELECT last_sync_sequence
             , tail_loaded_to_seq
        FROM local_conversations
        WHERE client_conversation_id = ?
      `
        )
        .get(clientConversationId) as
        | { last_sync_sequence?: number; tail_loaded_to_seq?: number }
        | undefined;
      const readSequence = Math.max(
        Number(conversation?.last_sync_sequence ?? 0),
        Number(conversation?.tail_loaded_to_seq ?? 0)
      );

      db.prepare(
        `
        UPDATE local_conversations
        SET unread_count = 0,
            mention_unread_count = 0,
            last_read_sequence = COALESCE(?, last_read_sequence, 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE client_conversation_id = ?
      `
      ).run(readSequence, clientConversationId);

      return { readSequence };
    }
  );

  ipcMain.handle("db:apply-conversation-read", (event, payload) => {
    const result = getDb()
      .prepare(
        `
        UPDATE local_conversations
        SET unread_count = ?,
            mention_unread_count = CASE WHEN ? = 0 THEN 0 ELSE mention_unread_count END,
            last_read_sequence = CASE
              WHEN last_read_sequence > ? THEN last_read_sequence
              ELSE ?
            END,
            updated_at = COALESCE(?, CURRENT_TIMESTAMP)
        WHERE server_conversation_id = ?
      `
      )
      .run(
        payload.unreadCount ?? 0,
        payload.unreadCount ?? 0,
        payload.readSequence ?? 0,
        payload.readSequence ?? 0,
        payload.updatedAt ?? null,
        payload.serverConversationId
      );

    if (result.changes > 0) {
      const row = getDb()
        .prepare(
          `SELECT client_conversation_id FROM local_conversations WHERE server_conversation_id = ?`
        )
        .get(payload.serverConversationId) as
        | { client_conversation_id?: string }
        | undefined;
      const clientConversationId = row?.client_conversation_id
        ? String(row.client_conversation_id)
        : null;
      if (clientConversationId) {
        event.sender.send("conversation-sync", {
          source: "db:apply-conversation-read",
          affectedClientConversationIds: [clientConversationId]
        } satisfies ConversationSyncPayload);
      } else {
        // We just successfully UPDATEd a row matched on
        // `server_conversation_id` but cannot read it back. This indicates
        // an inconsistent local DB state. Skip the sync emit instead of
        // forcing a heavyweight `allConversationsAffected: true` refresh
        // for what is most likely a single missing row.
        log.warn(
          "db:apply-conversation-read updated a row but failed to look up its client_conversation_id; skipping sync emit",
          { serverConversationId: payload.serverConversationId }
        );
      }
    }

    return result;
  });

  ipcMain.handle(
    "db:group-read:apply",
    (
      event,
      payload: {
        serverConversationId?: string | number;
        readerUserId?: number;
        lastReadSeq?: number;
        messageSenderId?: number;
        updatedAt?: string;
      }
    ) => {
      const conversationId = String(payload?.serverConversationId ?? "").trim();
      const readerUserId = Number(payload?.readerUserId ?? 0);
      const lastReadSeq = Number(payload?.lastReadSeq ?? 0);
      if (!conversationId || readerUserId <= 0 || lastReadSeq <= 0) {
        return { changed: false };
      }
      // 防御性：sender === reader 的异常帧静默忽略。
      const senderUserId = Number(payload?.messageSenderId ?? 0);
      if (senderUserId > 0 && senderUserId === readerUserId) {
        return { changed: false };
      }
      ensureGroupReadCacheHydrated();
      let bucket = groupReadCache.get(conversationId);
      if (!bucket) {
        bucket = new Map();
        groupReadCache.set(conversationId, bucket);
      }
      const previous = bucket.get(readerUserId) ?? 0;
      if (lastReadSeq <= previous) {
        return { changed: false };
      }
      persistGroupReadState({
        serverConversationId: conversationId,
        readerUserId,
        lastReadSeq,
        updatedAt: payload?.updatedAt ?? null
      });
      bucket.set(readerUserId, lastReadSeq);
      event.sender.send("group-read-update", {
        serverConversationId: conversationId,
        readerUserId,
        lastReadSeq,
        messageSenderId: senderUserId || null,
        updatedAt: payload?.updatedAt ?? null
      });
      return { changed: true };
    }
  );

  ipcMain.handle(
    "db:group-read:bulk-apply",
    (
      event,
      payload: {
        serverConversationId?: string | number;
        entries?: Array<{ user_id?: number; last_read_seq?: number }>;
      }
    ) => {
      const conversationId = String(payload?.serverConversationId ?? "").trim();
      const entries = Array.isArray(payload?.entries) ? payload!.entries! : [];
      if (!conversationId || entries.length === 0) {
        return { changed: false };
      }
      ensureGroupReadCacheHydrated();
      let bucket = groupReadCache.get(conversationId);
      if (!bucket) {
        bucket = new Map();
        groupReadCache.set(conversationId, bucket);
      }
      const updated: Array<{ readerUserId: number; lastReadSeq: number }> = [];
      for (const entry of entries) {
        const readerUserId = Number(entry?.user_id ?? 0);
        const lastReadSeq = Number(entry?.last_read_seq ?? 0);
        if (readerUserId <= 0 || lastReadSeq <= 0) continue;
        const previous = bucket.get(readerUserId) ?? 0;
        if (lastReadSeq <= previous) continue;
        persistGroupReadState({
          serverConversationId: conversationId,
          readerUserId,
          lastReadSeq
        });
        bucket.set(readerUserId, lastReadSeq);
        updated.push({ readerUserId, lastReadSeq });
      }
      // 关键修复：bulk-apply 是冷启动 / 重连的"全量补齐"路径。即便本次合并
      // 没有推进任何高水位（updated 为空），也必须把该会话当前 bucket 的
      // 全量快照下发给 renderer。否则 renderer 在整页 reload 后 React state
      // 被清空，而 main 进程缓存仍残留旧值，重新拉取会因单调去重被判定为
      // "无变化"而不下发，导致群已读勾永远卡在单勾、无法恢复双勾。
      // renderer 的 onGroupReadUpdate 对 bulk 做幂等单调合并，收全量快照零副作用。
      const snapshot: Array<{ readerUserId: number; lastReadSeq: number }> = [];
      for (const [readerUserId, lastReadSeq] of bucket.entries()) {
        snapshot.push({ readerUserId, lastReadSeq });
      }
      if (snapshot.length > 0) {
        event.sender.send("group-read-update", {
          serverConversationId: conversationId,
          bulk: snapshot
        });
      }
      return { changed: updated.length > 0 };
    }
  );

  ipcMain.handle(
    "db:group-read:get",
    (_event, serverConversationId: string | number) => {
      const conversationId = String(serverConversationId ?? "").trim();
      if (!conversationId) {
        return {} as Record<number, number>;
      }
      ensureGroupReadCacheHydrated();
      const bucket = groupReadCache.get(conversationId);
      if (!bucket) return {} as Record<number, number>;
      const out: Record<number, number> = {};
      for (const [readerId, seq] of bucket.entries()) {
        out[readerId] = seq;
      }
      return out;
    }
  );

  ipcMain.handle("db:group-read:get-all", () => {
    ensureGroupReadCacheHydrated();
    const out: Record<string, Record<number, number>> = {};
    for (const [conversationId, bucket] of groupReadCache.entries()) {
      const inner: Record<number, number> = {};
      for (const [readerId, seq] of bucket.entries()) {
        inner[readerId] = seq;
      }
      out[conversationId] = inner;
    }
    return out;
  });

  ipcMain.handle(
    "db:group-read:clear",
    (_event, serverConversationId: string | number) => {
      const conversationId = String(serverConversationId ?? "").trim();
      if (!conversationId) return { cleared: false };
      ensureGroupReadCacheHydrated();
      const had = groupReadCache.delete(conversationId);
      getDb()
        .prepare(
          `DELETE FROM local_group_read_states WHERE server_conversation_id = ?`
        )
        .run(conversationId);
      return { cleared: had };
    }
  );

  // 用户切到"关闭已读回执"时一次性清空所有群已读高水位缓存，
  // 避免重新打开时历史 ✓✓ 立刻冒出（"幽灵已读"）。
  ipcMain.handle("db:group-read:clear-all", () => {
    ensureGroupReadCacheHydrated();
    const had = groupReadCache.size > 0;
    groupReadCache.clear();
    getDb().prepare(`DELETE FROM local_group_read_states`).run();
    return { cleared: had };
  });
}
