import { useCallback, useRef, useState } from "react";
import type { ContactListItem } from "../types/user";
import { getBlocks, getContacts } from "../http/api";
import { mapBlockedUsers, mapContacts } from "../utils/mapper";
import { getAccessToken } from "../utils/token";
import { hasContactChanged } from "@mushroom/shared";

function diffCachedUsers(remote: ContactListItem[], local: ContactListItem[]) {
  const localMap = new Map(local.map(item => [item.user_id, item]));
  const remoteIds = new Set(remote.map(item => item.user_id));

  const added: ContactListItem[] = [];
  const updated: ContactListItem[] = [];
  for (const item of remote) {
    const localItem = localMap.get(item.user_id);
    if (!localItem) {
      added.push(item);
    } else if (hasContactChanged(item, localItem)) {
      updated.push(item);
    }
  }

  return {
    added,
    updated,
    removed: local
      .filter(item => !remoteIds.has(item.user_id))
      .map(item => item.user_id)
  };
}

export function useContacts() {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<ContactListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isStartChatVisible, setIsStartChatVisible] = useState(false);
  const syncingContactPanelsRef = useRef<Promise<void> | null>(null);

  const fetchLocalContacts = useCallback(async () => {
    setLoading(true);
    try {
      const localContacts = await window.electronAPI.getContacts();
      setContacts(localContacts);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBlockedUsers = useCallback(async () => {
    const blocked = await window.electronAPI.getBlockedUsers();
    setBlockedUsers(blocked);
  }, []);

  const syncContactPanels = useCallback(async () => {
    if (syncingContactPanelsRef.current) {
      return syncingContactPanelsRef.current;
    }

    const syncPromise = (async () => {
      const token = await getAccessToken();
      if (!token) {
        return;
      }

      const [contactsResult, blocksResult] = await Promise.all([
        getContacts(),
        getBlocks()
      ]);
      const remoteContacts = mapContacts(contactsResult.data.contacts);
      const remoteBlocks = mapBlockedUsers(blocksResult.data.blocks);

      const [localContacts, localBlocked] = await Promise.all([
        window.electronAPI.getContacts(),
        window.electronAPI.getBlockedUsers()
      ]);

      const contactDiff = diffCachedUsers(remoteContacts, localContacts);
      const blockDiff = diffCachedUsers(remoteBlocks, localBlocked);
      const removedIds = Array.from(
        new Set([...contactDiff.removed, ...blockDiff.removed])
      );

      if (contactDiff.added.length > 0 || blockDiff.added.length > 0) {
        await window.electronAPI.createContacts([
          ...contactDiff.added,
          ...blockDiff.added
        ]);
      }
      if (contactDiff.updated.length > 0 || blockDiff.updated.length > 0) {
        await window.electronAPI.updateContacts([
          ...contactDiff.updated,
          ...blockDiff.updated
        ]);
      }
      if (removedIds.length > 0) {
        await window.electronAPI.deleteContacts(removedIds);
      }

      await Promise.all([fetchLocalContacts(), fetchBlockedUsers()]);
    })();

    syncingContactPanelsRef.current = syncPromise;
    try {
      await syncPromise;
    } finally {
      syncingContactPanelsRef.current = null;
    }
  }, [fetchBlockedUsers, fetchLocalContacts]);

  return {
    contacts,
    blockedUsers,
    loading,
    fetchLocalContacts,
    fetchBlockedUsers,
    isStartChatVisible,
    setIsStartChatVisible,
    syncBlockedUsers: fetchBlockedUsers,
    syncContactPanels
  };
}
