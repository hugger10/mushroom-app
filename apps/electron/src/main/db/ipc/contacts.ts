import { ipcMain } from "electron";
import { getDb } from "../connection";
import log from "../../../utils/log";
import { fmtCount } from "../shared";
import { normalizeContactRecord } from "../normalizers";

export function registerContactHandlers() {
  ipcMain.handle("db:get-contacts", _event => {
    const stmt = getDb().prepare(
      "SELECT * FROM contacts_cache where COALESCE(is_blocked, 0) = 0 and COALESCE(status, 'normal') = 'normal' order by COALESCE(remark_name, nickname, username) ASC"
    );
    return stmt.all();
  });

  ipcMain.handle("db:get-blocked-users", _event => {
    const stmt = getDb().prepare(
      "SELECT * FROM contacts_cache where COALESCE(is_blocked, 0) = 1 order by updated_at DESC, nickname ASC"
    );
    return stmt.all();
  });

  ipcMain.handle("db:create-contacts", (_event, contacts) => {
    log.debug("Creating contacts " + fmtCount(contacts));
    const stmt = getDb().prepare(`
    INSERT INTO contacts_cache (
      user_id, username, nickname, remark_name, remark_note, avatar_url, gender, is_blocked, source, status, signature, blocked_at, updated_at
    ) VALUES (
      @user_id, @username, @nickname, @remark_name, @remark_note, @avatar_url, @gender, @is_blocked, @source, @status, @signature, @blocked_at, @updated_at
    )
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      nickname = excluded.nickname,
      remark_name = excluded.remark_name,
      remark_note = excluded.remark_note,
      avatar_url = excluded.avatar_url,
      gender = excluded.gender,
      is_blocked = excluded.is_blocked,
      source = excluded.source,
      status = excluded.status,
      signature = excluded.signature,
      blocked_at = excluded.blocked_at,
      updated_at = excluded.updated_at
  `);

    const insertMany = getDb().transaction(contacts => {
      for (const contact of contacts) {
        stmt.run(normalizeContactRecord(contact));
      }
    });

    return insertMany(contacts);
  });

  ipcMain.handle("db:update-contacts", (_event, contacts) => {
    log.debug("Updating contacts " + fmtCount(contacts));
    const stmt = getDb().prepare(`
    UPDATE contacts_cache
    SET
      username   = @username,
      nickname   = @nickname,
      remark_name = @remark_name,
      remark_note = @remark_note,
      avatar_url = @avatar_url,
      gender     = @gender,
      is_blocked = @is_blocked,
      source     = @source,
      status     = @status,
      signature  = @signature,
      blocked_at = @blocked_at,
      updated_at = @updated_at
    WHERE user_id = @user_id
  `);

    const updateMany = getDb().transaction(contacts => {
      for (const contact of contacts) {
        stmt.run(normalizeContactRecord(contact));
      }
    });

    return updateMany(contacts);
  });
  ipcMain.handle("db:delete-contacts", (_event, userIds: number[]) => {
    log.debug("Deleting contacts " + fmtCount(userIds));
    const stmt = getDb().prepare(`
    DELETE FROM contacts_cache WHERE user_id = ?
  `);

    const deleteMany = getDb().transaction((ids: number[]) => {
      for (const id of ids) {
        stmt.run(id);
      }
    });

    return deleteMany(userIds);
  });
}
