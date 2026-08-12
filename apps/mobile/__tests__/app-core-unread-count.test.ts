import { MobileAppController } from "@mushroom/app-core";
import type { ChatMessage } from "@mushroom/shared";
import { createMockConversation } from "./helpers/mobile-test-helpers";

describe("MobileAppController unread count handling", () => {
  test("does not double count duplicate realtime chat messages", async () => {
    let conversation = createMockConversation({
      server_conversation_id: "server-conversation-1",
      unread_count: 0,
      mention_unread_count: 0
    });
    const messages: Array<{
      client_message_id: string;
      server_message_id: string;
      client_conversation_id: string;
      server_conversation_id: string;
      type: number;
      status: number;
      sequence: number;
      content: { type: number; text: string };
      sender_id: number;
      sender_nickname: string;
      created_at: string;
      is_recalled: number;
      is_favorited: number;
      is_pinned: number;
      messageClassify: "chat";
    }> = [];

    const repository = {
      listContacts: jest.fn().mockResolvedValue([]),
      upsertContacts: jest.fn().mockResolvedValue(undefined),
      removeContacts: jest.fn().mockResolvedValue(undefined),
      listConversations: jest
        .fn()
        .mockImplementation(async () => [conversation]),
      getConversationByClientId: jest
        .fn()
        .mockImplementation(async () => conversation),
      upsertConversations: jest.fn().mockImplementation(async next => {
        conversation = next[0];
      }),
      removeConversations: jest.fn().mockResolvedValue(undefined),
      getConversationByServerId: jest
        .fn()
        .mockImplementation(async () => conversation),
      listMessages: jest.fn().mockImplementation(async () => messages),
      upsertMessages: jest.fn().mockImplementation(async next => {
        for (const message of next) {
          const existingIndex = messages.findIndex(
            item =>
              item.server_message_id === message.server_message_id ||
              item.client_message_id === message.client_message_id
          );
          if (existingIndex >= 0) {
            messages[existingIndex] = {
              ...messages[existingIndex],
              ...message
            };
            continue;
          }
          messages.push(message);
        }
      }),
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
        messagesByConversation: {
          [conversation.client_conversation_id]: messages
        }
      }))
    };

    const controller = new MobileAppController({
      api: {} as never,
      authStore: {
        read: async () => ({
          accessToken: "token",
          refreshToken: null,
          user: {
            userId: 1,
            username: "alice",
            nickname: "Alice",
            access_token: "token"
          },
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

    const firstIncomingMessage: ChatMessage = {
      messageClassify: "chat",
      client_message_id: "message-1",
      server_message_id: "server-message-1",
      client_conversation_id: conversation.client_conversation_id,
      server_conversation_id: conversation.server_conversation_id,
      type: 1,
      status: 0,
      sequence: 1,
      content: {
        type: 1,
        text: "hello"
      },
      sender_id: 2,
      sender_nickname: "Bob",
      created_at: "2026-04-17T12:00:00.000Z",
      is_recalled: 0,
      is_favorited: 0,
      is_pinned: 0
    };
    const secondIncomingMessage: ChatMessage = {
      ...firstIncomingMessage,
      client_message_id: "message-2",
      server_message_id: "server-message-2",
      sequence: 2,
      content: {
        type: 1,
        text: "world"
      },
      created_at: "2026-04-17T12:01:00.000Z"
    };

    await controller.handleRealtimeEvent(firstIncomingMessage);
    expect(conversation.unread_count).toBe(1);
    expect(repository.upsertConversations).toHaveBeenLastCalledWith([
      expect.objectContaining({
        unread_count: 1
      })
    ]);

    await controller.handleRealtimeEvent(firstIncomingMessage);
    expect(conversation.unread_count).toBe(1);
    expect(repository.upsertConversations).toHaveBeenLastCalledWith([
      expect.objectContaining({
        unread_count: 1
      })
    ]);

    await controller.handleRealtimeEvent(secondIncomingMessage);
    expect(conversation.unread_count).toBe(2);
    expect(repository.upsertConversations).toHaveBeenLastCalledWith([
      expect.objectContaining({
        unread_count: 2
      })
    ]);

    await controller.handleRealtimeEvent(secondIncomingMessage);
    expect(conversation.unread_count).toBe(2);
    expect(repository.upsertConversations).toHaveBeenLastCalledWith([
      expect.objectContaining({
        unread_count: 2
      })
    ]);
  });
});
