import { useCallback } from "react";
import type { ContactListItem } from "../../types/user";

interface UseContactRelationshipActionsOptions {
  selectedContact: ContactListItem | null;
  setSelectedContact: (next: ContactListItem | null) => void;
}

type FetchContactsOverride =
  | ((lastSyncTime?: Date | string) => Promise<string | null>)
  | null;

/**
 * Shared executor: dynamically import HTTP/sync modules once per call,
 * run the relationship-change request, then trigger relationship sync.
 */
async function runRelationshipChange(
  action: (api: typeof import("../../http/api")) => Promise<unknown>,
  fetchContactsOverride: FetchContactsOverride = null
) {
  const api = await import("../../http/api");
  await action(api);

  const { syncRelationshipChanges } = await import(
    "../../utils/relationshipSync"
  );
  const { fetchRemoteContacts, fetchRemoteConversations, fetchRemoteMessages } =
    await import("../../sync/syncContext");

  await syncRelationshipChanges({
    fetchContacts: fetchContactsOverride ?? fetchRemoteContacts,
    fetchConversations: fetchRemoteConversations,
    fetchMessages: fetchRemoteMessages
  });
}

/**
 * Encapsulates block / unblock actions invoked from the sidebar; collapses
 * the two near-duplicate dynamic-import blocks in the original Home.tsx.
 */
export function useContactRelationshipActions({
  selectedContact,
  setSelectedContact
}: UseContactRelationshipActionsOptions) {
  const blockContact = useCallback(
    async (targetUserId: number) => {
      await runRelationshipChange(api => api.blockUser(targetUserId));
      if (selectedContact?.user_id === targetUserId) {
        setSelectedContact(null);
      }
    },
    [selectedContact, setSelectedContact]
  );

  const unblockContact = useCallback(async (targetUserId: number) => {
    await runRelationshipChange(
      api => api.unblockUser(targetUserId),
      // unblock 需要在解除拉黑后强制拉取联系人列表，保持原行为
      async (lastSyncTime?: Date | string) => {
        const { fetchRemoteContacts } = await import("../../sync/syncContext");
        return (
          (await fetchRemoteContacts(lastSyncTime, { force: true })) ?? null
        );
      }
    );
  }, []);

  return { blockContact, unblockContact };
}
