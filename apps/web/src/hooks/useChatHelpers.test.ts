import type { Conversation, Message } from "../types/chat";
import {
  applyConversationsPatch,
  applyMessagesPatch,
  mergeMessageLists
} from "./messagePatch";
import {
  getMessageFailureDisplayText,
  isBlockedSendFailure,
  sortMessagesForTimeline
} from "../utils/messageTimeline";

function buildMessage(overrides: Partial<Message>): Message {
  return {
    client_message_id: overrides.client_message_id || crypto.randomUUID(),
    server_message_id: overrides.server_message_id || "",
    client_conversation_id: overrides.client_conversation_id || "conv-1",
    sequence: overrides.sequence ?? 0,
    sender_id: overrides.sender_id ?? 1001,
    content: overrides.content ?? { type: 1, text: "hello" },
    type: overrides.type ?? 1,
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at,
    status: overrides.status ?? 0,
    is_recalled: overrides.is_recalled ?? 0,
    is_favorited: overrides.is_favorited ?? 0,
    is_pinned: overrides.is_pinned ?? 0,
    reply_to_message_id: overrides.reply_to_message_id ?? null,
    reply_to: overrides.reply_to ?? null,
    sender_nickname: overrides.sender_nickname,
    sender_avatar: overrides.sender_avatar,
    last_error: overrides.last_error ?? null,
    retry_count: overrides.retry_count ?? 0,
    next_retry_at: overrides.next_retry_at ?? null,
    forward_from: overrides.forward_from
  };
}

describe("useChatHelpers", () => {
  test("sortMessagesForTimeline keeps failed local messages after confirmed history", () => {
    const loaded = [
      buildMessage({
        client_message_id: "msg-3",
        sequence: 3,
        created_at: "2026-04-19T10:00:03.000Z"
      }),
      buildMessage({
        client_message_id: "msg-2",
        sequence: 2,
        created_at: "2026-04-19T10:00:02.000Z"
      }),
      buildMessage({
        client_message_id: "msg-1",
        sequence: 1,
        created_at: "2026-04-19T10:00:01.000Z"
      }),
      buildMessage({
        client_message_id: "msg-failed",
        sequence: 0,
        status: -1,
        last_error: "对方已经将你拉黑，无法发送消息",
        created_at: "2026-04-19T10:00:04.000Z"
      })
    ];

    expect(
      sortMessagesForTimeline(loaded).map(message => message.client_message_id)
    ).toEqual(["msg-1", "msg-2", "msg-3", "msg-failed"]);
  });

  test("marks block errors as non-retryable and shortens display text", () => {
    expect(isBlockedSendFailure("对方已经将你拉黑，无法发送消息")).toBe(true);
    expect(getMessageFailureDisplayText("你已拉黑对方，无法发送消息")).toBe(
      "你已经将对方屏蔽，消息未发送"
    );
    expect(getMessageFailureDisplayText("对方已经将你拉黑，无法发送消息")).toBe(
      "对方已经将你屏蔽，消息未发送"
    );
    expect(getMessageFailureDisplayText("network timeout")).toBe(
      "network timeout"
    );
  });

  describe("applyMessagesPatch", () => {
    const conversationId = "conv-1";

    test("returns previous reference when patch contains no changes", () => {
      const messages = [
        buildMessage({ client_message_id: "msg-1", sequence: 1 }),
        buildMessage({ client_message_id: "msg-2", sequence: 2 })
      ];
      const previous = { [conversationId]: messages };

      const next = applyMessagesPatch(previous, {
        clientConversationId: conversationId,
        upsertedMessages: [
          buildMessage({
            client_message_id: "msg-1",
            sequence: 1,
            // Same content as the existing entry — should not bust identity.
            content: messages[0].content
          })
        ]
      });

      expect(next).toBe(previous);
    });

    test("returns previous reference when conversation id is missing", () => {
      const previous = { [conversationId]: [] as Message[] };
      const next = applyMessagesPatch(previous, {
        upsertedMessages: [buildMessage({ client_message_id: "msg-1" })]
      });
      expect(next).toBe(previous);
    });

    test("merges new messages and preserves chronological order", () => {
      const previous = {
        [conversationId]: [
          buildMessage({ client_message_id: "msg-1", sequence: 1 })
        ]
      };

      const next = applyMessagesPatch(previous, {
        clientConversationId: conversationId,
        upsertedMessages: [
          buildMessage({ client_message_id: "msg-2", sequence: 2 })
        ]
      });

      expect(next).not.toBe(previous);
      expect(next[conversationId].map(m => m.client_message_id)).toEqual([
        "msg-1",
        "msg-2"
      ]);
    });

    test("removes messages listed in removedClientMessageIds", () => {
      const previous = {
        [conversationId]: [
          buildMessage({ client_message_id: "msg-1", sequence: 1 }),
          buildMessage({ client_message_id: "msg-2", sequence: 2 })
        ]
      };

      const next = applyMessagesPatch(previous, {
        clientConversationId: conversationId,
        removedClientMessageIds: ["msg-1"]
      });

      expect(next[conversationId].map(m => m.client_message_id)).toEqual([
        "msg-2"
      ]);
    });

    test("clearAllMessages drops the bucket entirely", () => {
      const previous = {
        [conversationId]: [
          buildMessage({ client_message_id: "msg-1", sequence: 1 })
        ]
      };

      const next = applyMessagesPatch(previous, {
        clientConversationId: conversationId,
        clearAllMessages: true
      });

      expect(next).not.toBe(previous);
      expect(next[conversationId]).toBeUndefined();
    });

    test("clearAllMessages on an unknown bucket is a no-op", () => {
      const previous = {
        [conversationId]: [
          buildMessage({ client_message_id: "msg-1", sequence: 1 })
        ]
      };

      const next = applyMessagesPatch(previous, {
        clientConversationId: "conv-unknown",
        clearAllMessages: true
      });

      expect(next).toBe(previous);
    });

    test("returns previous reference when patch has no upserts and no removals", () => {
      const previous = {
        [conversationId]: [
          buildMessage({ client_message_id: "msg-1", sequence: 1 })
        ]
      };

      const next = applyMessagesPatch(previous, {
        clientConversationId: conversationId
      });

      expect(next).toBe(previous);
    });

    test("upsert with status/content change rebuilds the bucket", () => {
      const original = buildMessage({
        client_message_id: "msg-1",
        sequence: 1,
        status: 0,
        content: { type: 1, text: "hello" }
      });
      const previous = { [conversationId]: [original] };

      const next = applyMessagesPatch(previous, {
        clientConversationId: conversationId,
        upsertedMessages: [
          buildMessage({
            client_message_id: "msg-1",
            sequence: 1,
            status: 1,
            content: { type: 1, text: "hello (edited)" }
          })
        ]
      });

      expect(next).not.toBe(previous);
      expect(next[conversationId][0].status).toBe(1);
      expect(next[conversationId][0].content).toEqual({
        type: 1,
        text: "hello (edited)"
      });
    });

    test("removal followed by upsert in the same patch keeps order stable", () => {
      const previous = {
        [conversationId]: [
          buildMessage({ client_message_id: "msg-1", sequence: 1 }),
          buildMessage({ client_message_id: "msg-2", sequence: 2 }),
          buildMessage({ client_message_id: "msg-3", sequence: 3 })
        ]
      };

      const next = applyMessagesPatch(previous, {
        clientConversationId: conversationId,
        removedClientMessageIds: ["msg-2"],
        upsertedMessages: [
          buildMessage({ client_message_id: "msg-4", sequence: 4 })
        ]
      });

      expect(next[conversationId].map(m => m.client_message_id)).toEqual([
        "msg-1",
        "msg-3",
        "msg-4"
      ]);
    });

    test("upsert detects sender_nickname/last_error drift via shallow compare", () => {
      const previous = {
        [conversationId]: [
          buildMessage({
            client_message_id: "msg-1",
            sequence: 1,
            sender_nickname: "Alice",
            last_error: null
          })
        ]
      };

      const next = applyMessagesPatch(previous, {
        clientConversationId: conversationId,
        upsertedMessages: [
          buildMessage({
            client_message_id: "msg-1",
            sequence: 1,
            sender_nickname: "Alice (renamed)",
            last_error: null
          })
        ]
      });

      expect(next).not.toBe(previous);
      expect(next[conversationId][0].sender_nickname).toBe("Alice (renamed)");
    });

    test("apply-message-states single-conversation payload patches is_favorited/is_pinned", () => {
      // Mirrors the IPC payload now emitted by the main-process
      // `db:apply-message-states` handler when exactly one conversation is
      // affected. Regression guard for the bug where the payload omitted
      // `clientConversationId` and the renderer silently dropped the
      // update.
      const previous = {
        [conversationId]: [
          buildMessage({
            client_message_id: "msg-1",
            sequence: 1,
            is_favorited: 0,
            is_pinned: 0
          })
        ]
      };

      const next = applyMessagesPatch(previous, {
        source: "db:apply-message-states",
        clientConversationId: conversationId,
        affectsMultipleConversations: false,
        upsertedMessages: [
          buildMessage({
            client_message_id: "msg-1",
            sequence: 1,
            is_favorited: 1,
            is_pinned: 1
          })
        ]
      } as Parameters<typeof applyMessagesPatch>[1]);

      expect(next).not.toBe(previous);
      expect(next[conversationId][0].is_favorited).toBe(1);
      expect(next[conversationId][0].is_pinned).toBe(1);
    });

    test("apply-message-states bulk payload (no clientConversationId) is a no-op", () => {
      // The multi-conversation path keeps the legacy shape so the renderer
      // falls back to a single `fetchConversations()` for metadata. The
      // patch helper itself must remain a no-op in that case.
      const previous = {
        [conversationId]: [
          buildMessage({ client_message_id: "msg-1", sequence: 1 })
        ]
      };

      const next = applyMessagesPatch(previous, {
        source: "db:apply-message-states",
        affectsMultipleConversations: true
      } as Parameters<typeof applyMessagesPatch>[1]);

      expect(next).toBe(previous);
    });
  });

  describe("mergeMessageLists", () => {
    test("dedupes by client_message_id, preferring the incoming entry", () => {
      const existing = [
        buildMessage({
          client_message_id: "msg-1",
          sequence: 1,
          status: 0
        })
      ];
      const incoming = [
        buildMessage({
          client_message_id: "msg-1",
          sequence: 1,
          status: 1
        })
      ];

      const merged = mergeMessageLists(existing, incoming);
      expect(merged).toHaveLength(1);
      expect(merged[0].status).toBe(1);
    });

    test("falls back to created_at ordering when sequence is missing or zero", () => {
      const merged = mergeMessageLists(
        [
          buildMessage({
            client_message_id: "old",
            sequence: 0,
            created_at: "2026-04-19T10:00:01.000Z"
          })
        ],
        [
          buildMessage({
            client_message_id: "new",
            sequence: 0,
            created_at: "2026-04-19T10:00:05.000Z"
          })
        ]
      );

      expect(merged.map(m => m.client_message_id)).toEqual(["old", "new"]);
    });
  });

  describe("applyConversationsPatch", () => {
    function buildConversation(
      overrides: Partial<Conversation> = {}
    ): Conversation {
      return {
        client_conversation_id:
          overrides.client_conversation_id || crypto.randomUUID(),
        server_conversation_id: overrides.server_conversation_id || "1",
        type: overrides.type ?? 1,
        name: overrides.name ?? "",
        avatar_url: overrides.avatar_url,
        last_message_content: overrides.last_message_content ?? {},
        last_message_time: overrides.last_message_time ?? "",
        last_message_send_id: overrides.last_message_send_id ?? 0,
        unread_count: overrides.unread_count ?? 0,
        mention_unread_count: overrides.mention_unread_count ?? 0,
        is_pinned: overrides.is_pinned ?? 0,
        is_muted: overrides.is_muted ?? 0,
        is_archived: overrides.is_archived ?? 0,
        is_locally_deleted: overrides.is_locally_deleted ?? 0,
        last_sync_sequence: overrides.last_sync_sequence ?? 0,
        last_server_sequence: overrides.last_server_sequence ?? 0,
        last_read_sequence: overrides.last_read_sequence ?? 0,
        tail_loaded_to_seq: overrides.tail_loaded_to_seq ?? 0,
        tail_loaded_from_seq: overrides.tail_loaded_from_seq ?? 0,
        local_hidden_before_seq: overrides.local_hidden_before_seq ?? 0,
        history_complete: overrides.history_complete ?? 1,
        needs_backfill: overrides.needs_backfill ?? 0,
        sync_gap_detected: overrides.sync_gap_detected ?? 0,
        ...overrides
      } as Conversation;
    }

    test("returns previous reference when nothing actually changed", () => {
      const conversation = buildConversation({
        client_conversation_id: "c-1",
        unread_count: 0
      });
      const previous = [conversation];

      const next = applyConversationsPatch(previous, [
        buildConversation({
          client_conversation_id: "c-1",
          unread_count: 0
        })
      ]);

      expect(next).toBe(previous);
    });

    test("patches matching conversations and preserves identity for the rest", () => {
      const a = buildConversation({
        client_conversation_id: "c-a",
        unread_count: 0
      });
      const b = buildConversation({
        client_conversation_id: "c-b",
        unread_count: 0
      });
      const previous = [a, b];

      const next = applyConversationsPatch(previous, [
        buildConversation({
          client_conversation_id: "c-a",
          unread_count: 5
        })
      ]);

      expect(next).not.toBe(previous);
      expect(next[0].unread_count).toBe(5);
      // The unaffected conversation keeps its original reference.
      expect(next[1]).toBe(b);
    });

    test("appends previously unseen conversations", () => {
      const a = buildConversation({
        client_conversation_id: "c-a",
        unread_count: 0
      });
      const previous = [a];

      const next = applyConversationsPatch(previous, [
        buildConversation({
          client_conversation_id: "c-b",
          unread_count: 1
        })
      ]);

      expect(next).not.toBe(previous);
      expect(next).toHaveLength(2);
      expect(next[0]).toBe(a);
      expect(next[1].client_conversation_id).toBe("c-b");
    });

    test("returns previous reference when updates list is empty", () => {
      const previous = [buildConversation({ client_conversation_id: "c-a" })];
      expect(applyConversationsPatch(previous, [])).toBe(previous);
    });

    test("detects last_message_content drift via deep compare", () => {
      const previous = [
        buildConversation({
          client_conversation_id: "c-a",
          last_message_content: { type: 1, text: "hello" }
        })
      ];

      const next = applyConversationsPatch(previous, [
        buildConversation({
          client_conversation_id: "c-a",
          last_message_content: { type: 1, text: "world" }
        })
      ]);

      expect(next).not.toBe(previous);
      expect(next[0].last_message_content).toEqual({
        type: 1,
        text: "world"
      });
    });

    test("detects display_name / display_avatar drift", () => {
      // Regression guard: the IPC patch path must not classify a payload
      // whose only delta is the rendered display name / avatar as a
      // no-op, otherwise the sidebar / header keeps stale values until
      // the next full fetch.
      const previous = [
        buildConversation({
          client_conversation_id: "c-a",
          display_name: "Alice",
          display_avatar: "alice.png"
        } as Partial<Conversation>)
      ];

      const next = applyConversationsPatch(previous, [
        buildConversation({
          client_conversation_id: "c-a",
          display_name: "Alice (renamed)",
          display_avatar: "alice2.png"
        } as Partial<Conversation>)
      ]);

      expect(next).not.toBe(previous);
      expect(next[0].display_name).toBe("Alice (renamed)");
      expect(next[0].display_avatar).toBe("alice2.png");
    });
  });
});
