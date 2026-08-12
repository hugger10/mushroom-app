import { ipcMain } from "electron";
import { getDb } from "../connection";

export function registerOutgoingHandlers() {
  ipcMain.handle("db:get-outgoing-messages", () => {
    const rows = getDb()
      .prepare(
        `
        SELECT
          client_message_id,
          client_conversation_id,
          server_conversation_id,
          payload,
          status,
          retry_count,
          next_retry_at,
          last_error,
          created_at,
          updated_at
        FROM outgoing_messages
        ORDER BY COALESCE(next_retry_at, created_at) ASC, created_at ASC
      `
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map(row => ({
      ...row,
      payload:
        typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload
    }));
  });

  ipcMain.handle("db:queue-outgoing-message", (_event, item) => {
    const payload =
      typeof item.payload === "string"
        ? item.payload
        : JSON.stringify(item.payload);
    const stmt = getDb().prepare(`
      INSERT INTO outgoing_messages (
        client_message_id,
        client_conversation_id,
        server_conversation_id,
        payload,
        status,
        retry_count,
        next_retry_at,
        last_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_message_id) DO UPDATE SET
        client_conversation_id = excluded.client_conversation_id,
        server_conversation_id = excluded.server_conversation_id,
        payload = excluded.payload,
        status = excluded.status,
        retry_count = excluded.retry_count,
        next_retry_at = excluded.next_retry_at,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `);
    return stmt.run(
      item.client_message_id,
      item.client_conversation_id,
      item.server_conversation_id ?? null,
      payload,
      item.status,
      item.retry_count ?? 0,
      item.next_retry_at ?? null,
      item.last_error ?? null,
      item.created_at ?? new Date().toISOString(),
      item.updated_at ?? new Date().toISOString()
    );
  });

  ipcMain.handle("db:update-outgoing-message", (_event, item) => {
    const stmt = getDb().prepare(`
      UPDATE outgoing_messages
      SET status = ?,
          retry_count = ?,
          next_retry_at = ?,
          last_error = ?,
          updated_at = ?
      WHERE client_message_id = ?
    `);
    return stmt.run(
      item.status,
      item.retry_count ?? 0,
      item.next_retry_at ?? null,
      item.last_error ?? null,
      item.updated_at ?? new Date().toISOString(),
      item.client_message_id
    );
  });

  ipcMain.handle("db:delete-outgoing-message", (_event, clientMessageId) => {
    return getDb()
      .prepare("DELETE FROM outgoing_messages WHERE client_message_id = ?")
      .run(clientMessageId);
  });
}
