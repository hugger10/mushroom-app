import { createSQLiteMobileDataRepository } from "../src/data/sqlite-data-repository";
import {
  openMobileSQLiteForUser,
  closeActiveMobileSQLiteConnection
} from "../src/data/sqlite-connection";
import {
  createMockConversation,
  createMockFriend,
  createMockMessage
} from "./helpers/mobile-test-helpers";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sqliteMock = require("react-native-nitro-sqlite") as {
  __resetNitroSQLiteMock: () => void;
  __getNitroSQLiteTable: (name: string) => Array<Record<string, unknown>>;
  __setStrictConversationServerIdUnique: (value: boolean) => void;
  open: jest.Mock;
};

describe("SQLite mobile data repository", () => {
  beforeEach(() => {
    sqliteMock.__resetNitroSQLiteMock();
    // 新实现要求按 uid 绑定 SQLite 连接；测试在此显式打开默认 uid 连接。
    closeActiveMobileSQLiteConnection();
    openMobileSQLiteForUser("test-user");
  });

  afterEach(() => {
    closeActiveMobileSQLiteConnection();
  });

  test("stores contacts, conversations, and messages in SQLite tables", async () => {
    const repository = createSQLiteMobileDataRepository();
    const conversation = createMockConversation({
      client_conversation_id: "conversation-a",
      server_conversation_id: "server-conversation-a",
      last_message_time: "2026-04-24T10:00:00.000Z",
      is_pinned: 1
    });

    await repository.upsertContacts([
      createMockFriend({ user_id: 3, nickname: "Charlie" }),
      createMockFriend({ user_id: 2, nickname: "Alice" })
    ]);
    await repository.upsertConversations([conversation]);
    await repository.upsertMessages([
      createMockMessage({
        client_message_id: "message-a",
        server_message_id: "server-message-a",
        client_conversation_id: "conversation-a",
        server_conversation_id: "server-conversation-a",
        sequence: 1,
        created_at: "2026-04-24T10:01:00.000Z"
      })
    ]);

    expect(
      (await repository.listContacts()).map(item => item.nickname)
    ).toEqual(["Alice", "Charlie"]);
    expect(
      await repository.getConversationByServerId("server-conversation-a")
    ).toMatchObject({
      client_conversation_id: "conversation-a"
    });
  });

  test("persists group read state across repository re-creation", async () => {
    const repository = createSQLiteMobileDataRepository();
    await repository.upsertGroupReadStates?.("server-conversation-a", [
      { user_id: 2, last_read_seq: 10 },
      { user_id: 3, last_read_seq: 4 }
    ]);

    const nextRepository = createSQLiteMobileDataRepository();
    const snapshot = await nextRepository.snapshot();

    expect(snapshot.groupReadStateByConversation).toMatchObject({
      "server-conversation-a": {
        2: 10,
        3: 4
      }
    });
  });

  test("reuses one SQLite connection for app data and address book cache", async () => {
    let runTest = async () => undefined;
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const isolatedSqliteMock = require("react-native-nitro-sqlite");
      isolatedSqliteMock.__resetNitroSQLiteMock();
      const {
        createSQLiteMobileDataRepository: createRepository
      } = require("../src/data/sqlite-data-repository");
      const {
        loadAddressBookMatchCache: loadCache,
        replaceAddressBookMatchCache: replaceCache
      } = require("../src/data/address-book-match-cache");
      const {
        openMobileSQLiteForUser: openForUser
      } = require("../src/data/sqlite-connection");
      // isolateModules 提供独立模块图，需要在隔离上下文里重新绑定 SQLite 连接。
      openForUser("test-user");
      /* eslint-enable @typescript-eslint/no-require-imports */

      runTest = async () => {
        const repository = createRepository();

        await repository.listContacts();
        await replaceCache([
          {
            phone_e164: "+8613800138000",
            local_display_name: "Alice",
            matched_user_id: 2,
            nickname: "Alice",
            username: "alice",
            avatar_url: null,
            matched_at: "2026-04-29T10:00:00.000Z"
          }
        ]);

        await expect(loadCache()).resolves.toMatchObject([
          {
            phone_e164: "+8613800138000",
            matched_user_id: 2
          }
        ]);
        expect(isolatedSqliteMock.open).toHaveBeenCalledTimes(1);
      };
    });
    await runTest();
  });

  test("keeps timeline order and recomputes conversation progress after message upserts", async () => {
    const repository = createSQLiteMobileDataRepository();
    await repository.upsertConversations([
      createMockConversation({
        client_conversation_id: "conversation-1",
        server_conversation_id: "server-conversation-1",
        last_server_sequence: 3
      })
    ]);

    await repository.upsertMessages([
      createMockMessage({
        client_message_id: "message-2",
        server_message_id: "server-message-2",
        sequence: 2,
        created_at: "2026-04-24T10:02:00.000Z"
      }),
      createMockMessage({
        client_message_id: "message-1",
        server_message_id: "server-message-1",
        sequence: 1,
        created_at: "2026-04-24T10:01:00.000Z"
      })
    ]);

    const messages = await repository.listMessages("conversation-1");
    const conversation =
      await repository.getConversationByClientId("conversation-1");

    expect(messages.map(item => item.client_message_id)).toEqual([
      "message-1",
      "message-2"
    ]);
    expect(conversation).toMatchObject({
      last_sync_sequence: 2,
      tail_loaded_from_seq: 1,
      tail_loaded_to_seq: 2,
      needs_backfill: 1,
      sync_gap_detected: 1
    });
  });

  test("persists message states independently and applies them to future messages", async () => {
    const repository = createSQLiteMobileDataRepository();
    await repository.upsertConversations([createMockConversation()]);
    await repository.applyMessageStates([
      {
        message_id: "server-message-1",
        conversation_id: "server-conversation-1",
        is_favorited: 1,
        is_pinned: 1,
        updated_at: "2026-04-24T11:00:00.000Z"
      }
    ]);
    await repository.upsertMessages([
      createMockMessage({
        client_message_id: "message-1",
        server_message_id: "server-message-1"
      })
    ]);

    const [message] = await repository.listMessages("conversation-1");
    expect(message).toMatchObject({
      is_favorited: 1,
      is_pinned: 1,
      updated_at: "2026-04-24T11:00:00.000Z"
    });
  });

  test("clears conversation messages and advances the local hidden floor", async () => {
    const repository = createSQLiteMobileDataRepository();
    await repository.upsertConversations([
      createMockConversation({
        last_server_sequence: 2
      })
    ]);
    await repository.upsertMessages([
      createMockMessage({ client_message_id: "message-1", sequence: 1 }),
      createMockMessage({
        client_message_id: "message-2",
        server_message_id: "server-message-2",
        sequence: 2
      })
    ]);

    await repository.clearConversationMessages("conversation-1");

    expect(await repository.listMessages("conversation-1")).toEqual([]);
    expect(
      await repository.getConversationByClientId("conversation-1")
    ).toMatchObject({
      last_sync_sequence: 2,
      tail_loaded_from_seq: 2,
      tail_loaded_to_seq: 2,
      history_complete: 1,
      needs_backfill: 0,
      sync_gap_detected: 0,
      unread_count: 0,
      local_hidden_before_seq: 2
    });
  });

  describe("server_conversation_id UNIQUE conflict handling", () => {
    test("serial: second upsert with a new client id but same server id collapses to a single row", async () => {
      const repository = createSQLiteMobileDataRepository();

      await repository.upsertConversations([
        createMockConversation({
          client_conversation_id: "client-A",
          server_conversation_id: "server-shared",
          name: "first",
          display_name: "first"
        })
      ]);
      await repository.upsertConversations([
        createMockConversation({
          client_conversation_id: "client-B",
          server_conversation_id: "server-shared",
          name: "second",
          display_name: "second"
        })
      ]);

      const rows = sqliteMock.__getNitroSQLiteTable("mobile_conversations");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        server_conversation_id: "server-shared"
      });

      const conversation =
        await repository.getConversationByServerId("server-shared");
      expect(conversation).not.toBeNull();
      // The payload reflects the second writer's content; the client id is
      // preserved as whichever one won the race (here the first one because
      // the defensive SELECT in upsertConversationRecord rewrites it).
      expect(conversation).toMatchObject({
        client_conversation_id: "client-A",
        display_name: "second"
      });
    });

    test("concurrent: two writers racing on the same server id never raise UNIQUE constraint", async () => {
      // Enable strict mode so the mock throws the exact native error whenever
      // an INSERT collides on server_conversation_id without an ON CONFLICT
      // clause covering it. This guards against future regressions where the
      // production INSERT loses the `ON CONFLICT(server_conversation_id)` arm.
      sqliteMock.__setStrictConversationServerIdUnique(true);

      const repository = createSQLiteMobileDataRepository();

      // Both writers bypass upsertConversations' internal serialization by
      // racing two top-level calls; each call independently runs the
      // SELECT-then-INSERT path inside upsertConversationRecord, so they can
      // both miss the defensive dedup SELECT.
      await expect(
        Promise.all([
          repository.upsertConversations([
            createMockConversation({
              client_conversation_id: "client-A",
              server_conversation_id: "server-shared",
              display_name: "A"
            })
          ]),
          repository.upsertConversations([
            createMockConversation({
              client_conversation_id: "client-B",
              server_conversation_id: "server-shared",
              display_name: "B"
            })
          ])
        ])
      ).resolves.not.toThrow();

      const rows = sqliteMock.__getNitroSQLiteTable("mobile_conversations");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        server_conversation_id: "server-shared"
      });
    });

    test("empty server_conversation_id is not subject to the unique index", async () => {
      const repository = createSQLiteMobileDataRepository();

      await repository.upsertConversations([
        createMockConversation({
          client_conversation_id: "client-A",
          server_conversation_id: "",
          name: "draft-A",
          display_name: "draft-A"
        }),
        createMockConversation({
          client_conversation_id: "client-B",
          server_conversation_id: "",
          name: "draft-B",
          display_name: "draft-B"
        })
      ]);

      const rows = sqliteMock.__getNitroSQLiteTable("mobile_conversations");
      expect(rows).toHaveLength(2);
      const clientIds = rows
        .map(row => row.client_conversation_id)
        .sort() as string[];
      expect(clientIds).toEqual(["client-A", "client-B"]);
    });

    test("partial-index UPSERT must include the index WHERE clause", async () => {
      // The unique index on server_conversation_id is partial; SQLite requires
      // any UPSERT targeting it to repeat the WHERE predicate verbatim.
      // Strict mode rethrows the parse-time error if the production INSERT
      // ever drops the `ON CONFLICT(server_conversation_id) WHERE ...` clause
      // or its trailing WHERE predicate.
      sqliteMock.__setStrictConversationServerIdUnique(true);

      const repository = createSQLiteMobileDataRepository();

      await expect(
        Promise.all([
          repository.upsertConversations([
            createMockConversation({
              client_conversation_id: "client-A",
              server_conversation_id: "server-shared",
              display_name: "A"
            })
          ]),
          repository.upsertConversations([
            createMockConversation({
              client_conversation_id: "client-B",
              server_conversation_id: "server-shared",
              display_name: "B"
            })
          ])
        ])
      ).resolves.not.toThrow();

      const rows = sqliteMock.__getNitroSQLiteTable("mobile_conversations");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        server_conversation_id: "server-shared"
      });
    });
  });

  describe("snapshot() and listRecentMessages() performance optimizations", () => {
    async function seedConversationWithSequencedMessages(
      repository: ReturnType<typeof createSQLiteMobileDataRepository>,
      clientConversationId: string,
      serverConversationId: string,
      count: number,
      options: { hiddenFloor?: number } = {}
    ) {
      // Insert conversation with hidden floor 0 first so upsertMessages does
      // not filter rows on insertion; raise the floor afterwards so it only
      // affects read paths (listRecentMessages, listMessages).
      await repository.upsertConversations([
        createMockConversation({
          client_conversation_id: clientConversationId,
          server_conversation_id: serverConversationId,
          last_server_sequence: count
        })
      ]);
      const messages = [];
      for (let i = 1; i <= count; i += 1) {
        messages.push(
          createMockMessage({
            client_message_id: `${clientConversationId}-msg-${i}`,
            server_message_id: `${serverConversationId}-msg-${i}`,
            client_conversation_id: clientConversationId,
            server_conversation_id: serverConversationId,
            sequence: i,
            created_at: `2026-05-01T10:00:00.${String(i).padStart(3, "0")}Z`
          })
        );
      }
      await repository.upsertMessages(messages);
      if (options.hiddenFloor !== undefined && options.hiddenFloor > 0) {
        await repository.upsertConversations([
          createMockConversation({
            client_conversation_id: clientConversationId,
            server_conversation_id: serverConversationId,
            last_server_sequence: count,
            local_hidden_before_seq: options.hiddenFloor
          })
        ]);
      }
    }

    test("snapshot fills only the active conversation; others get empty arrays", async () => {
      const repository = createSQLiteMobileDataRepository();
      await seedConversationWithSequencedMessages(
        repository,
        "conversation-1",
        "server-conversation-1",
        5
      );
      await seedConversationWithSequencedMessages(
        repository,
        "conversation-2",
        "server-conversation-2",
        5
      );

      const snapshot = await repository.snapshot({
        defaultMessageLimit: 50,
        activeClientConversationId: "conversation-1"
      });

      expect(snapshot.messagesByConversation["conversation-1"]).toHaveLength(5);
      expect(snapshot.messagesByConversation["conversation-2"]).toEqual([]);
    });

    test("snapshot returns empty arrays for every conversation when activeId is null", async () => {
      const repository = createSQLiteMobileDataRepository();
      await seedConversationWithSequencedMessages(
        repository,
        "conversation-1",
        "server-conversation-1",
        3
      );
      await seedConversationWithSequencedMessages(
        repository,
        "conversation-2",
        "server-conversation-2",
        3
      );

      const snapshot = await repository.snapshot({
        defaultMessageLimit: 50,
        activeClientConversationId: null
      });

      expect(snapshot.messagesByConversation["conversation-1"]).toEqual([]);
      expect(snapshot.messagesByConversation["conversation-2"]).toEqual([]);
    });

    test("listRecentMessages hits LIMIT and returns the most recent N sequenced rows", async () => {
      const repository = createSQLiteMobileDataRepository();
      await seedConversationWithSequencedMessages(
        repository,
        "conversation-1",
        "server-conversation-1",
        200
      );

      const recent = await repository.listRecentMessages!("conversation-1", {
        limit: 50
      });

      expect(recent).toHaveLength(50);
      // Returned in ASC timeline order (sequence 151..200).
      expect(recent[0].sequence).toBe(151);
      expect(recent[recent.length - 1].sequence).toBe(200);
    });

    test("listRecentMessages backfills outbox (sequence<=0) rows when sequenced rows are insufficient", async () => {
      const repository = createSQLiteMobileDataRepository();
      await repository.upsertConversations([
        createMockConversation({
          client_conversation_id: "conversation-1",
          server_conversation_id: "server-conversation-1",
          last_server_sequence: 3
        })
      ]);
      // 3 sequenced messages + 5 outbox-style messages (sequence = 0).
      await repository.upsertMessages([
        createMockMessage({
          client_message_id: "msg-seq-1",
          server_message_id: "server-msg-seq-1",
          sequence: 1,
          created_at: "2026-05-01T10:00:01.000Z"
        }),
        createMockMessage({
          client_message_id: "msg-seq-2",
          server_message_id: "server-msg-seq-2",
          sequence: 2,
          created_at: "2026-05-01T10:00:02.000Z"
        }),
        createMockMessage({
          client_message_id: "msg-seq-3",
          server_message_id: "server-msg-seq-3",
          sequence: 3,
          created_at: "2026-05-01T10:00:03.000Z"
        })
      ]);
      const outboxMessages = [];
      for (let i = 1; i <= 5; i += 1) {
        outboxMessages.push(
          createMockMessage({
            client_message_id: `msg-outbox-${i}`,
            server_message_id: "",
            sequence: 0,
            created_at: `2026-05-01T11:00:0${i}.000Z`
          })
        );
      }
      await repository.upsertMessages(outboxMessages);

      const recent = await repository.listRecentMessages!("conversation-1", {
        limit: 10
      });

      expect(recent).toHaveLength(8);
      // Sequenced (1..3) are in ASC order, followed by outbox by created_at ASC.
      const sequencedSlice = recent.filter(
        message => Number(message.sequence) > 0
      );
      const outboxSlice = recent.filter(
        message => Number(message.sequence) === 0
      );
      expect(sequencedSlice).toHaveLength(3);
      expect(outboxSlice).toHaveLength(5);
      expect(sequencedSlice.map(m => m.sequence)).toEqual([1, 2, 3]);
    });

    test("snapshot stays correct across two active-conversation switches", async () => {
      const repository = createSQLiteMobileDataRepository();
      await seedConversationWithSequencedMessages(
        repository,
        "conversation-1",
        "server-conversation-1",
        5
      );
      await seedConversationWithSequencedMessages(
        repository,
        "conversation-2",
        "server-conversation-2",
        5
      );
      await seedConversationWithSequencedMessages(
        repository,
        "conversation-3",
        "server-conversation-3",
        5
      );

      const snap1 = await repository.snapshot({
        defaultMessageLimit: 50,
        activeClientConversationId: "conversation-1"
      });
      expect(snap1.messagesByConversation["conversation-1"]).toHaveLength(5);
      expect(snap1.messagesByConversation["conversation-2"]).toEqual([]);
      expect(snap1.messagesByConversation["conversation-3"]).toEqual([]);

      const snap2 = await repository.snapshot({
        defaultMessageLimit: 50,
        activeClientConversationId: "conversation-2"
      });
      expect(snap2.messagesByConversation["conversation-1"]).toEqual([]);
      expect(snap2.messagesByConversation["conversation-2"]).toHaveLength(5);
      expect(snap2.messagesByConversation["conversation-3"]).toEqual([]);

      const snap3 = await repository.snapshot({
        defaultMessageLimit: 50,
        activeClientConversationId: null
      });
      expect(snap3.messagesByConversation["conversation-1"]).toEqual([]);
      expect(snap3.messagesByConversation["conversation-2"]).toEqual([]);
      expect(snap3.messagesByConversation["conversation-3"]).toEqual([]);
    });

    test("listRecentMessages does not affect listMessages full-load semantics", async () => {
      const repository = createSQLiteMobileDataRepository();
      await seedConversationWithSequencedMessages(
        repository,
        "conversation-1",
        "server-conversation-1",
        200
      );

      const recent = await repository.listRecentMessages!("conversation-1", {
        limit: 50
      });
      const all = await repository.listMessages("conversation-1");

      expect(recent).toHaveLength(50);
      expect(all).toHaveLength(200);
      // listMessages must remain in ASC timeline order from sequence 1..200.
      expect(all[0].sequence).toBe(1);
      expect(all[all.length - 1].sequence).toBe(200);
    });

    test("listRecentMessages respects local_hidden_before_seq", async () => {
      const repository = createSQLiteMobileDataRepository();
      // 100 messages with hidden floor set to 60: only sequence 61..100 visible.
      await seedConversationWithSequencedMessages(
        repository,
        "conversation-1",
        "server-conversation-1",
        100,
        { hiddenFloor: 60 }
      );

      const recent = await repository.listRecentMessages!("conversation-1", {
        limit: 50
      });

      expect(recent).toHaveLength(40);
      expect(recent[0].sequence).toBe(61);
      expect(recent[recent.length - 1].sequence).toBe(100);
    });
  });
});
