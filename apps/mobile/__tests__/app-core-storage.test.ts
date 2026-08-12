import { createJsonBackedMobileDataRepository } from "@mushroom/app-core";
import { createMockMessage } from "./helpers/mobile-test-helpers";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    }
  };
}

describe("app-core storage timeline order", () => {
  test("keeps failed local messages in created_at order instead of pinning them to the bottom", async () => {
    const repository = createJsonBackedMobileDataRepository({
      storage: createMemoryStorage()
    });
    const conversationId = "conversation-1";

    await repository.upsertMessages([
      createMockMessage({
        client_message_id: "message-1",
        server_message_id: "server-message-1",
        client_conversation_id: conversationId,
        sequence: 1,
        created_at: "2026-04-19T10:00:00.000Z"
      }),
      createMockMessage({
        client_message_id: "message-blocked",
        server_message_id: "",
        client_conversation_id: conversationId,
        sequence: 0,
        status: -1,
        last_error: "对方已经将你拉黑，无法发送消息",
        created_at: "2026-04-19T10:01:00.000Z"
      }),
      createMockMessage({
        client_message_id: "message-2",
        server_message_id: "server-message-2",
        client_conversation_id: conversationId,
        sequence: 2,
        created_at: "2026-04-19T10:02:00.000Z"
      })
    ]);

    const messages = await repository.listMessages(conversationId);

    expect(messages.map(item => item.client_message_id)).toEqual([
      "message-1",
      "message-blocked",
      "message-2"
    ]);
  });
});
