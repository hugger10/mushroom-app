import {
  fetchRemoteConversations,
  fetchRemoteContacts,
  fetchRemoteMessages,
  fetchRemoteMessageStates,
  syncReactionDeltasForConversations,
  type ConversationMessageSyncTask
} from "./syncContext";
import type { Conversation } from "../types/chat";
import log from "@/utils/log";
import { getAccessToken } from "../utils/token";

const DEFAULT_MESSAGE_STATE_PAGE_SIZE = 200;

export type SyncOrchestratorOptions = {
  recentTailConversationLimit?: number;
};

export type SyncOrchestratorResult = {
  updatedConversations: ConversationMessageSyncTask[];
  conversationsCursor: string | null;
  messageStatesCursor: string | null;
  isFreshConversationCache: boolean;
};

function pickRecentWindowTasks(
  tasks: ConversationMessageSyncTask[],
  conversations: Conversation[],
  limit: number
) {
  const prioritizedConversationIds = new Set(
    conversations.slice(0, limit).map(item => item.client_conversation_id)
  );

  return tasks.filter(task =>
    prioritizedConversationIds.has(task.client_conversation_id)
  );
}

export async function runSyncOrchestrator(
  options: SyncOrchestratorOptions = {}
): Promise<SyncOrchestratorResult> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return {
      updatedConversations: [],
      conversationsCursor: null,
      messageStatesCursor: null,
      isFreshConversationCache: false
    };
  }

  const startedAt = performance.now();
  const recentTailConversationLimit =
    options.recentTailConversationLimit ?? Number.POSITIVE_INFINITY;

  const localConversationsBeforeSync =
    await window.electronAPI.getConversations(true);
  const lastContactsSync =
    (await window.electronAPI.getLastSyncTime("contacts")) ?? undefined;
  const nextContactsSync = await fetchRemoteContacts(lastContactsSync, {
    force: !lastContactsSync
  });
  await window.electronAPI.updateLastSyncTime("contacts", nextContactsSync);

  const lastConversationsSync =
    (await window.electronAPI.getLastSyncTime("conversations")) ?? undefined;
  const conversationSyncResult = await fetchRemoteConversations(
    lastConversationsSync
  );
  await window.electronAPI.updateLastSyncTime(
    "conversations",
    conversationSyncResult.syncCursor
  );

  const isFreshConversationCache =
    !lastConversationsSync && localConversationsBeforeSync.length === 0;
  let updatedConversations = conversationSyncResult.updatedConversations;
  if (
    isFreshConversationCache &&
    Number.isFinite(recentTailConversationLimit) &&
    recentTailConversationLimit > 0 &&
    updatedConversations.length > 0
  ) {
    const localConversationsAfterSync =
      await window.electronAPI.getConversations(true);
    updatedConversations = pickRecentWindowTasks(
      updatedConversations,
      localConversationsAfterSync,
      recentTailConversationLimit
    );
  }

  await fetchRemoteMessages(updatedConversations);

  const lastMessageStateSync =
    (await window.electronAPI.getLastSyncTime("message_states")) ?? undefined;
  const nextMessageStateSync = await fetchRemoteMessageStates(
    lastMessageStateSync,
    DEFAULT_MESSAGE_STATE_PAGE_SIZE
  );
  await window.electronAPI.updateLastSyncTime(
    "message_states",
    nextMessageStateSync
  );

  const conversationsForReactionReconcile =
    await window.electronAPI.getConversations(true);
  const reactionTargetsByClientId = new Map(
    conversationSyncResult.reactionTargets.map(target => [
      target.clientConversationId,
      target
    ])
  );
  const reactionTargets = conversationsForReactionReconcile
    .filter(item => Number(item.is_locally_deleted ?? 0) === 0)
    .map(item => {
      const target = reactionTargetsByClientId.get(item.client_conversation_id);
      return {
        serverConversationId: item.server_conversation_id,
        clientConversationId: item.client_conversation_id,
        serverMaxSequence: target?.serverMaxSequence ?? 0
      };
    });
  try {
    await syncReactionDeltasForConversations(reactionTargets);
  } catch (error) {
    log.warn("Reaction delta sync failed (top-level)", error);
  }

  log.info(
    `Sync orchestrator finished durationMs=${Math.round(performance.now() - startedAt)} isFreshConversationCache=${isFreshConversationCache} syncedConversationCount=${updatedConversations.length} conversationsCursor=${conversationSyncResult.syncCursor ?? "null"} messageStatesCursor=${nextMessageStateSync ?? "null"}`
  );

  return {
    updatedConversations,
    conversationsCursor: conversationSyncResult.syncCursor,
    messageStatesCursor: nextMessageStateSync,
    isFreshConversationCache
  };
}
