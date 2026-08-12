import { listMessageReactions, listReactionDeltas } from "../http/api";
import { getAccessToken } from "../utils/token";
import log from "@/utils/log";

const REACTION_RECONCILE_BATCH_SIZE = 100;
const REACTION_DELTA_PAGE_LIMIT = 500;
const REACTION_DELTA_MAX_PAGES = 1000;

export type ReactionDeltaSyncTarget = {
  serverConversationId: string;
  clientConversationId: string;
  serverMaxSequence: number;
};

export const reconcileMessageReactions = async (
  clientConversationIds: string[]
) => {
  const token = await getAccessToken();
  if (!token || clientConversationIds.length === 0) {
    return;
  }
  const allIds: string[] = [];
  for (const clientConversationId of clientConversationIds) {
    const ids =
      await window.electronAPI.listServerMessageIds(clientConversationId);
    for (const id of ids) {
      if (id) allIds.push(id);
    }
  }
  const uniqueIds = Array.from(new Set(allIds));
  if (uniqueIds.length === 0) {
    return;
  }
  for (
    let index = 0;
    index < uniqueIds.length;
    index += REACTION_RECONCILE_BATCH_SIZE
  ) {
    const batch = uniqueIds.slice(index, index + REACTION_RECONCILE_BATCH_SIZE);
    const { data } = await listMessageReactions({
      messageIds: batch.join(",")
    });
    await window.electronAPI.replaceMessageReactions({
      serverMessageIds: batch,
      reactions: data.reactions.map(reaction => ({
        serverMessageId: String(reaction.message_id),
        userId: Number(reaction.user_id),
        emoji: String(reaction.emoji),
        updatedAt: String(reaction.updated_at)
      }))
    });
  }
};

/**
 * Pull reaction delta events for a list of conversations using the new
 * per-conversation sequence cursor. Each conversation is processed
 * independently and failures are isolated so reaction sync can never block
 * message sync. A 404 (older server without the delta route) falls back to
 * the legacy snapshot reconcile for that one conversation.
 */
export const syncReactionDeltasForConversations = async (
  targets: ReactionDeltaSyncTarget[]
) => {
  const token = await getAccessToken();
  if (!token || targets.length === 0) {
    return;
  }

  for (const target of targets) {
    let after = await window.electronAPI.getReactionCursor(
      target.clientConversationId
    );
    const stopAt = Math.max(0, Math.floor(target.serverMaxSequence || 0));
    if (stopAt > 0 && after >= stopAt) {
      continue;
    }

    try {
      for (
        let iteration = 0;
        iteration < REACTION_DELTA_MAX_PAGES;
        iteration += 1
      ) {
        const { data } = await listReactionDeltas({
          conversationId: target.serverConversationId,
          afterSequence: after,
          limit: REACTION_DELTA_PAGE_LIMIT
        });

        if (data.reactions.length > 0) {
          const result = await window.electronAPI.applyMessageReactionDeltas({
            clientConversationId: target.clientConversationId,
            deltas: data.reactions.map(r => ({
              serverMessageId: String(r.message_id),
              userId: Number(r.user_id),
              emoji: r.emoji ?? null,
              sequence: Number(r.sequence ?? 0),
              isDeleted: r.is_deleted === 1 ? 1 : 0,
              updatedAt: String(r.updated_at)
            }))
          });
          log.debug(
            "Applied reaction deltas",
            JSON.stringify({
              clientConversationId: target.clientConversationId,
              applied: result.applied,
              maxSequence: result.maxSequence
            })
          );
        }

        const nextAfter = Number(data.next_after_sequence ?? after);
        if (nextAfter > after) {
          await window.electronAPI.setReactionCursor(
            target.clientConversationId,
            nextAfter
          );
          after = nextAfter;
        } else if (data.reactions.length === 0 && stopAt > after) {
          await window.electronAPI.setReactionCursor(
            target.clientConversationId,
            stopAt
          );
          after = stopAt;
        }

        if (!data.has_more) {
          break;
        }
        if (data.reactions.length === 0) {
          break;
        }
        if (stopAt > 0 && after >= stopAt) {
          break;
        }
      }
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
        // Older server without delta route — fall back to one-shot reconcile.
        try {
          await reconcileMessageReactions([target.clientConversationId]);
        } catch (reconcileError) {
          log.warn(
            "Reaction reconcile fallback failed",
            target.clientConversationId,
            reconcileError
          );
        }
        continue;
      }
      // Swallow: reactions must never block the rest of sync.
      log.warn(
        "Reaction delta sync failed",
        target.clientConversationId,
        error
      );
    }
  }
};
