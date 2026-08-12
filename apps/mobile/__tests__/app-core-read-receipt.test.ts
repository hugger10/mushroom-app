import { MobileAppController } from "@mushroom/app-core";
import { createMockConversation } from "./helpers/mobile-test-helpers";

describe("MobileAppController conversation_read handling", () => {
  test("updates peer_last_read_sequence instead of local last_read_sequence", async () => {
    let conversation = createMockConversation({
      server_conversation_id: "server-conversation-1",
      last_read_sequence: 5,
      peer_last_read_sequence: 0,
      unread_count: 0
    });

    const repository = {
      listContacts: jest.fn().mockResolvedValue([]),
      upsertContacts: jest.fn().mockResolvedValue(undefined),
      removeContacts: jest.fn().mockResolvedValue(undefined),
      listConversations: jest.fn().mockResolvedValue([conversation]),
      getConversationByClientId: jest.fn().mockResolvedValue(conversation),
      upsertConversations: jest.fn().mockImplementation(async next => {
        conversation = next[0];
      }),
      removeConversations: jest.fn().mockResolvedValue(undefined),
      getConversationByServerId: jest.fn().mockResolvedValue(conversation),
      listMessages: jest.fn().mockResolvedValue([]),
      upsertMessages: jest.fn().mockResolvedValue(undefined),
      applyMessageStates: jest.fn().mockResolvedValue(undefined),
      applyMessageReactions: jest.fn().mockResolvedValue(undefined),
      replaceReactionsForMessages: jest.fn().mockResolvedValue(undefined),
      removeMessageReaction: jest.fn().mockResolvedValue(undefined),
      loadReactionsByMessageIds: jest.fn().mockResolvedValue([]),
      applyReactionDeltas: jest.fn().mockResolvedValue(undefined),
      getReactionCursor: jest.fn().mockResolvedValue(0),
      setReactionCursor: jest.fn().mockResolvedValue(undefined),
      clearConversationMessages: jest.fn().mockResolvedValue(undefined),
      softDeleteConversation: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      snapshot: jest.fn().mockImplementation(async () => ({
        contacts: [],
        conversations: [conversation],
        messagesByConversation: {}
      }))
    };

    const controller = new MobileAppController({
      api: {} as never,
      authStore: {
        read: async () => ({
          accessToken: null,
          refreshToken: null,
          user: null,
          profile: null
        }),
        write: async () => undefined,
        clear: async () => undefined
      },
      checkpoints: {
        read: async () => ({
          contacts: null,
          conversations: null,
          messageStates: null
        }),
        write: async patch => ({
          contacts: patch.contacts ?? null,
          conversations: patch.conversations ?? null,
          messageStates: patch.messageStates ?? null
        }),
        clear: async () => undefined
      },
      repository,
      deviceInfo: {
        deviceId: "device-1",
        deviceType: 3,
        deviceName: "Test Device"
      }
    });

    await controller.handleRealtimeEvent({
      messageClassify: "conversation_read",
      conversation_id: "server-conversation-1",
      read_seq: 8,
      unread_count: 0,
      updated_at: "2026-04-17T10:03:00.000Z"
    });

    expect(conversation.last_read_sequence).toBe(5);
    expect(conversation.peer_last_read_sequence).toBe(8);
  });
});
