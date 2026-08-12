import { syncConversations } from "../http/api";
import type {
  Conversation,
  ConversationMember,
  RemoteConversation
} from "@mushroom/shared";
import { mapConversations } from "../utils/mapper";
import { getAccessToken } from "../utils/token";
import { v4 as uuidv4 } from "uuid";
import { serializeSyncCursor } from "./cursors";
import type { ConversationMessageSyncTask } from "./types";
import type { ReactionDeltaSyncTarget } from "./reactions";

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

export const fetchRemoteConversations = async (syncCursor?: Date | string) => {
  const token = await getAccessToken();
  if (!token) {
    return {
      syncCursor: serializeSyncCursor(syncCursor) ?? null,
      updatedConversations: [],
      reactionTargets: [] as ReactionDeltaSyncTarget[]
    };
  }

  const pageSize = 500;
  const remoteConversations: RemoteConversation[] = [];
  let nextSyncCursor = serializeSyncCursor(syncCursor);

  while (true) {
    const { data } = await syncConversations({
      syncCursor: nextSyncCursor,
      lastSyncTime: serializeSyncCursor(syncCursor),
      pageSize
    });

    remoteConversations.push(...data.conversations);
    if (!data.nextSyncCursor || data.conversations.length === 0) {
      break;
    }
    nextSyncCursor = String(data.nextSyncCursor);
  }

  const local = await window.electronAPI.getConversations(true, true);
  const { added, removed, updated, messageBackfill } = diffConversations(
    remoteConversations,
    local,
    Boolean(syncCursor)
  );
  if (added.length > 0) {
    await window.electronAPI.createConversations(added);
  }
  if (updated.length > 0) {
    await window.electronAPI.updateConversations(updated);
  }
  if (removed.length > 0) {
    await window.electronAPI.deleteConversations(
      removed.map(item => item.client_conversation_id)
    );
  }
  return {
    syncCursor: nextSyncCursor ?? serializeSyncCursor(syncCursor) ?? null,
    updatedConversations: messageBackfill,
    reactionTargets: buildReactionTargets(remoteConversations, [
      ...local,
      ...added
    ])
  };
};

function buildReactionTargets(
  remoteConversations: RemoteConversation[],
  localConversations: Conversation[]
): ReactionDeltaSyncTarget[] {
  const remoteMaxByServerId = new Map<string, number>();
  for (const remote of remoteConversations) {
    remoteMaxByServerId.set(
      remote.id,
      Math.max(0, Number(remote.last_reaction_sequence ?? 0))
    );
  }
  const targets: ReactionDeltaSyncTarget[] = [];
  for (const local of localConversations) {
    if (Number(local.is_locally_deleted ?? 0) > 0) {
      continue;
    }
    const serverMaxSequence =
      remoteMaxByServerId.get(local.server_conversation_id) ?? 0;
    targets.push({
      serverConversationId: local.server_conversation_id,
      clientConversationId: local.client_conversation_id,
      serverMaxSequence
    });
  }
  return targets;
}

function diffConversations(
  remote: RemoteConversation[],
  local: Conversation[],
  isIncremental = false
) {
  const localIds = new Set(local.map(f => f.server_conversation_id));
  const localConv = new Map(local.map(e => [e.server_conversation_id, e]));
  const remoteIds = new Set(remote.map(f => f.id));

  const added: Conversation[] = [];
  const removed: Conversation[] = [];
  const updated: Conversation[] = [];
  const messageBackfill: ConversationMessageSyncTask[] = [];

  for (const r of remote) {
    let clientData = mapConversations(r);
    const remoteLastSyncSequence = Number(r.last_sync_sequence ?? 0);
    if (!localIds.has(r.id)) {
      const client_conversation_id = uuidv4();
      const clientMembers: ConversationMember[] = (r.members ?? []).map(m => ({
        conversation_id: client_conversation_id,
        user_id: m.user_id,
        nickname: m.nickname,
        avatar_url: m.avatar_url,
        role: m.role,
        muted_until: m.muted_until,
        muted_by: m.muted_by,
        joined_at: m.joined_at
      }));
      clientData.members = clientMembers;
      clientData.client_conversation_id = client_conversation_id;
      clientData.last_server_sequence = remoteLastSyncSequence;
      clientData.sync_gap_detected = remoteLastSyncSequence > 0 ? 1 : 0;
      clientData.tail_loaded_from_seq = 0;
      clientData.tail_loaded_to_seq = 0;
      clientData.history_complete = remoteLastSyncSequence > 0 ? 0 : 1;
      clientData.needs_backfill = remoteLastSyncSequence > 0 ? 1 : 0;
      added.push(clientData);
      if (remoteLastSyncSequence > 0) {
        messageBackfill.push({
          conversation_id: r.id,
          client_conversation_id,
          last_sequence: 0,
          server_sequence: remoteLastSyncSequence,
          sync_mode: "tail"
        });
      }
    } else {
      const localConversation = localConv.get(r.id) as Conversation;
      const clientId = localConversation.client_conversation_id as string;
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
      const remoteLastReadSequence = Number(clientData.last_read_sequence ?? 0);
      const localLastReadSequence = Number(
        localConversation.last_read_sequence ?? 0
      );
      const syncAnchor = Math.max(
        localLastSyncSequence,
        localTailLoadedToSequence,
        localHiddenBeforeSequence
      );
      const shouldRestoreLocallyDeletedConversation =
        remoteLastSyncSequence > localHiddenBeforeSequence;
      const shouldPreserveLocalReadState =
        localLastReadSequence > remoteLastReadSequence;
      const clientMembers: ConversationMember[] = (r.members ?? []).map(m => ({
        conversation_id: clientId,
        user_id: m.user_id,
        nickname: m.nickname,
        avatar_url: m.avatar_url,
        role: m.role,
        muted_until: m.muted_until,
        muted_by: m.muted_by,
        joined_at: m.joined_at
      }));
      clientData.members = clientMembers;
      clientData.client_conversation_id = clientId;
      clientData.last_sync_sequence = Math.max(
        localLastSyncSequence,
        localHiddenBeforeSequence
      );
      clientData.last_server_sequence = Math.max(
        localLastServerSequence,
        remoteLastSyncSequence
      );
      clientData.tail_loaded_from_seq = localTailLoadedFromSequence;
      clientData.tail_loaded_to_seq = Math.max(
        localTailLoadedToSequence,
        Number(clientData.tail_loaded_to_seq ?? 0)
      );
      clientData.history_complete = localHistoryComplete;
      clientData.local_hidden_before_seq = localHiddenBeforeSequence;
      clientData.is_locally_deleted =
        isLocallyDeleted && !shouldRestoreLocallyDeletedConversation ? 1 : 0;
      const effectiveSyncAnchor = getConversationSyncAnchor(clientData);
      clientData.needs_backfill =
        clientData.is_locally_deleted === 1
          ? 0
          : Number(clientData.last_server_sequence || 0) >
                effectiveSyncAnchor ||
              Number(clientData.history_complete || 0) === 0
            ? 1
            : 0;
      clientData.sync_gap_detected =
        clientData.is_locally_deleted === 1
          ? 0
          : Number(clientData.needs_backfill || 0) > 0 ||
              Number(clientData.last_server_sequence || 0) >
                Math.max(localLastSyncSequence, localHiddenBeforeSequence)
            ? 1
            : 0;
      clientData.last_read_sequence = Math.max(
        Number(localConversation.last_read_sequence ?? 0),
        localHiddenBeforeSequence
      );
      if (shouldPreserveLocalReadState) {
        clientData.unread_count = localConversation.unread_count ?? 0;
      }
      // mention_unread_count 是纯客户端字段，服务端不返回。同步映射后恒为 0，
      // 因此这里必须基于权威 unread_count 重新对齐：仍未读则保留本地 @ 计数，
      // 已读（unread_count==0）才清零。否则刷新/重载后 "有人@你" 会丢失。
      clientData.mention_unread_count =
        Number(clientData.unread_count || 0) <= 0
          ? 0
          : Number(localConversation.mention_unread_count ?? 0);
      clientData = applyConversationPreviewVisibility(
        clientData,
        localHiddenBeforeSequence
      );
      if (clientData.is_locally_deleted === 1) {
        clientData.last_message_content = {};
        clientData.last_message_time = "";
        clientData.last_message_send_id = 0;
        clientData.unread_count = 0;
        clientData.mention_unread_count = 0;
      }
      updated.push(clientData);
      if (remoteLastSyncSequence > syncAnchor) {
        messageBackfill.push({
          conversation_id: r.id,
          client_conversation_id: clientId,
          last_sequence: syncAnchor,
          server_sequence: remoteLastSyncSequence,
          sync_mode:
            localTailLoadedToSequence <= 0 && localLastSyncSequence <= 0
              ? "tail"
              : "delta"
        });
      }
    }
  }

  if (!isIncremental) {
    for (const l of local) {
      if (!remoteIds.has(l.server_conversation_id)) {
        removed.push(l);
      }
    }
  }

  return { added, removed, updated, messageBackfill };
}
