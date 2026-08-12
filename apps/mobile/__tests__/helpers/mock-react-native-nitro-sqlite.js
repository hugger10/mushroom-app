const tables = new Map();
const openDatabaseNames = new Set();
// When true, the mock simulates SQLite's UNIQUE index on
// `mobile_conversations.server_conversation_id` strictly (i.e. throws the same
// `UNIQUE constraint failed` error that react-native-nitro-sqlite surfaces on
// device) instead of resolving the conflict via UPSERT semantics. Used by tests
// that want to ensure the production INSERT statement keeps declaring an
// `ON CONFLICT(server_conversation_id)` clause.
let strictConversationServerIdUnique = false;

function getRows(name) {
  if (!tables.has(name)) {
    tables.set(name, []);
  }
  return tables.get(name);
}

function createResult(rows = [], rowsAffected = rows.length) {
  return {
    rowsAffected,
    results: rows,
    rows: {
      _array: rows,
      length: rows.length,
      item: index => rows[index]
    }
  };
}

function upsert(rows, key, row) {
  const index = rows.findIndex(item => item[key] === row[key]);
  if (index >= 0) {
    rows[index] = { ...rows[index], ...row };
    return;
  }
  rows.push(row);
}

function deleteWhere(rows, key, value) {
  const initialLength = rows.length;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index][key] === value) {
      rows.splice(index, 1);
    }
  }
  return initialLength - rows.length;
}

async function executeAsync(query, params = []) {
  const normalizedQuery = query.trim().replace(/\s+/g, " ").toUpperCase();

  if (
    normalizedQuery.startsWith("CREATE TABLE") ||
    normalizedQuery.startsWith("CREATE INDEX") ||
    normalizedQuery.startsWith("CREATE UNIQUE INDEX")
  ) {
    return createResult();
  }

  if (normalizedQuery.startsWith("DELETE FROM ADDRESS_BOOK_MATCH_CACHE")) {
    const rows = getRows("address_book_match_cache");
    rows.splice(0, rows.length);
    return createResult();
  }

  if (normalizedQuery.startsWith("INSERT INTO ADDRESS_BOOK_MATCH_CACHE")) {
    const rows = getRows("address_book_match_cache");
    upsert(rows, "phone_e164", {
      phone_e164: params[0],
      local_display_name: params[1],
      matched_user_id: params[2],
      nickname: params[3],
      username: params[4],
      avatar_url: params[5],
      matched_at: params[6]
    });
    return createResult([], 1);
  }

  if (normalizedQuery.includes("FROM ADDRESS_BOOK_MATCH_CACHE")) {
    return createResult([...getRows("address_book_match_cache")]);
  }

  if (normalizedQuery.startsWith("INSERT INTO MOBILE_CONTACTS")) {
    const rows = getRows("mobile_contacts");
    upsert(rows, "user_id", {
      user_id: params[0],
      sort_name: params[1],
      payload: params[2]
    });
    return createResult([], 1);
  }

  if (normalizedQuery.startsWith("DELETE FROM MOBILE_CONTACTS")) {
    const rows = getRows("mobile_contacts");
    if (normalizedQuery.includes("WHERE USER_ID = ?")) {
      return createResult([], deleteWhere(rows, "user_id", params[0]));
    }
    const count = rows.length;
    rows.splice(0, rows.length);
    return createResult([], count);
  }

  if (normalizedQuery.includes("FROM MOBILE_CONTACTS")) {
    return createResult(
      [...getRows("mobile_contacts")].sort((left, right) =>
        String(left.sort_name).localeCompare(String(right.sort_name))
      )
    );
  }

  if (normalizedQuery.startsWith("INSERT INTO MOBILE_GROUP_READ_STATES")) {
    const rows = getRows("mobile_group_read_states");
    const serverConversationId = params[0];
    const readerUserId = params[1];
    const incomingSeq = Number(params[2] ?? 0);
    const existing = rows.find(
      item =>
        item.server_conversation_id === serverConversationId &&
        Number(item.reader_user_id) === Number(readerUserId)
    );
    if (existing) {
      existing.last_read_seq = Math.max(
        Number(existing.last_read_seq || 0),
        incomingSeq
      );
      existing.updated_at = "now";
    } else {
      rows.push({
        server_conversation_id: serverConversationId,
        reader_user_id: readerUserId,
        last_read_seq: incomingSeq,
        updated_at: "now"
      });
    }
    return createResult([], 1);
  }

  if (normalizedQuery.startsWith("DELETE FROM MOBILE_GROUP_READ_STATES")) {
    const rows = getRows("mobile_group_read_states");
    if (normalizedQuery.includes("WHERE SERVER_CONVERSATION_ID = ?")) {
      return createResult(
        [],
        deleteWhere(rows, "server_conversation_id", params[0])
      );
    }
    const count = rows.length;
    rows.splice(0, rows.length);
    return createResult([], count);
  }

  if (normalizedQuery.includes("FROM MOBILE_GROUP_READ_STATES")) {
    return createResult(
      [...getRows("mobile_group_read_states")].filter(
        item => Number(item.last_read_seq || 0) > 0
      )
    );
  }

  if (normalizedQuery.startsWith("INSERT INTO MOBILE_CONVERSATIONS")) {
    const rows = getRows("mobile_conversations");
    const clientId = params[0];
    const serverId = params[1];
    const incoming = {
      client_conversation_id: clientId,
      server_conversation_id: serverId,
      last_message_time: params[2],
      is_pinned: params[3],
      is_archived: params[4],
      payload: params[5]
    };
    const hasServerId =
      serverId !== undefined && serverId !== null && serverId !== "";
    // Mimic the production INSERT's two ON CONFLICT targets:
    //   1) ON CONFLICT(client_conversation_id) DO UPDATE SET ... (updates all)
    //   2) ON CONFLICT(server_conversation_id) DO UPDATE SET ... (preserves the
    //      pre-existing client_conversation_id; cannot rewrite the PK)
    // SQLite resolves the *first* matching conflict target, so we check the
    // client id first and only fall through to server-id resolution when the
    // client id is brand new.
    const existingByClient = rows.find(
      item => item.client_conversation_id === clientId
    );
    if (existingByClient) {
      Object.assign(existingByClient, incoming);
      return createResult([], 1);
    }
    if (hasServerId) {
      const existingByServer = rows.find(
        item => item.server_conversation_id === serverId
      );
      if (existingByServer) {
        const declaresServerIdConflictTarget = normalizedQuery.includes(
          "ON CONFLICT(SERVER_CONVERSATION_ID)"
        );
        // The production unique index on server_conversation_id is a *partial*
        // index (WHERE server_conversation_id IS NOT NULL AND ... <> ''),
        // so SQLite requires the UPSERT to repeat that exact WHERE predicate.
        // We check for the normalized (upper-cased, single-spaced) form here.
        const declaresPartialIndexWhereClause = normalizedQuery.includes(
          "ON CONFLICT(SERVER_CONVERSATION_ID) WHERE SERVER_CONVERSATION_ID IS NOT NULL AND SERVER_CONVERSATION_ID <> ''"
        );
        if (strictConversationServerIdUnique) {
          if (!declaresServerIdConflictTarget) {
            // Reproduce the exact native error surfaced by
            // react-native-nitro-sqlite when an INSERT collides on the UNIQUE
            // index without any ON CONFLICT clause covering it.
            throw new Error(
              "UNIQUE constraint failed: mobile_conversations.server_conversation_id"
            );
          }
          if (!declaresPartialIndexWhereClause) {
            // Reproduce the parse-time error SQLite raises when an UPSERT
            // targets a partial unique index without repeating its WHERE
            // predicate verbatim.
            throw new Error(
              "2nd ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint"
            );
          }
        }
        // Preserve the pre-existing client_conversation_id (SQLite UPSERT
        // cannot mutate the primary key), update everything else.
        existingByServer.last_message_time = incoming.last_message_time;
        existingByServer.is_pinned = incoming.is_pinned;
        existingByServer.is_archived = incoming.is_archived;
        existingByServer.payload = incoming.payload;
        return createResult([], 1);
      }
    }
    rows.push(incoming);
    return createResult([], 1);
  }

  if (normalizedQuery.startsWith("DELETE FROM MOBILE_CONVERSATIONS")) {
    const rows = getRows("mobile_conversations");
    if (normalizedQuery.includes("WHERE CLIENT_CONVERSATION_ID = ?")) {
      return createResult(
        [],
        deleteWhere(rows, "client_conversation_id", params[0])
      );
    }
    const count = rows.length;
    rows.splice(0, rows.length);
    return createResult([], count);
  }

  if (normalizedQuery.includes("FROM MOBILE_CONVERSATIONS")) {
    let rows = [...getRows("mobile_conversations")];
    if (normalizedQuery.includes("WHERE CLIENT_CONVERSATION_ID = ?")) {
      rows = rows.filter(item => item.client_conversation_id === params[0]);
    } else if (normalizedQuery.includes("WHERE SERVER_CONVERSATION_ID = ?")) {
      rows = rows.filter(item => item.server_conversation_id === params[0]);
    } else {
      rows.sort((left, right) => {
        const archivedDiff =
          Number(left.is_archived || 0) - Number(right.is_archived || 0);
        if (archivedDiff !== 0) return archivedDiff;
        const pinnedDiff =
          Number(right.is_pinned || 0) - Number(left.is_pinned || 0);
        if (pinnedDiff !== 0) return pinnedDiff;
        return String(right.last_message_time || "").localeCompare(
          String(left.last_message_time || "")
        );
      });
    }
    return createResult(
      rows.slice(0, normalizedQuery.includes("LIMIT 1") ? 1 : rows.length)
    );
  }

  if (normalizedQuery.startsWith("INSERT INTO MOBILE_MESSAGES")) {
    const rows = getRows("mobile_messages");
    upsert(rows, "client_message_id", {
      client_message_id: params[0],
      server_message_id: params[1],
      client_conversation_id: params[2],
      sequence: params[3],
      created_at: params[4],
      payload: params[5]
    });
    return createResult([], 1);
  }

  if (normalizedQuery.startsWith("UPDATE MOBILE_MESSAGES")) {
    const rows = getRows("mobile_messages");
    const row = rows.find(item => item.client_message_id === params[1]);
    if (row) {
      row.payload = params[0];
      return createResult([], 1);
    }
    return createResult([], 0);
  }

  if (normalizedQuery.startsWith("DELETE FROM MOBILE_MESSAGES")) {
    const rows = getRows("mobile_messages");
    if (normalizedQuery.includes("WHERE CLIENT_CONVERSATION_ID = ?")) {
      return createResult(
        [],
        deleteWhere(rows, "client_conversation_id", params[0])
      );
    }
    const count = rows.length;
    rows.splice(0, rows.length);
    return createResult([], count);
  }

  if (normalizedQuery.includes("FROM MOBILE_MESSAGES")) {
    let rows = [...getRows("mobile_messages")];
    if (
      normalizedQuery.includes("WHERE CLIENT_MESSAGE_ID = ? OR") &&
      normalizedQuery.includes("SERVER_MESSAGE_ID = ?")
    ) {
      rows = rows.filter(
        item =>
          item.client_message_id === params[0] ||
          (!!item.server_message_id && item.server_message_id === params[1])
      );
    } else if (normalizedQuery.includes("WHERE SERVER_MESSAGE_ID = ?")) {
      rows = rows.filter(item => item.server_message_id === params[0]);
    } else if (
      normalizedQuery.includes("WHERE CLIENT_CONVERSATION_ID = ?") &&
      normalizedQuery.includes("AND SEQUENCE > ?") &&
      normalizedQuery.includes("ORDER BY SEQUENCE DESC") &&
      normalizedQuery.includes("LIMIT ?")
    ) {
      // listRecentMessages sequenced branch:
      //   WHERE client_conversation_id = ? AND sequence > ?
      //   ORDER BY sequence DESC LIMIT ?
      const conversationId = params[0];
      const hiddenFloor = Number(params[1] ?? 0);
      const limit = Math.max(1, Number(params[2] ?? 1));
      rows = rows
        .filter(item => item.client_conversation_id === conversationId)
        .filter(item => Number(item.sequence || 0) > hiddenFloor)
        .sort((left, right) => {
          const sequenceDiff =
            Number(right.sequence || 0) - Number(left.sequence || 0);
          if (sequenceDiff !== 0) return sequenceDiff;
          return String(right.created_at || "").localeCompare(
            String(left.created_at || "")
          );
        })
        .slice(0, limit);
      return createResult(rows);
    } else if (
      normalizedQuery.includes("WHERE CLIENT_CONVERSATION_ID = ?") &&
      normalizedQuery.includes("COALESCE(SEQUENCE, 0) <= 0") &&
      normalizedQuery.includes("ORDER BY CREATED_AT DESC") &&
      normalizedQuery.includes("LIMIT ?")
    ) {
      // listRecentMessages outbox-补量 branch:
      //   WHERE client_conversation_id = ? AND COALESCE(sequence, 0) <= 0
      //   ORDER BY created_at DESC LIMIT ?
      const conversationId = params[0];
      const limit = Math.max(1, Number(params[1] ?? 1));
      rows = rows
        .filter(item => item.client_conversation_id === conversationId)
        .filter(item => Number(item.sequence || 0) <= 0)
        .sort((left, right) =>
          String(right.created_at || "").localeCompare(
            String(left.created_at || "")
          )
        )
        .slice(0, limit);
      return createResult(rows);
    } else if (normalizedQuery.includes("WHERE CLIENT_CONVERSATION_ID = ?")) {
      rows = rows.filter(item => item.client_conversation_id === params[0]);
      rows.sort((left, right) => {
        const sequenceDiff =
          Number(left.sequence || 0) - Number(right.sequence || 0);
        if (sequenceDiff !== 0) return sequenceDiff;
        const createdDiff = String(left.created_at || "").localeCompare(
          String(right.created_at || "")
        );
        if (createdDiff !== 0) return createdDiff;
        return String(left.client_message_id || "").localeCompare(
          String(right.client_message_id || "")
        );
      });
    }
    return createResult(
      rows.slice(0, normalizedQuery.includes("LIMIT 1") ? 1 : rows.length)
    );
  }

  if (normalizedQuery.startsWith("INSERT INTO MOBILE_MESSAGE_STATES")) {
    const rows = getRows("mobile_message_states");
    upsert(rows, "message_id", {
      message_id: params[0],
      conversation_id: params[1],
      is_favorited: params[2],
      is_pinned: params[3],
      updated_at: params[4],
      payload: params[5]
    });
    return createResult([], 1);
  }

  if (normalizedQuery.startsWith("DELETE FROM MOBILE_MESSAGE_STATES")) {
    const rows = getRows("mobile_message_states");
    const count = rows.length;
    rows.splice(0, rows.length);
    return createResult([], count);
  }

  if (normalizedQuery.includes("FROM MOBILE_MESSAGE_STATES")) {
    let rows = [...getRows("mobile_message_states")];
    if (normalizedQuery.includes("WHERE MESSAGE_ID = ?")) {
      rows = rows.filter(item => item.message_id === params[0]);
    }
    return createResult(
      rows.slice(0, normalizedQuery.includes("LIMIT 1") ? 1 : rows.length)
    );
  }

  if (normalizedQuery.startsWith("INSERT INTO MEDIA_CACHE")) {
    const rows = getRows("media_cache");
    const existing = rows.find(
      item =>
        item.username === params[0] &&
        item.remote_url === params[1] &&
        item.category === params[2]
    );
    const row = {
      id: existing?.id || rows.length + 1,
      username: params[0],
      remote_url: params[1],
      category: params[2],
      message_id: params[3] ?? existing?.message_id ?? null,
      upload_id: params[4] ?? existing?.upload_id ?? null,
      original_name: params[5] ?? existing?.original_name ?? null,
      mime_type: params[6] ?? existing?.mime_type ?? null,
      size: params[7] ?? existing?.size ?? null,
      sha256: params[8] ?? existing?.sha256 ?? null,
      local_path: params[9] ?? existing?.local_path ?? null,
      month_key: params[10],
      status: params[11],
      created_at: existing?.created_at || params[12],
      updated_at: params[13],
      last_accessed_at: params[14]
    };
    if (existing) {
      Object.assign(existing, row);
    } else {
      rows.push(row);
    }
    return createResult([], 1);
  }

  if (normalizedQuery.startsWith("UPDATE MEDIA_CACHE")) {
    const rows = getRows("media_cache");
    if (normalizedQuery.includes("WHERE ID = ?")) {
      const row = rows.find(item => item.id === params[1]);
      if (row) {
        if (normalizedQuery.includes("LAST_ACCESSED_AT")) {
          row.last_accessed_at = params[0];
        }
        if (normalizedQuery.includes("STATUS = 'MISSING'")) {
          row.status = "missing";
          row.updated_at = params[0];
        }
        return createResult([], 1);
      }
    }
    return createResult([], 0);
  }

  if (normalizedQuery.includes("FROM MEDIA_CACHE")) {
    let rows = [...getRows("media_cache")];
    if (
      normalizedQuery.includes("WHERE USERNAME = ? AND REMOTE_URL = ?") &&
      normalizedQuery.includes("CATEGORY = ?")
    ) {
      rows = rows.filter(
        item =>
          item.username === params[0] &&
          item.remote_url === params[1] &&
          item.category === params[2] &&
          item.status !== "deleted"
      );
    } else if (
      normalizedQuery.includes("WHERE USERNAME = ? AND SHA256 = ?") &&
      normalizedQuery.includes("CATEGORY = ?")
    ) {
      rows = rows.filter(
        item =>
          item.username === params[0] &&
          item.sha256 === params[1] &&
          item.category === params[2] &&
          item.status === "ready"
      );
    }
    return createResult(
      rows.slice(0, normalizedQuery.includes("LIMIT 1") ? 1 : rows.length)
    );
  }

  return createResult();
}

function createConnection() {
  let databaseName = "";
  return {
    close: jest.fn(() => {
      if (databaseName) {
        openDatabaseNames.delete(databaseName);
      }
    }),
    delete: jest.fn(),
    attach: jest.fn(),
    detach: jest.fn(),
    transaction: jest.fn(async callback => callback(createConnection())),
    execute: jest.fn(() => createResult()),
    executeBatch: jest.fn(() => ({ rowsAffected: 0 })),
    executeBatchAsync: jest.fn(async () => ({ rowsAffected: 0 })),
    loadFile: jest.fn(() => ({ rowsAffected: 0 })),
    loadFileAsync: jest.fn(async () => ({ rowsAffected: 0 })),
    executeAsync: jest.fn(executeAsync),
    __setDatabaseName(name) {
      databaseName = name;
    }
  };
}

const open = jest.fn(options => {
  const name = options?.name || "";
  if (openDatabaseNames.has(name)) {
    throw new Error(
      `database ${name} is already open, there is already a connection to the database`
    );
  }

  openDatabaseNames.add(name);
  const connection = createConnection();
  connection.__setDatabaseName(name);
  return connection;
});

module.exports = {
  __esModule: true,
  __resetNitroSQLiteMock() {
    tables.clear();
    openDatabaseNames.clear();
    open.mockClear();
    strictConversationServerIdUnique = false;
  },
  __getNitroSQLiteTable(name) {
    return [...getRows(name)];
  },
  __setStrictConversationServerIdUnique(value) {
    strictConversationServerIdUnique = Boolean(value);
  },
  open,
  QuickSQLite: {}
};
