import { listMessages, syncMessageDelta, syncMessageStates } from "../http/api";
import { mapMessages } from "../utils/mapper";
import { getAccessToken } from "../utils/token";
import log from "@/utils/log";
import { serializeSyncCursor } from "./cursors";
import type { ConversationMessageSyncTask } from "./types";

const MESSAGE_SYNC_BATCH_SIZE = 20;
const MESSAGE_DELTA_PAGE_SIZE = 200;
const MESSAGE_TAIL_PAGE_SIZE = 50;

export const fetchRemoteMessages = async (
  convs: ConversationMessageSyncTask[]
) => {
  if (convs.length === 0) {
    return;
  }

  const token = await getAccessToken();
  if (!token) {
    return;
  }

  for (let index = 0; index < convs.length; index += MESSAGE_SYNC_BATCH_SIZE) {
    const batch = convs.slice(index, index + MESSAGE_SYNC_BATCH_SIZE);
    for (const conv of batch) {
      if (conv.sync_mode === "tail") {
        await fetchConversationTailMessages(
          conv.conversation_id,
          conv.client_conversation_id
        );
        continue;
      }

      let afterSequence = Number(conv.last_sequence ?? 0);
      const serverSequence = Number(conv.server_sequence ?? afterSequence);

      while (afterSequence < serverSequence) {
        const { data } = await syncMessageDelta({
          conversationId: conv.conversation_id,
          clientConversationId: conv.client_conversation_id,
          afterSequence,
          limit: MESSAGE_DELTA_PAGE_SIZE
        });
        const localMsg = mapMessages(data.messages);
        log.debug("Fetched remote message delta:", localMsg);
        if (data.messages.length > 0) {
          await window.electronAPI.createMessages(localMsg);
        }
        await window.electronAPI.updateConversationLastSyncSequence({
          [conv.client_conversation_id]: {
            serverSequence: Number(data.max_sequence || serverSequence)
          }
        });
        afterSequence = Math.max(
          afterSequence,
          Number(data.next_after_sequence || 0)
        );
        if (!data.has_more || data.messages.length === 0) {
          break;
        }
      }
    }
  }
};

export const fetchConversationTailMessages = async (
  conversationId: string,
  clientConversationId: string,
  options?: {
    beforeSequence?: number;
    limit?: number;
  }
) => {
  const { data } = await listMessages({
    conversationId,
    clientConversationId,
    beforeSequence: options?.beforeSequence,
    limit: options?.limit ?? MESSAGE_TAIL_PAGE_SIZE
  });
  const localMsg = mapMessages(data.messages);
  if (data.messages.length > 0) {
    await window.electronAPI.createMessages(localMsg);
  }
  await window.electronAPI.updateConversationLastSyncSequence({
    [clientConversationId]: {
      serverSequence: Number(data.max_sequence || data.loaded_to_sequence || 0)
    }
  });
  // PR-1 server signal: if the server confirms we've reached the
  // visible-from boundary, mark history complete authoritatively so
  // we stop re-queueing history backfill jobs.
  if (data.reached_history_start === true) {
    const oldestVisibleSequence = Math.max(
      Number(data.loaded_from_sequence || 0),
      Number(data.visible_from_sequence || 0)
    );
    try {
      await window.electronAPI.markHistoryComplete({
        clientConversationId,
        oldestVisibleSequence
      });
    } catch (error) {
      log.warn("markHistoryComplete from tail response failed", error);
    }
  }
  return data;
};

export const fetchRemoteMessageStates = async (
  syncCursor?: Date | string,
  pageSize = 200
) => {
  const token = await getAccessToken();
  if (!token) {
    return serializeSyncCursor(syncCursor) ?? null;
  }

  let nextSyncCursor = serializeSyncCursor(syncCursor) ?? null;

  while (true) {
    const { data } = await syncMessageStates({
      syncCursor: nextSyncCursor ?? undefined,
      lastSyncTime: serializeSyncCursor(syncCursor),
      pageSize
    });
    await window.electronAPI.applyMessageStates(data.states);
    nextSyncCursor = data.nextSyncCursor ?? nextSyncCursor;
    if (!data.hasMore || data.states.length === 0) {
      break;
    }
  }

  return nextSyncCursor ?? serializeSyncCursor(syncCursor) ?? null;
};
