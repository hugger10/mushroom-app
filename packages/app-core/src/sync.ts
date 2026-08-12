import type {
  ContactListItem,
  Conversation,
  MessageStateRecord,
  MushroomApi,
  RemoteConversation,
  RemoteMessage
} from "@mushroom/shared";
import { hasContactChanged } from "@mushroom/shared";
import {
  mapBlockedUserToContactListItem,
  mapContactToContactListItem,
  mapRemoteConversation,
  mapRemoteMessage,
  createClientConversationId
} from "./mappers";
import type {
  LocalMessageReactionRecord,
  LocalReactionDeltaRecord,
  MobileDataRepository,
  SyncCheckpointStore
} from "./storage";
import type { SyncMetrics } from "./types";

const CONVERSATION_PAGE_SIZE = 500;
const MESSAGE_SYNC_CONCURRENCY = 6;
const MESSAGE_DELTA_PAGE_SIZE = 200;
const MESSAGE_TAIL_PAGE_SIZE = 50;
const MESSAGE_STATE_PAGE_SIZE = 200;
const REACTION_RECONCILE_BATCH_SIZE = 100;
const REACTION_DELTA_PAGE_LIMIT = 500;
const CONTACTS_SYNC_MIN_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export interface ConversationMessageSyncTask {
  conversation_id: string;
  client_conversation_id: string;
  last_sequence: number;
  server_sequence: number;
  sync_mode: "delta" | "tail";
}

function serializeSyncCursor(syncCursor?: Date | string | null) {
  if (!syncCursor) {
    return undefined;
  }
  return syncCursor instanceof Date ? syncCursor.toISOString() : syncCursor;
}

function getConversationSyncAnchor(conversation: Conversation) {
  return Math.max(
    Number(conversation.last_sync_sequence || 0),
    Number(conversation.tail_loaded_to_seq || 0),
    Number(conversation.local_hidden_before_seq || 0)
  );
}

function applyConversationPreviewVisibility(
  conversation: Conversation,
  hiddenBeforeSequence: number
) {
  if (Number(conversation.last_server_sequence || 0) > hiddenBeforeSequence) {
    return conversation;
  }

  return {
    ...conversation,
    last_message_content: {},
    last_message_time: "",
    last_message_send_id: 0,
    unread_count: 0,
    mention_unread_count: 0
  };
}

function diffContacts(remote: ContactListItem[], local: ContactListItem[]) {
  const localMap = new Map(local.map(item => [item.user_id, item]));
  const remoteIds = new Set(remote.map(item => item.user_id));

  const added: ContactListItem[] = [];
  const updated: ContactListItem[] = [];
  const removed: ContactListItem[] = [];

  for (const item of remote) {
    const localItem = localMap.get(item.user_id);
    if (!localItem) {
      added.push(item);
      continue;
    }
    if (hasContactChanged(item, localItem)) {
      updated.push(item);
    }
  }

  for (const item of local) {
    if (!remoteIds.has(item.user_id)) {
      removed.push(item);
    }
  }

  return { added, updated, removed };
}

function diffConversations(
  remote: RemoteConversation[],
  local: Conversation[],
  isIncremental = false
) {
  const localIds = new Set(local.map(item => item.server_conversation_id));
  const localMap = new Map(
    local.map(item => [item.server_conversation_id, item])
  );
  const remoteIds = new Set(remote.map(item => item.id));

  const added: Conversation[] = [];
  const updated: Conversation[] = [];
  const removed: Conversation[] = [];
  const messageBackfill: ConversationMessageSyncTask[] = [];

  for (const item of remote) {
    const remoteServerSequence = Number(item.last_sync_sequence ?? 0);

    if (!localIds.has(item.id)) {
      const clientConversationId = createClientConversationId();
      const mapped = mapRemoteConversation(item, clientConversationId);
      mapped.last_server_sequence = remoteServerSequence;
      mapped.sync_gap_detected = remoteServerSequence > 0 ? 1 : 0;
      mapped.tail_loaded_from_seq = 0;
      mapped.tail_loaded_to_seq = 0;
      mapped.history_complete = remoteServerSequence > 0 ? 0 : 1;
      mapped.needs_backfill = remoteServerSequence > 0 ? 1 : 0;
      added.push(mapped);
      if (remoteServerSequence > 0) {
        messageBackfill.push({
          conversation_id: item.id,
          client_conversation_id: clientConversationId,
          last_sequence: 0,
          server_sequence: remoteServerSequence,
          sync_mode: "tail"
        });
      }
      continue;
    }

    const localConversation = localMap.get(item.id) as Conversation;
    let mapped = mapRemoteConversation(
      item,
      localConversation.client_conversation_id
    );
    const localLastSyncSequence = Number(
      localConversation.last_sync_sequence || 0
    );
    const localLastServerSequence = Number(
      localConversation.last_server_sequence ?? localLastSyncSequence
    );
    const localTailLoadedToSequence = Number(
      localConversation.tail_loaded_to_seq ?? 0
    );
    const localTailLoadedFromSequence = Number(
      localConversation.tail_loaded_from_seq ?? 0
    );
    const localHistoryComplete = Number(
      localConversation.history_complete ?? 0
    );
    const localHiddenBeforeSequence = Number(
      localConversation.local_hidden_before_seq ?? 0
    );
    const isLocallyDeleted =
      Number(localConversation.is_locally_deleted ?? 0) > 0;
    const remoteLastReadSequence = Number(mapped.last_read_sequence ?? 0);
    const localLastReadSequence = Number(
      localConversation.last_read_sequence ?? 0
    );
    const syncAnchor = Math.max(
      localLastSyncSequence,
      localTailLoadedToSequence,
      localHiddenBeforeSequence
    );
    const shouldRestoreLocallyDeletedConversation =
      remoteServerSequence > localHiddenBeforeSequence;
    const shouldPreserveLocalReadState =
      localLastReadSequence > remoteLastReadSequence;
    const shouldPreserveManualUnreadState =
      Number(localConversation.manual_unread_count || 0) > 0;

    mapped.last_sync_sequence = Math.max(
      localLastSyncSequence,
      localHiddenBeforeSequence
    );
    mapped.last_server_sequence = Math.max(
      localLastServerSequence,
      remoteServerSequence
    );
    mapped.tail_loaded_from_seq = localTailLoadedFromSequence;
    mapped.tail_loaded_to_seq = Math.max(
      localTailLoadedToSequence,
      Number(mapped.tail_loaded_to_seq ?? 0)
    );
    mapped.history_complete = localHistoryComplete;
    mapped.local_hidden_before_seq = localHiddenBeforeSequence;
    mapped.is_locally_deleted =
      isLocallyDeleted && !shouldRestoreLocallyDeletedConversation ? 1 : 0;
    const effectiveSyncAnchor = getConversationSyncAnchor(mapped);
    mapped.needs_backfill =
      mapped.is_locally_deleted === 1
        ? 0
        : Number(mapped.last_server_sequence || 0) > effectiveSyncAnchor ||
            Number(mapped.history_complete || 0) === 0
          ? 1
          : 0;
    mapped.sync_gap_detected =
      mapped.is_locally_deleted === 1
        ? 0
        : Number(mapped.needs_backfill || 0) > 0 ||
            Number(mapped.last_server_sequence || 0) >
              Math.max(localLastSyncSequence, localHiddenBeforeSequence)
          ? 1
          : 0;
    mapped.last_read_sequence = Math.max(
      Number(localConversation.last_read_sequence ?? 0),
      localHiddenBeforeSequence
    );

    if (shouldPreserveLocalReadState) {
      mapped.unread_count = localConversation.unread_count ?? 0;
    }
    // mention_unread_count 是纯客户端字段，服务端不返回。同步映射后恒为 0，
    // 因此这里必须基于权威 unread_count 重新对齐：仍未读则保留本地 @ 计数，
    // 已读（unread_count==0）才清零。否则会话热更新/重载后 "有人@你" 会丢失。
    mapped.mention_unread_count =
      Number(mapped.unread_count || 0) <= 0
        ? 0
        : Number(localConversation.mention_unread_count ?? 0);
    if (shouldPreserveManualUnreadState) {
      mapped.unread_count = Math.max(
        Number(mapped.unread_count || 0),
        Number(localConversation.unread_count || 0),
        Number(localConversation.manual_unread_count || 0)
      );
      mapped.manual_unread_count = Number(
        localConversation.manual_unread_count || 0
      );
    } else {
      mapped.manual_unread_count = 0;
    }
    mapped = applyConversationPreviewVisibility(
      mapped,
      localHiddenBeforeSequence
    );
    if (mapped.is_locally_deleted === 1) {
      mapped.last_message_content = {};
      mapped.last_message_time = "";
      mapped.last_message_send_id = 0;
      mapped.unread_count = 0;
      mapped.mention_unread_count = 0;
      mapped.manual_unread_count = 0;
    }

    updated.push(mapped);

    if (remoteServerSequence > syncAnchor) {
      if (mapped.is_locally_deleted === 1) {
        continue;
      }
      messageBackfill.push({
        conversation_id: item.id,
        client_conversation_id: localConversation.client_conversation_id,
        last_sequence: syncAnchor,
        server_sequence: remoteServerSequence,
        sync_mode:
          localTailLoadedToSequence <= 0 && localLastSyncSequence <= 0
            ? "tail"
            : "delta"
      });
    }
  }

  if (!isIncremental) {
    for (const item of local) {
      if (!remoteIds.has(item.server_conversation_id)) {
        removed.push(item);
      }
    }
  }

  return { added, updated, removed, messageBackfill };
}

async function persistRemoteReactions(
  _repository: MobileDataRepository,
  _remoteMessages: RemoteMessage[]
) {
  // Reactions are now synced exclusively through the per-conversation delta
  // channel (`api.listReactionDeltas`). The reactions array still rides on
  // `RemoteMessage` for backward compatibility with older clients, but new
  // clients deliberately ignore it here so we never overwrite richer local
  // state (e.g. tombstones, sequence numbers) with a stale snapshot.
  return;
}

async function fetchRemoteMessages(
  api: MushroomApi,
  repository: MobileDataRepository,
  tasks: ConversationMessageSyncTask[]
) {
  // Bounded concurrency: previously this loop fired one request at a time
  // across N conversations, so first-sync latency scaled linearly with the
  // user's conversation count. We now keep up to `MESSAGE_SYNC_CONCURRENCY`
  // network requests in flight while serialising the SQLite writes through
  // a single promise chain — repository.upsertMessages opens its own
  // transactions and concurrent writes from multiple tasks would otherwise
  // contend (`SQLITE_BUSY`) and double-write conversation rows.
  let syncedMessages = 0;
  let writeChain: Promise<void> = Promise.resolve();
  const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
    const next = writeChain.then(task);
    writeChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  async function runTailTask(task: ConversationMessageSyncTask) {
    const { data } = await api.listMessages({
      conversationId: task.conversation_id,
      clientConversationId: task.client_conversation_id,
      limit: MESSAGE_TAIL_PAGE_SIZE
    });
    await enqueueWrite(async () => {
      await repository.upsertMessages(
        data.messages.map(item =>
          mapRemoteMessage(item, task.client_conversation_id)
        )
      );
      await persistRemoteReactions(repository, data.messages);
      const conversation = await repository.getConversationByServerId(
        task.conversation_id
      );
      if (conversation) {
        await repository.upsertConversations([
          {
            ...conversation,
            last_server_sequence: Number(
              data.max_sequence || data.loaded_to_sequence || 0
            )
          }
        ]);
      }
      // 服务端权威信号：当本次 tail 页已触达可见历史起点时，立即把
      // history_complete=1。等价于桌面端 `markHistoryComplete` 通路，
      // 避免后续重复入队 history backfill 任务。
      if (
        data.reached_history_start === true &&
        repository.markHistoryComplete
      ) {
        const visibleFrom = Number(
          data.visible_from_sequence ?? data.loaded_from_sequence ?? 0
        );
        await repository.markHistoryComplete(
          task.client_conversation_id,
          visibleFrom
        );
      }
    });
    syncedMessages += data.messages.length;
  }

  async function runDeltaTask(task: ConversationMessageSyncTask) {
    let afterSequence = Number(task.last_sequence ?? 0);
    const serverSequence = Number(task.server_sequence ?? afterSequence);

    while (afterSequence < serverSequence) {
      const { data } = await api.syncMessageDelta({
        conversationId: task.conversation_id,
        clientConversationId: task.client_conversation_id,
        afterSequence,
        limit: MESSAGE_DELTA_PAGE_SIZE
      });
      await enqueueWrite(async () => {
        await repository.upsertMessages(
          data.messages.map(item =>
            mapRemoteMessage(item, task.client_conversation_id)
          )
        );
        await persistRemoteReactions(repository, data.messages);
        const conversation = await repository.getConversationByServerId(
          task.conversation_id
        );
        if (conversation) {
          await repository.upsertConversations([
            {
              ...conversation,
              last_server_sequence: Number(data.max_sequence || serverSequence)
            }
          ]);
        }
      });
      syncedMessages += data.messages.length;

      afterSequence = Math.max(
        afterSequence,
        Number(data.next_after_sequence || 0)
      );

      if (!data.has_more || data.messages.length === 0) {
        break;
      }
    }
  }

  async function runTask(task: ConversationMessageSyncTask) {
    if (task.sync_mode === "tail") {
      await runTailTask(task);
    } else {
      await runDeltaTask(task);
    }
  }

  // Simple bounded-concurrency runner. We don't pull in p-limit to keep
  // app-core dependency-free for embedders.
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(MESSAGE_SYNC_CONCURRENCY, tasks.length);
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(
      (async () => {
        while (cursor < tasks.length) {
          const index = cursor;
          cursor += 1;
          await runTask(tasks[index]);
        }
      })()
    );
  }
  await Promise.all(workers);
  await writeChain;

  return syncedMessages;
}

async function applyMessageStates(
  api: MushroomApi,
  repository: MobileDataRepository,
  checkpoints: SyncCheckpointStore
) {
  const checkpointState = await checkpoints.read();
  let nextCursor = serializeSyncCursor(checkpointState.messageStates) ?? null;
  let total = 0;

  while (true) {
    const { data } = await api.syncMessageStates({
      syncCursor: nextCursor ?? undefined,
      lastSyncTime: serializeSyncCursor(checkpointState.messageStates),
      pageSize: MESSAGE_STATE_PAGE_SIZE
    });
    await repository.applyMessageStates(data.states as MessageStateRecord[]);
    total += data.states.length;
    nextCursor = data.nextSyncCursor ?? nextCursor;
    if (!data.hasMore || data.states.length === 0) {
      break;
    }
  }

  await checkpoints.write({
    messageStates: nextCursor ?? checkpointState.messageStates
  });

  return total;
}

async function reconcileReactionsForConversations(
  api: MushroomApi,
  repository: MobileDataRepository,
  clientConversationIds: string[]
) {
  const allMessageIds: string[] = [];
  for (const clientConversationId of clientConversationIds) {
    const messages = await repository.listMessages(clientConversationId);
    for (const message of messages) {
      const id = String(message.server_message_id || "");
      if (id) {
        allMessageIds.push(id);
      }
    }
  }
  const uniqueIds = Array.from(new Set(allMessageIds));
  if (uniqueIds.length === 0) {
    return;
  }
  for (
    let index = 0;
    index < uniqueIds.length;
    index += REACTION_RECONCILE_BATCH_SIZE
  ) {
    const batch = uniqueIds.slice(index, index + REACTION_RECONCILE_BATCH_SIZE);
    const { data } = await api.listMessageReactions({
      messageIds: batch.join(",")
    });
    const records: LocalMessageReactionRecord[] = data.reactions.map(r => ({
      message_id: String(r.message_id),
      conversation_id: String(r.conversation_id),
      user_id: Number(r.user_id),
      emoji: r.emoji,
      updated_at: r.updated_at,
      sequence: typeof r.sequence === "number" ? r.sequence : undefined
    }));
    await repository.replaceReactionsForMessages(batch, records);
  }
}

interface ReactionDeltaSyncTarget {
  serverConversationId: string;
  clientConversationId: string;
  /** Server-advertised max sequence; lets us skip the round-trip when caught up. */
  serverMaxSequence: number;
  /** Was this conversation freshly added during this sync? */
  isFreshlyAdded: boolean;
}

/**
 * Pull reaction delta events for a single conversation, paging through
 * `api.listReactionDeltas` until either `has_more=false` or we hit the
 * `serverMaxSequence` returned by the conversation snapshot. Updates the
 * per-conversation cursor only after successful application of each page so
 * a mid-page failure can be safely retried later.
 *
 * Returns the number of delta events applied.
 */
async function fetchReactionDeltasForConversation(
  api: MushroomApi,
  repository: MobileDataRepository,
  target: ReactionDeltaSyncTarget,
  options: {
    initialAfterSequence: number;
    pageLimit: number;
  }
): Promise<number> {
  let after = options.initialAfterSequence;
  const stopAt = Math.max(0, Math.floor(target.serverMaxSequence || 0));
  if (stopAt > 0 && after >= stopAt) {
    return 0;
  }

  let appliedCount = 0;
  // Hard cap on iterations as a safety net (stopAt should always terminate us).
  for (let iteration = 0; iteration < 1000; iteration += 1) {
    // Bubble up errors to the caller's outer try/catch so it can decide
    // whether to fall back to the snapshot reconcile path. Keeping the
    // partial cursor already persisted by previous successful pages is the
    // correct resumable behaviour.
    const { data: response } = await api.listReactionDeltas({
      conversationId: target.serverConversationId,
      afterSequence: after,
      limit: options.pageLimit
    });

    if (response.reactions.length > 0) {
      const deltas: LocalReactionDeltaRecord[] = response.reactions.map(r => ({
        message_id: String(r.message_id),
        conversation_id: String(r.conversation_id),
        client_conversation_id: target.clientConversationId,
        user_id: Number(r.user_id),
        emoji: r.emoji,
        sequence: Number(r.sequence ?? 0),
        is_deleted: r.is_deleted === 1 ? 1 : 0,
        updated_at: r.updated_at
      }));
      await repository.applyReactionDeltas(deltas);
      appliedCount += deltas.length;
    }

    const nextAfter = Number(response.next_after_sequence ?? after);
    if (nextAfter > after) {
      await repository.setReactionCursor(
        target.clientConversationId,
        nextAfter
      );
      after = nextAfter;
    } else if (response.reactions.length === 0 && stopAt > after) {
      // Server reports nothing newer despite snapshot claiming more — advance
      // cursor to the snapshot value to prevent re-fetching the same window.
      await repository.setReactionCursor(target.clientConversationId, stopAt);
      after = stopAt;
    }

    if (!response.has_more) {
      break;
    }
    if (response.reactions.length === 0) {
      // Defensive: server says has_more but returned nothing — bail out.
      break;
    }
    if (stopAt > 0 && after >= stopAt) {
      break;
    }
  }

  return appliedCount;
}

interface ReactionSyncResult {
  applied: number;
  fellBackToReconcile: boolean;
  failed: boolean;
}

/**
 * Drive reaction delta sync across the union of newly added + updated
 * conversations. Failures degrade gracefully: a 404 from the delta endpoint
 * (older server without the new route) triggers a one-shot reconcile, and
 * any other error is swallowed so the rest of `runMobileSync` is unaffected.
 */
async function syncReactionDeltas(
  api: MushroomApi,
  repository: MobileDataRepository,
  remoteConversations: RemoteConversation[],
  freshlyAddedServerIds: ReadonlySet<string>
): Promise<ReactionSyncResult> {
  const result: ReactionSyncResult = {
    applied: 0,
    fellBackToReconcile: false,
    failed: false
  };
  const localConversations = await repository.listConversations();
  const localByServerId = new Map(
    localConversations.map(item => [item.server_conversation_id, item])
  );

  const targets: ReactionDeltaSyncTarget[] = [];
  for (const remote of remoteConversations) {
    const local = localByServerId.get(remote.id);
    if (!local) {
      continue;
    }
    if (Number(local.is_locally_deleted ?? 0) > 0) {
      continue;
    }
    const serverMaxSequence = Number(remote.last_reaction_sequence ?? 0);
    targets.push({
      serverConversationId: remote.id,
      clientConversationId: local.client_conversation_id,
      serverMaxSequence,
      isFreshlyAdded: freshlyAddedServerIds.has(remote.id)
    });
  }

  for (const target of targets) {
    const cursor = await repository.getReactionCursor(
      target.clientConversationId
    );
    // TODO(reactions): time-windowed first sync needs server sequence-at endpoint.
    // For freshly-added conversations we currently fall back to a full pull
    // (cursor=0). The delta cursor is sequence-based, not time-based, so
    // capping the first sync to e.g. "last 30 days" requires the server to
    // expose a sequence-at-timestamp lookup. Until then, rely on page limits
    // and the independent try/catch to keep the first sync non-blocking.
    const initialAfter = cursor;
    if (
      target.serverMaxSequence > 0 &&
      initialAfter >= target.serverMaxSequence
    ) {
      continue;
    }
    try {
      const applied = await fetchReactionDeltasForConversation(
        api,
        repository,
        target,
        {
          initialAfterSequence: initialAfter,
          pageLimit: REACTION_DELTA_PAGE_LIMIT
        }
      );
      result.applied += applied;
    } catch (error) {
      const status =
        (
          error as {
            status?: number;
            statusCode?: number;
            response?: { status?: number };
          }
        )?.status ??
        (error as { statusCode?: number })?.statusCode ??
        (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        // Old server without the delta route — one-shot snapshot reconcile.
        try {
          await reconcileReactionsForConversations(api, repository, [
            target.clientConversationId
          ]);
          result.fellBackToReconcile = true;
        } catch {
          result.failed = true;
        }
        continue;
      }
      result.failed = true;
      // Swallow and move on — reactions must never block the main sync.
    }
  }

  return result;
}

export type MobileSyncStage =
  | "contacts"
  | "conversations"
  | "messages"
  | "states";

export async function runMobileSync(options: {
  api: MushroomApi;
  repository: MobileDataRepository;
  checkpoints: SyncCheckpointStore;
  force?: boolean;
  /**
   * Invoked after each major sync stage has finished writing to the local
   * repository. The controller uses this to publish intermediate snapshots
   * so the UI can render conversations as soon as they land — instead of
   * waiting for the entire (potentially minute-long) sync to finish.
   *
   * Errors thrown from the callback are swallowed so a flaky UI listener
   * cannot abort the sync pipeline.
   */
  onStageComplete?: (stage: MobileSyncStage) => Promise<void> | void;
}) {
  const { api, repository, checkpoints, onStageComplete } = options;

  const notifyStage = async (stage: MobileSyncStage) => {
    if (!onStageComplete) return;
    try {
      await onStageComplete(stage);
    } catch {
      // Listener failures must not abort sync.
    }
  };

  const checkpointState = await checkpoints.read();

  const shouldSyncContacts =
    options.force ||
    !checkpointState.contacts ||
    Date.now() - new Date(checkpointState.contacts).getTime() >=
      CONTACTS_SYNC_MIN_INTERVAL_MS;

  let contactsSynced = 0;

  if (shouldSyncContacts) {
    const [contactsResult, blocksResult] = await Promise.all([
      api.getContacts(),
      api.getBlocks()
    ]);
    const remoteContacts = contactsResult.data.contacts.map(
      mapContactToContactListItem
    );
    const remoteBlockedUsers = blocksResult.data.blocks.map(
      mapBlockedUserToContactListItem
    );
    const remoteContactsSnapshot = [...remoteContacts, ...remoteBlockedUsers];
    const localContacts = await repository.listContacts();
    const contactDiff = diffContacts(remoteContactsSnapshot, localContacts);
    if (contactDiff.added.length > 0 || contactDiff.updated.length > 0) {
      await repository.upsertContacts([
        ...contactDiff.added,
        ...contactDiff.updated
      ]);
    }
    if (contactDiff.removed.length > 0) {
      await repository.removeContacts(
        contactDiff.removed.map(item => item.user_id)
      );
    }
    contactsSynced =
      contactDiff.added.length +
      contactDiff.updated.length +
      contactDiff.removed.length;
    await checkpoints.write({
      contacts: new Date().toISOString()
    });
  }

  await notifyStage("contacts");

  const remoteConversations: RemoteConversation[] = [];
  let nextConversationCursor =
    serializeSyncCursor(checkpointState.conversations) ?? null;

  while (true) {
    const { data } = await api.syncConversations({
      syncCursor: nextConversationCursor ?? undefined,
      lastSyncTime: serializeSyncCursor(checkpointState.conversations),
      pageSize: CONVERSATION_PAGE_SIZE
    });
    remoteConversations.push(...data.conversations);
    if (!data.nextSyncCursor || data.conversations.length === 0) {
      nextConversationCursor = data.nextSyncCursor ?? nextConversationCursor;
      break;
    }
    nextConversationCursor = String(data.nextSyncCursor);
  }

  const localConversations = await repository.listConversations();
  const conversationDiff = diffConversations(
    remoteConversations,
    localConversations,
    Boolean(checkpointState.conversations)
  );
  await repository.upsertConversations([
    ...conversationDiff.added,
    ...conversationDiff.updated
  ]);
  if (conversationDiff.removed.length > 0) {
    await repository.removeConversations(
      conversationDiff.removed.map(item => item.client_conversation_id)
    );
  }
  await checkpoints.write({
    conversations: nextConversationCursor ?? checkpointState.conversations
  });

  await notifyStage("conversations");

  const syncedMessages = await fetchRemoteMessages(
    api,
    repository,
    conversationDiff.messageBackfill
  );
  await notifyStage("messages");
  const syncedMessageStates = await applyMessageStates(
    api,
    repository,
    checkpoints
  );
  await notifyStage("states");

  // 触发跨会话二次 backfill：经过 diffConversations -> fetchRemoteMessages
  // 后，仍有部分会话因 WS 推送中段缺失消息 / 服务端在 snapshot 之外推进了
  // sequence，被 recomputeConversationSyncProgress 标记为 needs_backfill=1。
  // 桌面端通过 sync_backfill_jobs + WSClient 事件触发；移动端原本只有
  // foreground / network-recovery 才会重跑全量 syncNow，导致同一周期内的
  // 缺口要等到下一次触发器才补齐。这里在主同步管线尾部按 conversation
  // 串行做一次按需补齐：每个会话各自 try/catch，单会话失败不影响其它会
  // 话，也不污染主同步指标（与 reactions 的隔离同语义）。
  //
  // 注意：tail-only 场景下（tailLoadedTo>0 && lastSync==0）我们故意从
  // last_sequence=0 起拉 delta 而非从 tailLoadedTo 起，目的是顺手把 [1..tail)
  // 的 head gap 也补上，让下一轮 recomputeConversationSyncProgress 能把
  // contiguous 推进到 tailLoadedTo，否则 needs_backfill 会一直为 1。
  const refreshedConversations = await repository.listConversations();
  const backfillTasks: ConversationMessageSyncTask[] = [];
  for (const conversation of refreshedConversations) {
    if (Number(conversation.is_locally_deleted ?? 0) > 0) continue;
    if (Number(conversation.needs_backfill ?? 0) !== 1) continue;
    const serverSequence = Number(conversation.last_server_sequence || 0);
    const lastSync = Number(conversation.last_sync_sequence || 0);
    const tailLoadedTo = Number(conversation.tail_loaded_to_seq || 0);
    if (
      serverSequence <= 0 ||
      serverSequence <= Math.max(lastSync, tailLoadedTo)
    ) {
      // 标志位是因 history 起点未确认而非 forward gap 引起的；
      // 留给 openConversation / scroll-top 路径补齐更老历史。
      continue;
    }
    backfillTasks.push({
      conversation_id: conversation.server_conversation_id,
      client_conversation_id: conversation.client_conversation_id,
      last_sequence: lastSync,
      server_sequence: serverSequence,
      sync_mode: tailLoadedTo <= 0 && lastSync <= 0 ? "tail" : "delta"
    });
  }
  // 关键：必须 per-task 调用 fetchRemoteMessages，因其内部用 Promise.all
  // 调度 workers，单任务 reject 会 abort 整批（剩余未启动的会话不会被
  // 重试）。这里逐个会话独立 try/catch 才能达到注释承诺的"单会话失败
  // 不阻塞其它会话"语义。代价是丢失并发度，但 backfill 任务集本身就是
  // 主 pass 之后的少量补漏（needs_backfill=1 子集），可接受。
  for (const task of backfillTasks) {
    try {
      await fetchRemoteMessages(api, repository, [task]);
    } catch {
      // 单会话失败不阻塞其它会话；下一轮 syncNow 自然重试。
    }
  }

  // Reaction sync is intentionally isolated: any failure here must not
  // contaminate the main sync metrics or surface as a hard error to the UI.
  // The delta channel resumes from the persisted per-conversation cursor on
  // the next run, and a 404 from old servers triggers a snapshot reconcile.
  try {
    const freshlyAddedServerIds = new Set(
      conversationDiff.added
        .map(item => item.server_conversation_id)
        .filter((value): value is string => Boolean(value))
    );
    const reactionResult = await syncReactionDeltas(
      api,
      repository,
      remoteConversations,
      freshlyAddedServerIds
    );
    void reactionResult;
  } catch {
    // Hard guard: never let reaction sync exceptions escape.
  }

  const metrics: SyncMetrics = {
    syncedContacts: contactsSynced,
    syncedConversations:
      conversationDiff.added.length +
      conversationDiff.updated.length +
      conversationDiff.removed.length,
    syncedMessages,
    syncedMessageStates,
    completedAt: new Date().toISOString(),
    // Controller flips `syncing` true at syncNow() entry and back to false
    // after this function returns; runMobileSync itself does not own the
    // flag's lifecycle, so we just emit `false` here as a safe default for
    // direct callers that bypass the controller (tests / future hosts).
    syncing: false
  };

  return metrics;
}
