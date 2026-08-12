import type {
  ContactListItem,
  Conversation,
  Message,
  MessageReactionEntry,
  MessageStateRecord,
  UserProfile
} from "@mushroom/shared";
import type {
  AuthSessionSnapshot,
  LocalDataSnapshot,
  SyncCheckpointSnapshot
} from "./types";
import {
  buildConversationBlankPatch,
  calculateConversationCutoff as calculateConversationCutoffShared
} from "./conversation-blanking";
import { recomputeConversationSyncProgress } from "./conversation-sync";

export interface KeyValueStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface AuthSessionStore {
  read(): Promise<AuthSessionSnapshot>;
  write(snapshot: AuthSessionSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export interface SyncCheckpointStore {
  read(): Promise<SyncCheckpointSnapshot>;
  write(
    patch: Partial<SyncCheckpointSnapshot>
  ): Promise<SyncCheckpointSnapshot>;
  clear(): Promise<void>;
}

export interface LocalMessageReactionRecord extends MessageReactionEntry {
  message_id: string;
  conversation_id: string;
  /**
   * Per-conversation sequence assigned by the server. Optional for legacy
   * snapshots that pre-date the delta protocol; optimistic local writes use a
   * negative placeholder until the server response replaces it.
   */
  sequence?: number;
}

/**
 * Single delta event coming from the per-conversation reaction sequence stream.
 * `is_deleted=1` represents a tombstone (reaction removed).
 */
export interface LocalReactionDeltaRecord {
  message_id: string;
  conversation_id: string;
  client_conversation_id: string;
  user_id: number;
  emoji: string | null;
  sequence: number;
  is_deleted: 0 | 1;
  updated_at: string;
}

export interface MobileDataRepository {
  listContacts(): Promise<ContactListItem[]>;
  upsertContacts(contacts: ContactListItem[]): Promise<void>;
  removeContacts(userIds: number[]): Promise<void>;
  listConversations(): Promise<Conversation[]>;
  getConversationByClientId(
    clientConversationId: string
  ): Promise<Conversation | null>;
  upsertConversations(conversations: Conversation[]): Promise<void>;
  removeConversations(clientConversationIds: string[]): Promise<void>;
  getConversationByServerId(
    serverConversationId: string
  ): Promise<Conversation | null>;
  listMessages(clientConversationId: string): Promise<Message[]>;
  /**
   * 仅加载某会话最近的 N 条可见消息。用于 publishSnapshot 等高频路径，
   * 避免在历史很长的会话上做全量扫描。SQLite 实现必须走 sequence DESC
   * 索引早停；in-memory 实现可使用 listMessages + slice 兜底。
   */
  listRecentMessages?(
    clientConversationId: string,
    options: { limit: number }
  ): Promise<Message[]>;
  upsertMessages(messages: Message[]): Promise<void>;
  applyMessageStates(states: MessageStateRecord[]): Promise<void>;
  applyMessageReactions(reactions: LocalMessageReactionRecord[]): Promise<void>;
  removeMessageReaction(messageId: string, userId: number): Promise<void>;
  loadReactionsByMessageIds(
    messageIds: string[]
  ): Promise<LocalMessageReactionRecord[]>;
  replaceReactionsForMessages(
    messageIds: string[],
    reactions: LocalMessageReactionRecord[]
  ): Promise<void>;
  /**
   * Apply ordered reaction delta events. Implementations MUST:
   *   - process events in input order (caller already sorts ascending by sequence);
   *   - for `is_deleted=1` tombstones, remove any matching `(message_id, user_id)` row;
   *   - otherwise upsert the active reaction (single emoji per user per message);
   *   - skip events whose `sequence` is not strictly greater than the existing row's
   *     `sequence` to stay idempotent;
   *   - never advance the per-conversation cursor by themselves — callers are
   *     responsible for invoking `setReactionCursor` after a successful page.
   */
  applyReactionDeltas(deltas: LocalReactionDeltaRecord[]): Promise<void>;
  /** Read the per-conversation reaction sync cursor (max applied sequence). */
  getReactionCursor(clientConversationId: string): Promise<number>;
  /** Persist the per-conversation reaction sync cursor. Monotonically increasing. */
  setReactionCursor(
    clientConversationId: string,
    sequence: number
  ): Promise<void>;
  clearConversationMessages(clientConversationId: string): Promise<void>;
  /**
   * 按 client_message_id 精确删除指定会话下的若干条消息行。
   *
   * 仅用于"删除失败附件草稿"这类**纯本地未上链**场景：调用方必须先自行
   * 校验消息状态（如 `status === -1 && !server_message_id`），仓库实现
   * 本身不再做语义守卫；缺失的 cmid 静默忽略，保证幂等。
   *
   * 实现可选；老仓库未实现时 controller 层会按 no-op 处理（仅清 outbox
   * refs 和发件箱队列行）。
   */
  deleteLocalMessages?(
    clientConversationId: string,
    clientMessageIds: string[]
  ): Promise<void>;
  softDeleteConversation(clientConversationId: string): Promise<void>;
  /**
   * 群聊已读高水位（本地缓存，可持久化）。
   *
   * 由 controller 在收到 WS `group_read` 帧 / 调用 `GET /api/conversation/:id/read-state`
   * 后批量推进。语义：对每个 (conv, reader) 取 max（单调递增，永不回退）。
   * 本地缓存用于冷启动列表离线展示；服务端仍是权威来源，重连/打开会话会继续校准。
   *
   * - 私聊不写入此通道（私聊已读复用 `Conversation.peer_last_read_sequence`）。
   * - reader === sender 的项调用方应在写入前过滤；实现侧不做防御性 dedupe。
   */
  upsertGroupReadStates?(
    serverConversationId: string,
    entries: ReadonlyArray<{ user_id: number; last_read_seq: number }>
  ): Promise<void>;
  /**
   * 在收到群聊 `conversation.sync action=remove` 或本地删除会话时清空对应缓存。
   * 实现可选；in-memory 与 SQLite 都视为 no-op-safe（不存在的 key 直接忽略）。
   */
  clearGroupReadState?(serverConversationId: string): Promise<void>;
  /**
   * 用户切换 read_receipts_visibility 到关闭（=2）时一次性清空所有群已读
   * 缓存，避免历史 high-water-mark 让 UI 在 session 内仍残留 ✓✓。
   * 实现可选；老仓库实现缺失时 controller 仍能继续工作（依赖 inbound 帧
   * 的 gate 兜底）。
   */
  clearAllGroupReadStates?(): Promise<void>;
  /**
   * 服务端经 delta / tail 响应中的 `reached_history_start=true` 显式
   * 确认本会话再无更老历史时调用。语义与 Electron 端
   * `db:mark-history-complete` IPC 对齐：仅收敛与"历史已完整"直接相关的
   * 三列（history_complete / local_hidden_before_seq / tail_loaded_from_seq），
   * 不动 sync_gap_detected / needs_backfill / last_sync_sequence，
   * 让下一轮 recomputeConversationSyncProgress 自然复算。
   *
   * 实现可选；老 repo（in-memory test 等）未实现时调用方按 no-op 处理。
   */
  markHistoryComplete?(
    clientConversationId: string,
    oldestVisibleSequence: number
  ): Promise<void>;
  clear(): Promise<void>;
  snapshot(options?: {
    messageLimitByConversation?: Record<string, number>;
    defaultMessageLimit?: number;
    /**
     * 仅对此会话加载完整的最近消息；其他会话返回空数组。
     * 用于在长会话历史下消除 publishSnapshot 的 N×全量扫描卡顿。
     * 不传或为 null 时由实现自行决定行为：
     *   - SQLite 实现：所有会话返回空数组（UI 仅消费 active key）。
     *   - in-memory 实现：忽略此字段，保持旧行为以兼容测试 fixture。
     */
    activeClientConversationId?: string | null;
  }): Promise<LocalDataSnapshot>;
}

const EMPTY_AUTH_SNAPSHOT: AuthSessionSnapshot = {
  accessToken: null,
  refreshToken: null,
  user: null,
  profile: null
};

const EMPTY_CHECKPOINT_SNAPSHOT: SyncCheckpointSnapshot = {
  contacts: null,
  conversations: null,
  messageStates: null
};

const EMPTY_DATA_SNAPSHOT: LocalDataSnapshot = {
  contacts: [],
  conversations: [],
  messagesByConversation: {},
  groupReadStateByConversation: {}
};

function cloneAuthSnapshot(snapshot: AuthSessionSnapshot): AuthSessionSnapshot {
  return {
    accessToken: snapshot.accessToken,
    refreshToken: snapshot.refreshToken,
    user: snapshot.user ? { ...snapshot.user } : null,
    profile: snapshot.profile ? { ...(snapshot.profile as UserProfile) } : null
  };
}

function cloneDataSnapshot(snapshot: LocalDataSnapshot): LocalDataSnapshot {
  return {
    contacts: snapshot.contacts.map(item => ({ ...item })),
    conversations: snapshot.conversations.map(item => ({
      ...item,
      members: item.members?.map(member => ({ ...member }))
    })),
    messagesByConversation: Object.fromEntries(
      Object.entries(snapshot.messagesByConversation).map(([key, messages]) => [
        key,
        messages.map(item => ({ ...item }))
      ])
    ),
    groupReadStateByConversation: Object.fromEntries(
      Object.entries(snapshot.groupReadStateByConversation ?? {}).map(
        ([key, readers]) => [key, { ...readers }]
      )
    )
  };
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// computeContiguousSequence removed; the active reconciliation path lives
// in `recomputeConversationSyncProgress` (conversation-sync.ts), which
// delegates to the shared sync-engine.

function getConversationHiddenFloor(conversation: Conversation) {
  return Number(conversation.local_hidden_before_seq ?? 0);
}

function isMessageVisibleForConversation(
  message: Message,
  hiddenFloor: number
) {
  const sequence = Number(message.sequence || 0);
  return sequence <= 0 || sequence > hiddenFloor;
}

function compareMessagesForTimeline(left: Message, right: Message) {
  const leftSequence = Number(left.sequence || 0);
  const rightSequence = Number(right.sequence || 0);

  if (leftSequence > 0 && rightSequence > 0 && leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  const createdAtCompare = String(left.created_at || "").localeCompare(
    String(right.created_at || "")
  );
  if (createdAtCompare !== 0) {
    return createdAtCompare;
  }

  return String(left.client_message_id || "").localeCompare(
    String(right.client_message_id || "")
  );
}

function limitTimelineMessages(messages: Message[], limit?: number) {
  if (!limit || limit <= 0 || messages.length <= limit) {
    return messages;
  }

  return messages.slice(-limit);
}

function calculateConversationCutoff(
  conversation: Conversation,
  messages: Message[]
) {
  return calculateConversationCutoffShared(conversation, messages);
}

function recomputeConversationProgress(
  conversation: Conversation,
  messages: Message[]
): Conversation {
  return recomputeConversationSyncProgress(conversation, messages);
}

export function createJsonBackedAuthSessionStore(options: {
  storage: KeyValueStorage;
  key?: string;
  initialSnapshot?: Partial<AuthSessionSnapshot>;
}): AuthSessionStore {
  const key = options.key ?? "mushroom.mobile.auth";
  let state: AuthSessionSnapshot | null = null;

  async function ensureLoaded() {
    if (state) {
      return state;
    }

    const stored = await options.storage.getItem(key);
    state = {
      ...EMPTY_AUTH_SNAPSHOT,
      ...options.initialSnapshot,
      ...safeJsonParse<Partial<AuthSessionSnapshot>>(stored, {})
    };
    return state;
  }

  async function persist() {
    if (!state) {
      return;
    }
    await options.storage.setItem(key, JSON.stringify(state));
  }

  return {
    async read() {
      return cloneAuthSnapshot(await ensureLoaded());
    },
    async write(snapshot) {
      state = cloneAuthSnapshot({
        ...EMPTY_AUTH_SNAPSHOT,
        ...snapshot
      });
      await persist();
    },
    async clear() {
      state = cloneAuthSnapshot(EMPTY_AUTH_SNAPSHOT);
      await options.storage.removeItem(key);
    }
  };
}

export function createJsonBackedSyncCheckpointStore(options: {
  storage: KeyValueStorage;
  key?: string;
  initialSnapshot?: Partial<SyncCheckpointSnapshot>;
}): SyncCheckpointStore {
  const key = options.key ?? "mushroom.mobile.sync-checkpoints";
  let state: SyncCheckpointSnapshot | null = null;

  async function ensureLoaded() {
    if (state) {
      return state;
    }

    const stored = await options.storage.getItem(key);
    const parsed = safeJsonParse<Partial<SyncCheckpointSnapshot>>(stored, {});
    state = {
      ...EMPTY_CHECKPOINT_SNAPSHOT,
      ...options.initialSnapshot,
      ...parsed,
      contacts: parsed.contacts ?? null
    };
    return state;
  }

  async function persist() {
    if (!state) {
      return;
    }
    await options.storage.setItem(key, JSON.stringify(state));
  }

  return {
    async read() {
      return { ...(await ensureLoaded()) };
    },
    async write(patch) {
      state = {
        ...(await ensureLoaded()),
        ...patch
      };
      await persist();
      return { ...state };
    },
    async clear() {
      state = { ...EMPTY_CHECKPOINT_SNAPSHOT };
      await options.storage.removeItem(key);
    }
  };
}

export function createJsonBackedMobileDataRepository(options: {
  storage: KeyValueStorage;
  key?: string;
  initialSnapshot?: Partial<LocalDataSnapshot>;
}): MobileDataRepository {
  const key = options.key ?? "mushroom.mobile.data";
  let state: LocalDataSnapshot | null = null;
  let reactionsByMessageId: Record<string, LocalMessageReactionRecord[]> = {};
  let reactionCursorsByConversation: Record<string, number> = {};

  let groupReadPersistTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleGroupReadPersist() {
    if (groupReadPersistTimer !== null) {
      clearTimeout(groupReadPersistTimer);
    }
    groupReadPersistTimer = setTimeout(() => {
      groupReadPersistTimer = null;
      void persist();
    }, 500);
  }

  function hydrateMessageReactions(message: Message): Message {
    const entries = reactionsByMessageId[String(message.server_message_id)];
    if (!entries || entries.length === 0) {
      return { ...message };
    }
    return {
      ...message,
      reactions: entries.map(entry => ({
        user_id: entry.user_id,
        emoji: entry.emoji,
        updated_at: entry.updated_at
      }))
    };
  }

  async function ensureLoaded() {
    if (state) {
      return state;
    }

    const stored = await options.storage.getItem(key);
    type PersistedShape = Partial<LocalDataSnapshot> & {
      reactionsByMessageId?: Record<string, LocalMessageReactionRecord[]>;
      reactionCursorsByConversation?: Record<string, number>;
    };
    const parsed = safeJsonParse<PersistedShape>(stored, {});
    reactionsByMessageId = parsed.reactionsByMessageId ?? {};
    reactionCursorsByConversation = parsed.reactionCursorsByConversation ?? {};
    state = cloneDataSnapshot({
      ...EMPTY_DATA_SNAPSHOT,
      ...options.initialSnapshot,
      ...parsed,
      contacts: parsed.contacts ?? [],
      groupReadStateByConversation:
        parsed.groupReadStateByConversation ??
        options.initialSnapshot?.groupReadStateByConversation ??
        {}
    });
    return state;
  }

  async function persist() {
    if (!state) {
      return;
    }
    const persisted = {
      ...state,
      reactionsByMessageId,
      reactionCursorsByConversation
    };
    await options.storage.setItem(key, JSON.stringify(persisted));
  }

  function sortConversations(items: Conversation[]) {
    return [...items].sort((left, right) => {
      const archivedDiff =
        Number(left.is_archived || 0) - Number(right.is_archived || 0);
      if (archivedDiff !== 0) {
        return archivedDiff;
      }

      const pinnedDiff =
        Number(right.is_pinned || 0) - Number(left.is_pinned || 0);
      if (pinnedDiff !== 0) {
        return pinnedDiff;
      }

      return String(right.last_message_time || "").localeCompare(
        String(left.last_message_time || "")
      );
    });
  }

  return {
    async listContacts() {
      const current = await ensureLoaded();
      return current.contacts.map(item => ({ ...item }));
    },
    async upsertContacts(contacts) {
      const current = await ensureLoaded();
      const byId = new Map(current.contacts.map(item => [item.user_id, item]));
      for (const contact of contacts) {
        byId.set(contact.user_id, {
          ...byId.get(contact.user_id),
          ...contact
        });
      }
      current.contacts = Array.from(byId.values()).sort((left, right) =>
        String(left.nickname || left.username).localeCompare(
          String(right.nickname || right.username)
        )
      );
      await persist();
    },
    async removeContacts(userIds) {
      const current = await ensureLoaded();
      const removed = new Set(userIds.map(item => Number(item)));
      current.contacts = current.contacts.filter(
        item => !removed.has(Number(item.user_id))
      );
      await persist();
    },
    async listConversations() {
      const current = await ensureLoaded();
      return sortConversations(current.conversations).map(item => ({
        ...item,
        members: item.members?.map(member => ({ ...member }))
      }));
    },
    async getConversationByClientId(clientConversationId) {
      const current = await ensureLoaded();
      const conversation =
        current.conversations.find(
          item => item.client_conversation_id === clientConversationId
        ) ?? null;
      return conversation
        ? {
            ...conversation,
            members: conversation.members?.map(member => ({ ...member }))
          }
        : null;
    },
    async upsertConversations(conversations) {
      const current = await ensureLoaded();
      const byId = new Map(
        current.conversations.map(item => [item.client_conversation_id, item])
      );
      for (const conversation of conversations) {
        const existing = byId.get(conversation.client_conversation_id);
        byId.set(conversation.client_conversation_id, {
          ...existing,
          ...conversation,
          members: conversation.members?.map(member => ({ ...member }))
        });
      }
      current.conversations = sortConversations(Array.from(byId.values()));
      await persist();
    },
    async removeConversations(clientConversationIds) {
      const current = await ensureLoaded();
      const removed = new Set(clientConversationIds);
      current.conversations = current.conversations.filter(
        item => !removed.has(item.client_conversation_id)
      );
      for (const conversationId of removed) {
        delete current.messagesByConversation[conversationId];
      }
      await persist();
    },
    async getConversationByServerId(serverConversationId) {
      const current = await ensureLoaded();
      const conversation =
        current.conversations.find(
          item => item.server_conversation_id === serverConversationId
        ) ?? null;
      return conversation
        ? {
            ...conversation,
            members: conversation.members?.map(member => ({ ...member }))
          }
        : null;
    },
    async listMessages(clientConversationId) {
      const current = await ensureLoaded();
      const conversation =
        current.conversations.find(
          item => item.client_conversation_id === clientConversationId
        ) ?? null;
      const hiddenFloor = conversation
        ? getConversationHiddenFloor(conversation)
        : 0;
      return (current.messagesByConversation[clientConversationId] ?? [])
        .filter(item => isMessageVisibleForConversation(item, hiddenFloor))
        .map(item => hydrateMessageReactions(item));
    },
    async upsertMessages(messages) {
      const current = await ensureLoaded();
      const grouped = new Map<string, Message[]>();

      for (const message of messages) {
        if (!message.client_conversation_id) {
          continue;
        }
        const bucket = grouped.get(message.client_conversation_id) ?? [];
        bucket.push({ ...message });
        grouped.set(message.client_conversation_id, bucket);
      }

      for (const [conversationId, items] of grouped) {
        const conversation =
          current.conversations.find(
            item => item.client_conversation_id === conversationId
          ) ?? null;
        const hiddenFloor = conversation
          ? getConversationHiddenFloor(conversation)
          : 0;
        const existing = current.messagesByConversation[conversationId]
          ? [...current.messagesByConversation[conversationId]].filter(item =>
              isMessageVisibleForConversation(item, hiddenFloor)
            )
          : [];
        for (const item of items) {
          if (!isMessageVisibleForConversation(item, hiddenFloor)) {
            continue;
          }
          const existingIndex = existing.findIndex(
            existingItem =>
              (item.server_message_id &&
                existingItem.server_message_id === item.server_message_id) ||
              (!!item.client_message_id &&
                existingItem.client_message_id === item.client_message_id)
          );

          if (existingIndex >= 0) {
            existing[existingIndex] = {
              ...existing[existingIndex],
              ...item
            };
            continue;
          }

          existing.push({ ...item });
        }

        const nextMessages = existing.sort(compareMessagesForTimeline);
        current.messagesByConversation[conversationId] = nextMessages;

        const conversationIndex = current.conversations.findIndex(
          item => item.client_conversation_id === conversationId
        );
        if (conversationIndex >= 0) {
          current.conversations[conversationIndex] =
            recomputeConversationProgress(
              current.conversations[conversationIndex],
              nextMessages
            );
        }
      }

      current.conversations = sortConversations(current.conversations);
      await persist();
    },
    async applyMessageStates(states) {
      const current = await ensureLoaded();
      const statesByMessageId = new Map(
        states.map(item => [item.message_id, item])
      );

      for (const [conversationId, messages] of Object.entries(
        current.messagesByConversation
      )) {
        current.messagesByConversation[conversationId] = messages.map(
          message => {
            const stateRecord = statesByMessageId.get(
              message.server_message_id
            );
            if (!stateRecord) {
              return message;
            }
            return {
              ...message,
              is_favorited: stateRecord.is_favorited,
              is_pinned: stateRecord.is_pinned,
              updated_at: stateRecord.updated_at
            };
          }
        );
      }

      await persist();
    },
    async applyMessageReactions(reactions) {
      await ensureLoaded();
      for (const entry of reactions) {
        const messageId = String(entry.message_id);
        const list = reactionsByMessageId[messageId] ?? [];
        const existing = list.find(
          item => Number(item.user_id) === Number(entry.user_id)
        );
        const incomingSequence = Number(entry.sequence ?? 0);
        // For positive sequences (server-confirmed), drop stale events.
        if (
          existing &&
          incomingSequence > 0 &&
          Number(existing.sequence ?? 0) > 0 &&
          Number(existing.sequence ?? 0) >= incomingSequence
        ) {
          continue;
        }
        const filtered = list.filter(
          item => Number(item.user_id) !== Number(entry.user_id)
        );
        filtered.push({
          message_id: messageId,
          conversation_id: String(entry.conversation_id),
          user_id: Number(entry.user_id),
          emoji: entry.emoji,
          updated_at: entry.updated_at,
          sequence: entry.sequence
        });
        reactionsByMessageId[messageId] = filtered.sort((a, b) =>
          String(a.updated_at).localeCompare(String(b.updated_at))
        );
      }
      await persist();
    },
    async removeMessageReaction(messageId, userId) {
      await ensureLoaded();
      const reactionKey = String(messageId);
      const list = reactionsByMessageId[reactionKey];
      if (!list) {
        return;
      }
      const next = list.filter(item => Number(item.user_id) !== Number(userId));
      if (next.length === 0) {
        delete reactionsByMessageId[reactionKey];
      } else {
        reactionsByMessageId[reactionKey] = next;
      }
      await persist();
    },
    async loadReactionsByMessageIds(messageIds) {
      await ensureLoaded();
      const result: LocalMessageReactionRecord[] = [];
      for (const id of messageIds) {
        const list = reactionsByMessageId[String(id)];
        if (!list) continue;
        for (const entry of list) {
          result.push({ ...entry });
        }
      }
      return result;
    },
    async replaceReactionsForMessages(messageIds, reactions) {
      await ensureLoaded();
      for (const id of messageIds) {
        delete reactionsByMessageId[String(id)];
      }
      const grouped = new Map<string, LocalMessageReactionRecord[]>();
      for (const entry of reactions) {
        const groupKey = String(entry.message_id);
        const list = grouped.get(groupKey) ?? [];
        list.push({
          message_id: groupKey,
          conversation_id: String(entry.conversation_id),
          user_id: Number(entry.user_id),
          emoji: entry.emoji,
          updated_at: entry.updated_at,
          sequence: entry.sequence
        });
        grouped.set(groupKey, list);
      }
      for (const [groupKey, list] of grouped) {
        reactionsByMessageId[groupKey] = list.sort((a, b) =>
          String(a.updated_at).localeCompare(String(b.updated_at))
        );
      }
      await persist();
    },
    async applyReactionDeltas(deltas) {
      if (!deltas || deltas.length === 0) {
        return;
      }
      await ensureLoaded();
      // Caller is expected to hand us events in ascending sequence order;
      // we still defensively re-sort to stay correct under buggy callers.
      const ordered = [...deltas].sort(
        (left, right) => Number(left.sequence) - Number(right.sequence)
      );
      for (const event of ordered) {
        const messageId = String(event.message_id);
        const incomingSequence = Number(event.sequence ?? 0);
        const existingList = reactionsByMessageId[messageId] ?? [];
        const existing = existingList.find(
          item => Number(item.user_id) === Number(event.user_id)
        );
        if (
          existing &&
          incomingSequence > 0 &&
          Number(existing.sequence ?? 0) > 0 &&
          Number(existing.sequence ?? 0) >= incomingSequence
        ) {
          continue;
        }
        if (event.is_deleted === 1 || event.emoji === null) {
          if (!existing) {
            continue;
          }
          const next = existingList.filter(
            item => Number(item.user_id) !== Number(event.user_id)
          );
          if (next.length === 0) {
            delete reactionsByMessageId[messageId];
          } else {
            reactionsByMessageId[messageId] = next;
          }
          continue;
        }
        const filtered = existingList.filter(
          item => Number(item.user_id) !== Number(event.user_id)
        );
        filtered.push({
          message_id: messageId,
          conversation_id: String(event.conversation_id),
          user_id: Number(event.user_id),
          emoji: event.emoji,
          updated_at: event.updated_at,
          sequence: incomingSequence
        });
        reactionsByMessageId[messageId] = filtered.sort((a, b) =>
          String(a.updated_at).localeCompare(String(b.updated_at))
        );
      }
      await persist();
    },
    async getReactionCursor(clientConversationId) {
      await ensureLoaded();
      return Number(reactionCursorsByConversation[clientConversationId] ?? 0);
    },
    async setReactionCursor(clientConversationId, sequence) {
      await ensureLoaded();
      const next = Number(sequence ?? 0);
      const current = Number(
        reactionCursorsByConversation[clientConversationId] ?? 0
      );
      if (next <= current) {
        return;
      }
      reactionCursorsByConversation[clientConversationId] = next;
      await persist();
    },
    async clearConversationMessages(clientConversationId) {
      const current = await ensureLoaded();
      const conversationIndex = current.conversations.findIndex(
        item => item.client_conversation_id === clientConversationId
      );
      if (conversationIndex >= 0) {
        const conversation = current.conversations[conversationIndex];
        const existingMessages =
          current.messagesByConversation[clientConversationId] ?? [];
        const cutoff = calculateConversationCutoff(
          conversation,
          existingMessages
        );
        current.messagesByConversation[clientConversationId] = [];
        current.conversations[conversationIndex] = {
          ...conversation,
          ...buildConversationBlankPatch(cutoff, { markLocallyDeleted: false })
        };
      } else {
        current.messagesByConversation[clientConversationId] = [];
      }

      current.conversations = sortConversations(current.conversations);
      await persist();
    },
    async deleteLocalMessages(clientConversationId, clientMessageIds) {
      if (!clientMessageIds || clientMessageIds.length === 0) return;
      const current = await ensureLoaded();
      const existing =
        current.messagesByConversation[clientConversationId] ?? [];
      if (existing.length === 0) return;
      const removalSet = new Set(clientMessageIds.map(String));
      const next = existing.filter(
        item => !removalSet.has(String(item.client_message_id))
      );
      if (next.length === existing.length) return;
      current.messagesByConversation[clientConversationId] = next;
      await persist();
    },
    async softDeleteConversation(clientConversationId) {
      const current = await ensureLoaded();
      const conversationIndex = current.conversations.findIndex(
        item => item.client_conversation_id === clientConversationId
      );
      if (conversationIndex >= 0) {
        const conversation = current.conversations[conversationIndex];
        const existingMessages =
          current.messagesByConversation[clientConversationId] ?? [];
        const cutoff = calculateConversationCutoff(
          conversation,
          existingMessages
        );
        current.messagesByConversation[clientConversationId] = [];
        current.conversations[conversationIndex] = {
          ...conversation,
          ...buildConversationBlankPatch(cutoff, { markLocallyDeleted: true })
        };
      } else {
        current.messagesByConversation[clientConversationId] = [];
      }

      current.conversations = sortConversations(current.conversations);
      await persist();
    },
    async upsertGroupReadStates(serverConversationId, entries) {
      if (!serverConversationId || entries.length === 0) {
        return;
      }
      const current = await ensureLoaded();
      const bucket = current.groupReadStateByConversation[serverConversationId]
        ? { ...current.groupReadStateByConversation[serverConversationId] }
        : {};
      let changed = false;
      for (const entry of entries) {
        const readerId = Number(entry.user_id);
        const incoming = Number(entry.last_read_seq || 0);
        if (!Number.isFinite(readerId) || readerId <= 0 || incoming <= 0) {
          continue;
        }
        const previous = bucket[readerId] ?? 0;
        if (incoming > previous) {
          bucket[readerId] = incoming;
          changed = true;
        }
      }
      if (!changed) {
        return;
      }
      current.groupReadStateByConversation = {
        ...current.groupReadStateByConversation,
        [serverConversationId]: bucket
      };
      scheduleGroupReadPersist();
    },
    async clearGroupReadState(serverConversationId) {
      if (!serverConversationId) return;
      const current = await ensureLoaded();
      if (!current.groupReadStateByConversation[serverConversationId]) {
        return;
      }
      const next = { ...current.groupReadStateByConversation };
      delete next[serverConversationId];
      current.groupReadStateByConversation = next;
      scheduleGroupReadPersist();
    },
    async clearAllGroupReadStates() {
      const current = await ensureLoaded();
      if (Object.keys(current.groupReadStateByConversation).length === 0) {
        return;
      }
      current.groupReadStateByConversation = {};
      scheduleGroupReadPersist();
    },
    async clear() {
      if (groupReadPersistTimer !== null) {
        clearTimeout(groupReadPersistTimer);
        groupReadPersistTimer = null;
      }
      state = cloneDataSnapshot(EMPTY_DATA_SNAPSHOT);
      reactionsByMessageId = {};
      reactionCursorsByConversation = {};
      await options.storage.removeItem(key);
    },
    async snapshot(options) {
      const current = cloneDataSnapshot(await ensureLoaded());
      const hydratedMessagesByConversation = Object.fromEntries(
        Object.entries(current.messagesByConversation).map(
          ([conversationId, messages]) => [
            conversationId,
            messages.map(message => hydrateMessageReactions(message))
          ]
        )
      );
      if (
        !options?.defaultMessageLimit &&
        !options?.messageLimitByConversation
      ) {
        return {
          ...current,
          messagesByConversation: hydratedMessagesByConversation
        };
      }

      return {
        ...current,
        messagesByConversation: Object.fromEntries(
          Object.entries(hydratedMessagesByConversation).map(
            ([conversationId, messages]) => [
              conversationId,
              limitTimelineMessages(
                messages,
                options.messageLimitByConversation?.[conversationId] ??
                  options.defaultMessageLimit
              )
            ]
          )
        )
      };
    }
  };
}
