import { ipcMain } from "electron";
import { getDb } from "../connection";
import { fmtCount } from "../shared";
import { normalizeSyncCursorValue } from "../normalizers";
import { reconcileConversationSyncProgress } from "../conversation-sync";
import log from "../../../utils/log";

export function registerSyncCursorHandlers() {
  ipcMain.handle("db:get-lastSyncTime", (_event, model) => {
    const stmt = getDb().prepare(
      "SELECT cursor_value FROM sync_cursors WHERE scope = ? AND entity_id = ?"
    );
    const row = stmt.get(model, "") as
      | { cursor_value?: string | null }
      | undefined;
    return row?.cursor_value ?? null;
  });

  ipcMain.handle("db:update-lastSyncTime", (_event, model, syncTime) => {
    const normalizedSyncTime = normalizeSyncCursorValue(syncTime);
    const stmt = getDb().prepare(`
      INSERT INTO sync_cursors (scope, entity_id, cursor_type, cursor_value, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(scope, entity_id) DO UPDATE SET
        cursor_type = excluded.cursor_type,
        cursor_value = excluded.cursor_value,
        updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(model, "", "time", normalizedSyncTime);
  });

  ipcMain.handle(
    "db:update-conversationLastSyncSequence",
    (_event, convSeqMap: Record<string, { serverSequence: number }>) => {
      log.debug(
        "Updating conversation last sync sequences " + fmtCount(convSeqMap)
      );
      const db = getDb();
      const convIds = Object.keys(convSeqMap);
      if (convIds.length === 0) return;

      const updateProgress = db.transaction(
        (items: Record<string, { serverSequence: number }>) => {
          for (const [clientConversationId, progress] of Object.entries(
            items
          )) {
            reconcileConversationSyncProgress(
              db,
              clientConversationId,
              Number(progress.serverSequence || 0)
            );
          }
        }
      );

      return updateProgress(convSeqMap);
    }
  );
}
