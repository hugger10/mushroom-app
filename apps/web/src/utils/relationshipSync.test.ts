import { syncRelationshipChanges } from "./relationshipSync";

describe("syncRelationshipChanges", () => {
  test("syncs contacts and conversations before notifying the UI", async () => {
    const calls: string[] = [];
    const electronAPI = {
      getLastSyncTime: jest
        .fn()
        .mockResolvedValueOnce("contacts-sync-1")
        .mockResolvedValueOnce("conversations-sync-1"),
      updateLastSyncTime: jest.fn().mockImplementation(async scope => {
        calls.push(`update:${scope}`);
      })
    };
    const fetchContacts = jest.fn().mockImplementation(async lastSyncTime => {
      calls.push(`contacts:${lastSyncTime}`);
      return "contacts-sync-2";
    });
    const fetchConversations = jest
      .fn()
      .mockImplementation(async lastSyncTime => {
        calls.push(`conversations:${lastSyncTime}`);
        return {
          syncCursor: "conversations-sync-2",
          updatedConversations: [
            {
              conversation_id: "42",
              client_conversation_id: "client-42",
              last_sequence: 0,
              server_sequence: 3,
              sync_mode: "tail" as const
            }
          ]
        };
      });
    const fetchMessages = jest.fn().mockImplementation(async () => {
      calls.push("messages");
    });
    const notifyContactsChanged = jest.fn(() => {
      calls.push("notify");
    });

    await syncRelationshipChanges({
      electronAPI,
      fetchContacts,
      fetchConversations,
      fetchMessages,
      notifyContactsChanged
    });

    expect(fetchContacts).toHaveBeenCalledWith("contacts-sync-1");
    expect(fetchConversations).toHaveBeenCalledWith("conversations-sync-1");
    expect(fetchMessages).toHaveBeenCalledWith([
      {
        conversation_id: "42",
        client_conversation_id: "client-42",
        last_sequence: 0,
        server_sequence: 3,
        sync_mode: "tail"
      }
    ]);
    expect(calls).toEqual([
      "contacts:contacts-sync-1",
      "update:contacts",
      "conversations:conversations-sync-1",
      "update:conversations",
      "messages",
      "notify"
    ]);
  });

  test("returns early when electron sync APIs are unavailable", async () => {
    const fetchContacts = jest.fn();

    await syncRelationshipChanges({
      electronAPI: null,
      fetchContacts
    });

    expect(fetchContacts).not.toHaveBeenCalled();
  });
});
