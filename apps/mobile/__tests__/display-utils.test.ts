import type {
  Conversation,
  ContactListItem,
  LoginUser,
  Message
} from "@mushroom/shared";
import { createSystemMessageContent } from "@mushroom/shared";
import {
  applyConversationDisplayFallbacks,
  getMessageSenderDisplayName,
  normalizeOnlineFlag,
  isSystemTimelineMessage
} from "../src/utils/display";

function createDirectConversation(): Conversation {
  return {
    client_conversation_id: "local-1",
    server_conversation_id: "remote-1",
    type: 1,
    name: "",
    owner_id: 1,
    peer_id: 2,
    last_message_send_id: 0,
    last_message_content: {},
    last_message_time: "2026-04-09T00:00:00.000Z",
    unread_count: 0,
    last_sync_sequence: 0,
    last_read_sequence: 0,
    status: 0,
    is_pinned: 0,
    is_muted: 0,
    members: [
      { user_id: 1, nickname: "Alice", role: 0 },
      { user_id: 2, nickname: "", role: 0 }
    ]
  };
}

function createLoginUser(): LoginUser {
  return {
    userId: 1,
    username: "alice",
    nickname: "Alice"
  };
}

function createFriend(): ContactListItem {
  return {
    user_id: 2,
    username: "bob",
    nickname: "Bob",
    gender: 0,
    is_blocked: false,
    updated_at: "2026-04-09T00:00:00.000Z"
  };
}

function createMessage(senderId: number, senderNickname?: string): Message {
  return {
    client_message_id: `msg-${senderId}`,
    server_message_id: `srv-${senderId}`,
    client_conversation_id: "local-1",
    server_conversation_id: "remote-1",
    sequence: 1,
    content: { type: 1, text: "hello" },
    sender_id: senderId,
    created_at: "2026-04-09T00:00:00.000Z",
    type: 1,
    status: 0,
    sender_nickname: senderNickname
  };
}

describe("mobile display utils", () => {
  test("fills direct conversation display name from contact data", () => {
    const [conversation] = applyConversationDisplayFallbacks({
      conversations: [createDirectConversation()],
      contacts: [
        {
          ...createFriend(),
          avatar_url: "https://example.test/avatar.png"
        }
      ],
      loginUser: createLoginUser()
    });

    expect(conversation.display_name).toBe("Bob");
    expect(conversation.name).toBe("Bob");
    expect(conversation.display_avatar).toBe("https://example.test/avatar.png");
  });

  test("fills group sender display name from member list", () => {
    const message = createMessage(2);
    const conversation: Conversation = {
      ...createDirectConversation(),
      type: 2,
      name: "项目群",
      members: [
        { user_id: 1, nickname: "Alice", role: 2 },
        { user_id: 2, nickname: "Bob", role: 0 }
      ]
    };

    expect(
      getMessageSenderDisplayName({
        message,
        conversation,
        contacts: [createFriend()],
        loginUser: createLoginUser()
      })
    ).toBe("Bob");
  });

  test("identifies system timeline message by type/content", () => {
    const systemMessage: Message = {
      ...createMessage(0),
      type: 0,
      content: createSystemMessageContent("conversation_created", {
        actor: { user_id: 2, nickname: "Bob" }
      }),
      sender_nickname: undefined
    };

    expect(isSystemTimelineMessage(systemMessage)).toBe(true);
    expect(
      isSystemTimelineMessage({
        ...createMessage(2, "Bob"),
        type: 1
      })
    ).toBe(false);
  });

  test("normalizes online flags from backend payloads", () => {
    expect(normalizeOnlineFlag(true)).toBe(true);
    expect(normalizeOnlineFlag(1)).toBe(true);
    expect(normalizeOnlineFlag("1")).toBe(true);
    expect(normalizeOnlineFlag("true")).toBe(true);
    expect(normalizeOnlineFlag(false)).toBe(false);
    expect(normalizeOnlineFlag(0)).toBe(false);
    expect(normalizeOnlineFlag("0")).toBe(false);
    expect(normalizeOnlineFlag(undefined)).toBe(false);
  });
});
