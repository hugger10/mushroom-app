import { getBlocks, getContacts } from "../http/api";
import { mapBlockedUsers, mapContacts } from "../utils/mapper";
import { getAccessToken } from "../utils/token";
import { hasContactChanged } from "@mushroom/shared";
import type { ContactListItem } from "../types/user";
import { serializeSyncCursor } from "./cursors";

const CONTACTS_SYNC_MIN_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
let lastContactsSyncTimestamp = 0;

export const fetchRemoteContacts = async (
  lastSyncTime?: Date | string,
  options?: { force?: boolean }
) => {
  if (
    !options?.force &&
    Date.now() - lastContactsSyncTimestamp < CONTACTS_SYNC_MIN_INTERVAL_MS
  ) {
    return serializeSyncCursor(lastSyncTime) ?? new Date().toISOString();
  }

  void lastSyncTime;
  const token = await getAccessToken();
  if (!token) {
    return serializeSyncCursor(lastSyncTime) ?? null;
  }

  const [contactsResult, blocksResult] = await Promise.all([
    getContacts(),
    getBlocks()
  ]);
  const remoteContacts = [
    ...mapContacts(contactsResult.data.contacts),
    ...mapBlockedUsers(blocksResult.data.blocks)
  ];
  const local = await window.electronAPI.getContacts();
  const { added, removed, updated } = diffContacts(
    remoteContacts,
    local,
    false
  );
  if (added.length > 0) await window.electronAPI.createContacts(added);
  if (updated.length > 0) await window.electronAPI.updateContacts(updated);
  if (removed.length > 0) {
    await window.electronAPI.deleteContacts(removed.map(item => item.user_id));
  }
  lastContactsSyncTimestamp = Date.now();
  if (
    typeof window !== "undefined" &&
    (added.length > 0 || updated.length > 0 || removed.length > 0)
  ) {
    window.dispatchEvent(new CustomEvent("im:contacts-sync"));
  }
  return new Date().toISOString();
};

function diffContacts(
  remote: ContactListItem[],
  local: ContactListItem[],
  isIncremental = false
) {
  const localMap = new Map(local.map(contact => [contact.user_id, contact]));
  const remoteIds = new Set(remote.map(contact => contact.user_id));

  const added: ContactListItem[] = [];
  const removed: ContactListItem[] = [];
  const updated: ContactListItem[] = [];

  for (const contact of remote) {
    const localContact = localMap.get(contact.user_id);
    if (!localContact) {
      added.push(contact);
    } else if (hasContactChanged(contact, localContact)) {
      updated.push(contact);
    }
  }

  if (!isIncremental) {
    for (const contact of local) {
      if (!remoteIds.has(contact.user_id)) {
        removed.push(contact);
      }
    }
  }

  return { added, removed, updated };
}
