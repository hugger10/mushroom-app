type ConversationMessageSyncTask = {
  conversation_id: string;
  client_conversation_id: string;
  last_sequence: number;
  server_sequence: number;
  sync_mode?: "delta" | "tail";
};

type ElectronRelationshipSyncApi = {
  getLastSyncTime: (
    scope: "contacts" | "conversations"
  ) => Promise<Date | string | null>;
  updateLastSyncTime: (
    scope: "contacts" | "conversations",
    value: Date | string | null
  ) => Promise<void>;
};

type RelationshipSyncDeps = {
  electronAPI?: ElectronRelationshipSyncApi | null;
  fetchContacts?: (lastSyncTime?: Date | string) => Promise<string | null>;
  fetchConversations?: (lastSyncTime?: Date | string) => Promise<{
    syncCursor: string | null;
    updatedConversations: ConversationMessageSyncTask[];
  }>;
  fetchMessages?: (tasks: ConversationMessageSyncTask[]) => Promise<unknown>;
  notifyContactsChanged?: () => void;
};

function getDefaultDeps(): RelationshipSyncDeps {
  const runtimeWindow =
    typeof window === "undefined" ? null : (window as typeof globalThis.window);

  return {
    electronAPI: runtimeWindow?.electronAPI ?? null,
    fetchContacts: async lastSyncTime => {
      const module = await import("../sync/syncContext");
      return module.fetchRemoteContacts(lastSyncTime);
    },
    fetchConversations: async lastSyncTime => {
      const module = await import("../sync/syncContext");
      return module.fetchRemoteConversations(lastSyncTime);
    },
    fetchMessages: async tasks => {
      const module = await import("../sync/syncContext");
      return module.fetchRemoteMessages(tasks);
    },
    notifyContactsChanged: () => {
      runtimeWindow?.dispatchEvent(new CustomEvent("im:contacts-sync"));
    }
  };
}

export async function syncRelationshipChanges(
  overrides: RelationshipSyncDeps = {}
) {
  const deps = {
    ...getDefaultDeps(),
    ...overrides
  };
  const electronAPI = deps.electronAPI;

  if (!electronAPI) {
    return;
  }

  const lastContactsSync =
    (await electronAPI.getLastSyncTime("contacts")) ?? undefined;
  const nextContactsSync = await deps.fetchContacts!(lastContactsSync);
  await electronAPI.updateLastSyncTime("contacts", nextContactsSync);

  const lastConversationsSync =
    (await electronAPI.getLastSyncTime("conversations")) ?? undefined;
  const conversationSyncResult = await deps.fetchConversations!(
    lastConversationsSync
  );
  await electronAPI.updateLastSyncTime(
    "conversations",
    conversationSyncResult.syncCursor
  );
  await deps.fetchMessages!(conversationSyncResult.updatedConversations);

  deps.notifyContactsChanged?.();
}
