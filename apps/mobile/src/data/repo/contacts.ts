import type { ContactListItem } from "@mushroom/shared";
import type { MobileDataRepository } from "@mushroom/app-core";
import { cloneContact, getContactSortName, safeJsonParse } from "./helpers";
import { queryRows, type SQLiteRow } from "./queries";
import type { RepoDeps } from "./types";

/**
 * Contacts 子模块：仅触达 `mobile_contacts` 表。
 *
 * 注意：原 `sqlite-data-repository.ts` 中 contacts 的写路径**不包**
 * `runExclusive`（只走 `db.transaction`），这里严格保留——
 * contacts 表无与 messages 串行化的语义需求。
 */
export function createContactRepo(
  deps: RepoDeps
): Pick<
  MobileDataRepository,
  "listContacts" | "upsertContacts" | "removeContacts"
> {
  const { db, ensureInitialized } = deps;

  return {
    async listContacts() {
      await ensureInitialized();
      const rows = await queryRows<SQLiteRow>(
        db,
        `SELECT payload FROM mobile_contacts ORDER BY sort_name ASC`
      );
      return rows
        .map(row => safeJsonParse<ContactListItem>(row.payload, null as never))
        .filter((item): item is ContactListItem => item !== null)
        .map(cloneContact);
    },
    async upsertContacts(contacts) {
      await ensureInitialized();
      if (contacts.length === 0) {
        return;
      }
      await db.transaction(async tx => {
        for (const contact of contacts) {
          await tx.executeAsync(
            `INSERT INTO mobile_contacts (user_id, sort_name, payload)
             VALUES (?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               sort_name = excluded.sort_name,
               payload = excluded.payload`,
            [
              Number(contact.user_id),
              getContactSortName(contact),
              JSON.stringify(cloneContact(contact))
            ]
          );
        }
      });
    },
    async removeContacts(userIds) {
      await ensureInitialized();
      if (userIds.length === 0) {
        return;
      }
      await db.transaction(async tx => {
        for (const userId of userIds) {
          await tx.executeAsync(
            `DELETE FROM mobile_contacts WHERE user_id = ?`,
            [Number(userId)]
          );
        }
      });
    }
  };
}
