import { ipcMain } from "electron";
import { getDb } from "../connection";
import log from "../../../utils/log";
import { fmtCount } from "../shared";
import {
  normalizeMessageRow,
  normalizeMessageRows,
  attachReactionsToRow
} from "../normalizers";

export function registerMessagesReadHandlers() {
  ipcMain.handle(
    "db:get-messages",
    (
      _event,
      clientConversationId,
      limit,
      cursor?: {
        beforeSequence?: number;
        beforeLocalCreatedAt?: string;
      }
    ) => {
      log.debug(
        "Fetching messages for conversation:",
        clientConversationId,
        cursor
      );
      const db = getDb();
      let stmt;
      if (cursor?.beforeSequence && Number(cursor.beforeSequence) > 0) {
        stmt = db.prepare(`
        SELECT t1.client_message_id, CAST(t1.server_message_id AS text) AS server_message_id, t1.client_conversation_id, 
        t1.sequence, t1.sender_id, t1.content, t1.type, t1.created_at, t1.updated_at, t1.status, t1.is_recalled,
        t1.is_favorited, t1.is_pinned,
        t1.reply_to_message_id, t1.reply_to_sender_id, t1.reply_to_sender_nickname, t1.reply_to_text,
        om.last_error,
        COALESCE(t2.nickname, t1.sender_nickname) AS sender_nickname,
        COALESCE(t2.avatar_url, t1.sender_avatar) AS sender_avatar
        FROM local_messages t1
        LEFT JOIN local_conversation_members t2
          ON t1.client_conversation_id = t2.conversation_id AND t1.sender_id = t2.user_id
        LEFT JOIN outgoing_messages om
          ON t1.client_message_id = om.client_message_id
        JOIN local_conversations c
          ON c.client_conversation_id = t1.client_conversation_id
        WHERE t1.client_conversation_id = ?
          AND COALESCE(t1.sequence, 0) > 0
          AND t1.sequence > COALESCE(c.local_hidden_before_seq, 0)
          AND t1.sequence < ?
        ORDER BY
          t1.sequence DESC,
          t1.created_at DESC
        LIMIT ?
      `);
        const rows = stmt.all(
          clientConversationId,
          cursor.beforeSequence,
          limit
        );
        log.debug(
          "Fetched messages " +
            fmtCount(rows) +
            " for conversation: " +
            clientConversationId
        );
        return normalizeMessageRows(rows);
      } else if (cursor?.beforeLocalCreatedAt) {
        stmt = db.prepare(`
        SELECT t1.client_message_id, CAST(t1.server_message_id AS text) AS server_message_id, t1.client_conversation_id, 
        t1.sequence, t1.sender_id, t1.content, t1.type, t1.created_at, t1.updated_at, t1.status, t1.is_recalled,
        t1.is_favorited, t1.is_pinned,
        t1.reply_to_message_id, t1.reply_to_sender_id, t1.reply_to_sender_nickname, t1.reply_to_text,
        om.last_error,
        COALESCE(t2.nickname, t1.sender_nickname) AS sender_nickname,
        COALESCE(t2.avatar_url, t1.sender_avatar) AS sender_avatar
        FROM local_messages t1
        LEFT JOIN local_conversation_members t2
          ON t1.client_conversation_id = t2.conversation_id AND t1.sender_id = t2.user_id
        LEFT JOIN outgoing_messages om
          ON t1.client_message_id = om.client_message_id
        WHERE t1.client_conversation_id = ?
          AND COALESCE(t1.sequence, 0) <= 0
          AND t1.created_at < ?
        ORDER BY t1.created_at DESC
        LIMIT ?
      `);
        const rows = stmt.all(
          clientConversationId,
          cursor.beforeLocalCreatedAt,
          limit
        );
        log.debug(
          "Fetched messages " +
            fmtCount(rows) +
            " for conversation: " +
            clientConversationId
        );
        return normalizeMessageRows(rows);
      } else {
        // 首屏（无游标）取最近 N 条。
        //
        // 旧实现把 `JOIN local_conversations c` + `ORDER BY CASE ... END,
        // sequence DESC, created_at DESC` + `COALESCE/OR` 谓词写在同一句 SQL
        // 里，SQLite 查询规划器无法用 idx_local_messages_conversation_sequence
        // 做"按 sequence 早停"，对历史很长的会话（例如 test 会话动辄数万行）
        // 会退化成"扫描该会话全部 local_messages 再内存排序"，导致会话切换
        // 卡顿严重。
        //
        // 现在改成两步：先一次主键查询拿到 local_hidden_before_seq 常量，再
        // 用纯 `WHERE sequence > ? ORDER BY sequence DESC LIMIT ?` 命中部分
        // 索引；只有当 sequenced 行不足以填满 limit 时，再补一查 sequence<=0
        // 的本地未发送/无序消息。绝大多数会话 sequenced 行直接打满 limit，
        // outbox 查询被完全跳过。
        const hiddenRow = db
          .prepare(
            `SELECT COALESCE(local_hidden_before_seq, 0) AS hidden
               FROM local_conversations
              WHERE client_conversation_id = ?`
          )
          .get(clientConversationId) as { hidden?: number | null } | undefined;
        const hiddenBefore = Number(hiddenRow?.hidden ?? 0) || 0;
        const limitNum = Math.max(1, Number(limit) || 50);

        const sequencedStmt = db.prepare(`
        SELECT t1.client_message_id, CAST(t1.server_message_id AS text) AS server_message_id, t1.client_conversation_id,
        t1.sequence, t1.sender_id, t1.content, t1.type, t1.created_at, t1.updated_at, t1.status, t1.is_recalled,
        t1.is_favorited, t1.is_pinned,
        t1.reply_to_message_id, t1.reply_to_sender_id, t1.reply_to_sender_nickname, t1.reply_to_text,
        om.last_error,
        COALESCE(t2.nickname, t1.sender_nickname) AS sender_nickname,
        COALESCE(t2.avatar_url, t1.sender_avatar) AS sender_avatar
        FROM local_messages t1
        LEFT JOIN local_conversation_members t2
          ON t1.client_conversation_id = t2.conversation_id AND t1.sender_id = t2.user_id
        LEFT JOIN outgoing_messages om
          ON t1.client_message_id = om.client_message_id
        WHERE t1.client_conversation_id = ?
          AND t1.sequence > ?
        ORDER BY t1.sequence DESC
        LIMIT ?
      `);
        const sequencedRows = sequencedStmt.all(
          clientConversationId,
          hiddenBefore,
          limitNum
        );

        const remaining = Math.max(
          0,
          limitNum - (sequencedRows as unknown[]).length
        );
        let outboxRows: unknown[] = [];
        if (remaining > 0) {
          const outboxStmt = db.prepare(`
        SELECT t1.client_message_id, CAST(t1.server_message_id AS text) AS server_message_id, t1.client_conversation_id,
        t1.sequence, t1.sender_id, t1.content, t1.type, t1.created_at, t1.updated_at, t1.status, t1.is_recalled,
        t1.is_favorited, t1.is_pinned,
        t1.reply_to_message_id, t1.reply_to_sender_id, t1.reply_to_sender_nickname, t1.reply_to_text,
        om.last_error,
        COALESCE(t2.nickname, t1.sender_nickname) AS sender_nickname,
        COALESCE(t2.avatar_url, t1.sender_avatar) AS sender_avatar
        FROM local_messages t1
        LEFT JOIN local_conversation_members t2
          ON t1.client_conversation_id = t2.conversation_id AND t1.sender_id = t2.user_id
        LEFT JOIN outgoing_messages om
          ON t1.client_message_id = om.client_message_id
        WHERE t1.client_conversation_id = ?
          AND COALESCE(t1.sequence, 0) <= 0
        ORDER BY t1.created_at DESC
        LIMIT ?
      `);
          outboxRows = outboxStmt.all(clientConversationId, remaining);
        }

        // 保留旧的合并顺序：sequenced 在前（对应 CASE WHEN ... THEN 0），
        // 本地未编号消息在后（CASE WHEN ... THEN 1）。
        const rows = [...(sequencedRows as unknown[]), ...outboxRows];
        log.debug(
          "Fetched messages " +
            fmtCount(rows) +
            " for conversation: " +
            clientConversationId
        );
        return normalizeMessageRows(rows);
      }
    }
  );

  ipcMain.handle(
    "db:search-messages",
    (_event, clientConversationId: string, keyword: string, limit = 20) => {
      const db = getDb();
      const normalizedKeyword = `%${keyword.trim().toLowerCase()}%`;
      const rows = db
        .prepare(
          `
        SELECT m.client_message_id, CAST(m.server_message_id AS text) AS server_message_id, m.client_conversation_id,
        m.sequence, m.sender_id, m.content, m.type, m.created_at, m.updated_at, m.status, m.is_recalled,
        m.is_favorited, m.is_pinned,
        m.reply_to_message_id, m.reply_to_sender_id, m.reply_to_sender_nickname, m.reply_to_text,
        om.last_error,
        COALESCE(cm.nickname, m.sender_nickname) AS sender_nickname,
        COALESCE(cm.avatar_url, m.sender_avatar) AS sender_avatar
        FROM local_messages m
        LEFT JOIN local_conversation_members cm
          ON m.client_conversation_id = cm.conversation_id
         AND m.sender_id = cm.user_id
        LEFT JOIN outgoing_messages om
          ON m.client_message_id = om.client_message_id
        JOIN local_conversations c
          ON c.client_conversation_id = m.client_conversation_id
        WHERE m.client_conversation_id = ?
          AND (
            COALESCE(m.sequence, 0) <= 0
            OR COALESCE(m.sequence, 0) > COALESCE(c.local_hidden_before_seq, 0)
          )
          AND (
            LOWER(COALESCE(json_extract(m.content, '$.text'), '')) LIKE ?
            OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE ?
            OR LOWER(COALESCE(m.reply_to_text, '')) LIKE ?
          )
        ORDER BY
          CASE WHEN COALESCE(m.sequence, 0) > 0 THEN 0 ELSE 1 END,
          m.sequence DESC,
          m.created_at DESC
        LIMIT ?
      `
        )
        .all(
          clientConversationId,
          normalizedKeyword,
          normalizedKeyword,
          normalizedKeyword,
          limit
        );

      return normalizeMessageRows(rows);
    }
  );

  ipcMain.handle(
    "db:search-all-messages",
    (_event, keyword: string, limit = 30) => {
      const db = getDb();
      const normalizedKeyword = `%${keyword.trim().toLowerCase()}%`;
      const rows = db
        .prepare(
          `
      SELECT m.client_message_id, CAST(m.server_message_id AS text) AS server_message_id, m.client_conversation_id,
      m.sequence, m.sender_id, m.content, m.type, m.created_at, m.updated_at, m.status, m.is_recalled,
      m.is_favorited, m.is_pinned,
      m.reply_to_message_id, m.reply_to_sender_id, m.reply_to_sender_nickname, m.reply_to_text,
      om.last_error,
      COALESCE(cm.nickname, m.sender_nickname) AS sender_nickname,
      COALESCE(cm.avatar_url, m.sender_avatar) AS sender_avatar
      FROM local_messages m
      LEFT JOIN local_conversation_members cm
        ON m.client_conversation_id = cm.conversation_id
       AND m.sender_id = cm.user_id
      LEFT JOIN outgoing_messages om
        ON m.client_message_id = om.client_message_id
      JOIN local_conversations c
        ON c.client_conversation_id = m.client_conversation_id
      WHERE
        (
          COALESCE(m.sequence, 0) <= 0
          OR COALESCE(m.sequence, 0) > COALESCE(c.local_hidden_before_seq, 0)
        )
        AND COALESCE(c.is_locally_deleted, 0) = 0
        AND (
        LOWER(COALESCE(json_extract(m.content, '$.text'), '')) LIKE ?
        OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE ?
        OR LOWER(COALESCE(m.reply_to_text, '')) LIKE ?
        )
      ORDER BY
        CASE WHEN COALESCE(m.sequence, 0) > 0 THEN 0 ELSE 1 END,
        m.created_at DESC
      LIMIT ?
    `
        )
        .all(normalizedKeyword, normalizedKeyword, normalizedKeyword, limit);

      return normalizeMessageRows(rows);
    }
  );

  ipcMain.handle(
    "db:get-message-by-server-id",
    (_event, clientConversationId: string, serverMessageId: string) => {
      const db = getDb();
      const row = db
        .prepare(
          `
        SELECT m.client_message_id, CAST(m.server_message_id AS text) AS server_message_id, m.client_conversation_id,
        m.sequence, m.sender_id, m.content, m.type, m.created_at, m.updated_at, m.status, m.is_recalled,
        m.is_favorited, m.is_pinned,
        m.reply_to_message_id, m.reply_to_sender_id, m.reply_to_sender_nickname, m.reply_to_text,
        om.last_error,
        COALESCE(cm.nickname, m.sender_nickname) AS sender_nickname,
        COALESCE(cm.avatar_url, m.sender_avatar) AS sender_avatar
        FROM local_messages m
        LEFT JOIN local_conversation_members cm
          ON m.client_conversation_id = cm.conversation_id
         AND m.sender_id = cm.user_id
        LEFT JOIN outgoing_messages om
          ON m.client_message_id = om.client_message_id
        JOIN local_conversations c
          ON c.client_conversation_id = m.client_conversation_id
        WHERE m.client_conversation_id = ?
          AND CAST(m.server_message_id AS text) = ?
          AND (
            COALESCE(m.sequence, 0) <= 0
            OR COALESCE(m.sequence, 0) > COALESCE(c.local_hidden_before_seq, 0)
          )
        LIMIT 1
      `
        )
        .get(clientConversationId, serverMessageId);

      return row ? normalizeMessageRow(attachReactionsToRow(row)) : null;
    }
  );

  ipcMain.handle(
    "db:get-message-context",
    (
      _event,
      clientConversationId: string,
      targetClientMessageId: string,
      beforeLimit = 20,
      afterLimit = 20
    ) => {
      const db = getDb();
      const target = db
        .prepare(
          `
        SELECT client_message_id, sequence, created_at
        FROM local_messages
        WHERE client_conversation_id = ?
          AND client_message_id = ?
        LIMIT 1
      `
        )
        .get(clientConversationId, targetClientMessageId) as
        | { client_message_id: string; sequence?: number; created_at: string }
        | undefined;

      if (!target) {
        return [];
      }

      const selectSql = `
        SELECT m.client_message_id, CAST(m.server_message_id AS text) AS server_message_id, m.client_conversation_id,
        m.sequence, m.sender_id, m.content, m.type, m.created_at, m.updated_at, m.status, m.is_recalled,
        m.is_favorited, m.is_pinned,
        m.reply_to_message_id, m.reply_to_sender_id, m.reply_to_sender_nickname, m.reply_to_text,
        om.last_error,
        COALESCE(cm.nickname, m.sender_nickname) AS sender_nickname,
        COALESCE(cm.avatar_url, m.sender_avatar) AS sender_avatar
        FROM local_messages m
        LEFT JOIN local_conversation_members cm
          ON m.client_conversation_id = cm.conversation_id
         AND m.sender_id = cm.user_id
        LEFT JOIN outgoing_messages om
          ON m.client_message_id = om.client_message_id
        JOIN local_conversations c
          ON c.client_conversation_id = m.client_conversation_id
      `;

      let beforeRows: any[] = [];
      let afterRows: any[] = [];

      if (Number(target.sequence ?? 0) > 0) {
        beforeRows = db
          .prepare(
            `
          ${selectSql}
          WHERE m.client_conversation_id = ?
            AND COALESCE(m.sequence, 0) > 0
            AND m.sequence > COALESCE(c.local_hidden_before_seq, 0)
            AND m.sequence < ?
          ORDER BY m.sequence DESC, m.created_at DESC
          LIMIT ?
        `
          )
          .all(clientConversationId, target.sequence, beforeLimit);

        afterRows = db
          .prepare(
            `
          ${selectSql}
          WHERE m.client_conversation_id = ?
            AND COALESCE(m.sequence, 0) > 0
            AND m.sequence > COALESCE(c.local_hidden_before_seq, 0)
            AND m.sequence > ?
          ORDER BY m.sequence ASC, m.created_at ASC
          LIMIT ?
        `
          )
          .all(clientConversationId, target.sequence, afterLimit);
      } else {
        beforeRows = db
          .prepare(
            `
          ${selectSql}
          WHERE m.client_conversation_id = ?
            AND COALESCE(m.sequence, 0) <= 0
            AND m.created_at < ?
          ORDER BY m.created_at DESC
          LIMIT ?
        `
          )
          .all(clientConversationId, target.created_at, beforeLimit);

        afterRows = db
          .prepare(
            `
          ${selectSql}
          WHERE m.client_conversation_id = ?
            AND COALESCE(m.sequence, 0) <= 0
            AND m.created_at > ?
          ORDER BY m.created_at ASC
          LIMIT ?
        `
          )
          .all(clientConversationId, target.created_at, afterLimit);
      }

      const targetRow = db
        .prepare(
          `
        ${selectSql}
        WHERE m.client_conversation_id = ?
          AND m.client_message_id = ?
          AND (
            COALESCE(m.sequence, 0) <= 0
            OR COALESCE(m.sequence, 0) > COALESCE(c.local_hidden_before_seq, 0)
          )
        LIMIT 1
      `
        )
        .get(clientConversationId, targetClientMessageId);

      return [
        ...normalizeMessageRows(beforeRows.reverse()),
        ...(targetRow
          ? [normalizeMessageRow(attachReactionsToRow(targetRow))]
          : []),
        ...normalizeMessageRows(afterRows)
      ];
    }
  );

  ipcMain.handle(
    "db:get-conversation-media",
    (
      _event,
      clientConversationId: string,
      kind: "images" | "files" = "files",
      limit = 200
    ) => {
      const db = getDb();
      const imageFilter = `
        (
          LOWER(COALESCE(json_extract(m.content, '$.mime_type'), '')) LIKE 'image/%'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.png'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.jpg'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.jpeg'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.gif'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.webp'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.bmp'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.svg'
        )
      `;
      const typeFilter = kind === "images" ? imageFilter : `NOT ${imageFilter}`;

      const rows = db
        .prepare(
          `
        SELECT m.client_message_id, CAST(m.server_message_id AS text) AS server_message_id, m.client_conversation_id,
        m.sequence, m.sender_id, m.content, m.type, m.created_at, m.updated_at, m.status, m.is_recalled,
        m.is_favorited, m.is_pinned,
        m.reply_to_message_id, m.reply_to_sender_id, m.reply_to_sender_nickname, m.reply_to_text,
        om.last_error,
        COALESCE(cm.nickname, m.sender_nickname) AS sender_nickname,
        COALESCE(cm.avatar_url, m.sender_avatar) AS sender_avatar
        FROM local_messages m
        LEFT JOIN local_conversation_members cm
          ON m.client_conversation_id = cm.conversation_id
         AND m.sender_id = cm.user_id
        LEFT JOIN outgoing_messages om
          ON m.client_message_id = om.client_message_id
        JOIN local_conversations c
          ON c.client_conversation_id = m.client_conversation_id
        WHERE m.client_conversation_id = ?
          AND m.type = 2
          AND COALESCE(m.is_recalled, 0) = 0
          AND (
            COALESCE(m.sequence, 0) <= 0
            OR COALESCE(m.sequence, 0) > COALESCE(c.local_hidden_before_seq, 0)
          )
          AND ${typeFilter}
        ORDER BY
          CASE WHEN COALESCE(m.sequence, 0) > 0 THEN 0 ELSE 1 END,
          m.sequence DESC,
          m.created_at DESC
        LIMIT ?
      `
        )
        .all(clientConversationId, limit);

      return normalizeMessageRows(rows);
    }
  );

  ipcMain.handle(
    "db:get-global-media",
    (_event, kind: "images" | "files" = "files", limit = 300) => {
      const db = getDb();
      const imageFilter = `
        (
          LOWER(COALESCE(json_extract(m.content, '$.mime_type'), '')) LIKE 'image/%'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.png'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.jpg'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.jpeg'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.gif'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.webp'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.bmp'
          OR LOWER(COALESCE(json_extract(m.content, '$.name'), '')) LIKE '%.svg'
        )
      `;
      const typeFilter = kind === "images" ? imageFilter : `NOT ${imageFilter}`;

      const rows = db
        .prepare(
          `
        SELECT m.client_message_id, CAST(m.server_message_id AS text) AS server_message_id, m.client_conversation_id,
        m.sequence, m.sender_id, m.content, m.type, m.created_at, m.updated_at, m.status, m.is_recalled,
        m.is_favorited, m.is_pinned,
        m.reply_to_message_id, m.reply_to_sender_id, m.reply_to_sender_nickname, m.reply_to_text,
        om.last_error,
        COALESCE(cm.nickname, m.sender_nickname) AS sender_nickname,
        COALESCE(cm.avatar_url, m.sender_avatar) AS sender_avatar
        FROM local_messages m
        LEFT JOIN local_conversation_members cm
          ON m.client_conversation_id = cm.conversation_id
         AND m.sender_id = cm.user_id
        LEFT JOIN outgoing_messages om
          ON m.client_message_id = om.client_message_id
        JOIN local_conversations c
          ON c.client_conversation_id = m.client_conversation_id
        WHERE m.type = 2
          AND COALESCE(m.is_recalled, 0) = 0
          AND COALESCE(c.is_locally_deleted, 0) = 0
          AND (
            COALESCE(m.sequence, 0) <= 0
            OR COALESCE(m.sequence, 0) > COALESCE(c.local_hidden_before_seq, 0)
          )
          AND ${typeFilter}
        ORDER BY
          CASE WHEN COALESCE(m.sequence, 0) > 0 THEN 0 ELSE 1 END,
          m.sequence DESC,
          m.created_at DESC
        LIMIT ?
      `
        )
        .all(limit);

      return normalizeMessageRows(rows);
    }
  );

  ipcMain.handle(
    "db:get-message-collections",
    (
      _event,
      clientConversationId: string,
      kind: "favorited" | "pinned",
      limit = 100
    ) => {
      const db = getDb();
      const stateColumn =
        kind === "favorited"
          ? "COALESCE(m.is_favorited, 0)"
          : "COALESCE(m.is_pinned, 0)";
      const rows = db
        .prepare(
          `
        SELECT m.client_message_id, CAST(m.server_message_id AS text) AS server_message_id, m.client_conversation_id,
        m.sequence, m.sender_id, m.content, m.type, m.created_at, m.updated_at, m.status, m.is_recalled,
        m.is_favorited, m.is_pinned,
        m.reply_to_message_id, m.reply_to_sender_id, m.reply_to_sender_nickname, m.reply_to_text,
        om.last_error,
        COALESCE(cm.nickname, m.sender_nickname) AS sender_nickname,
        COALESCE(cm.avatar_url, m.sender_avatar) AS sender_avatar
        FROM local_messages m
        LEFT JOIN local_conversation_members cm
          ON m.client_conversation_id = cm.conversation_id
         AND m.sender_id = cm.user_id
        LEFT JOIN outgoing_messages om
          ON m.client_message_id = om.client_message_id
        JOIN local_conversations c
          ON c.client_conversation_id = m.client_conversation_id
        WHERE m.client_conversation_id = ?
          AND ${stateColumn} = 1
          AND (
            COALESCE(m.sequence, 0) <= 0
            OR COALESCE(m.sequence, 0) > COALESCE(c.local_hidden_before_seq, 0)
          )
        ORDER BY
          CASE WHEN COALESCE(m.sequence, 0) > 0 THEN 0 ELSE 1 END,
          m.sequence DESC,
          m.created_at DESC
        LIMIT ?
      `
        )
        .all(clientConversationId, limit);

      return normalizeMessageRows(rows);
    }
  );

  ipcMain.handle(
    "db:list-server-message-ids",
    (_event, clientConversationId: string) => {
      const rows = getDb()
        .prepare(
          `
          SELECT CAST(server_message_id AS text) AS server_message_id
          FROM local_messages m
          JOIN local_conversations c
            ON c.client_conversation_id = m.client_conversation_id
          WHERE m.client_conversation_id = ?
            AND m.server_message_id IS NOT NULL
            AND COALESCE(m.sequence, 0) > 0
            AND m.sequence > COALESCE(c.local_hidden_before_seq, 0)
          `
        )
        .all(clientConversationId) as Array<{ server_message_id: string }>;
      return rows
        .map(row => String(row.server_message_id || ""))
        .filter(Boolean);
    }
  );
}
