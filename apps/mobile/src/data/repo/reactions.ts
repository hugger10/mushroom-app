import type { MobileDataRepository } from "@mushroom/app-core";
import {
  loadReactionsForMessageIds,
  queryRows,
  type SQLiteRow
} from "./queries";
import type { RepoDeps } from "./types";

/**
 * Reactions 子模块：仅触达 `mobile_message_reactions` / `mobile_reaction_cursors`。
 *
 * 写串行化语义：原文件中 reactions 全部写路径**均未**走 `runExclusive`
 * （走的是 reactions 表自身的 UPSERT 冲突约束），此处严格保留，不引入额外锁。
 */
export function createReactionRepo(
  deps: RepoDeps
): Pick<
  MobileDataRepository,
  | "applyMessageReactions"
  | "removeMessageReaction"
  | "loadReactionsByMessageIds"
  | "replaceReactionsForMessages"
  | "applyReactionDeltas"
  | "getReactionCursor"
  | "setReactionCursor"
> {
  const { db, ensureInitialized } = deps;

  return {
    async applyMessageReactions(reactions) {
      await ensureInitialized();
      for (const entry of reactions) {
        await db.executeAsync(
          `INSERT INTO mobile_message_reactions (
             message_id, conversation_id, user_id, emoji, sequence, is_deleted, updated_at
           ) VALUES (?, ?, ?, ?, ?, 0, ?)
           ON CONFLICT(message_id, user_id) DO UPDATE SET
             conversation_id = excluded.conversation_id,
             emoji = excluded.emoji,
             sequence = CASE
               WHEN excluded.sequence > mobile_message_reactions.sequence THEN excluded.sequence
               ELSE mobile_message_reactions.sequence
             END,
             is_deleted = 0,
             updated_at = excluded.updated_at`,
          [
            String(entry.message_id),
            String(entry.conversation_id),
            Number(entry.user_id),
            String(entry.emoji),
            Number(entry.sequence ?? 0),
            String(entry.updated_at)
          ]
        );
      }
    },
    async removeMessageReaction(messageId, userId) {
      await ensureInitialized();
      await db.executeAsync(
        `DELETE FROM mobile_message_reactions
         WHERE message_id = ? AND user_id = ?`,
        [String(messageId), Number(userId)]
      );
    },
    async loadReactionsByMessageIds(messageIds) {
      await ensureInitialized();
      return loadReactionsForMessageIds(
        db,
        messageIds.map(id => String(id))
      );
    },
    async replaceReactionsForMessages(messageIds, reactions) {
      await ensureInitialized();
      if (messageIds.length === 0) {
        return;
      }
      const placeholders = messageIds.map(() => "?").join(",");
      await db.executeAsync(
        `DELETE FROM mobile_message_reactions WHERE message_id IN (${placeholders})`,
        messageIds.map(id => String(id))
      );
      for (const entry of reactions) {
        await db.executeAsync(
          `INSERT INTO mobile_message_reactions (
             message_id, conversation_id, user_id, emoji, sequence, is_deleted, updated_at
           ) VALUES (?, ?, ?, ?, ?, 0, ?)
           ON CONFLICT(message_id, user_id) DO UPDATE SET
             conversation_id = excluded.conversation_id,
             emoji = excluded.emoji,
             sequence = CASE
               WHEN excluded.sequence > mobile_message_reactions.sequence THEN excluded.sequence
               ELSE mobile_message_reactions.sequence
             END,
             is_deleted = 0,
             updated_at = excluded.updated_at`,
          [
            String(entry.message_id),
            String(entry.conversation_id),
            Number(entry.user_id),
            String(entry.emoji),
            Number(entry.sequence ?? 0),
            String(entry.updated_at)
          ]
        );
      }
    },
    async applyReactionDeltas(deltas) {
      await ensureInitialized();
      // Caller is expected to have already sorted ascending by sequence; we
      // re-sort defensively to keep the conflict resolution rules below
      // deterministic in the face of out-of-order pages.
      const ordered = [...deltas].sort(
        (a, b) => Number(a.sequence) - Number(b.sequence)
      );
      for (const entry of ordered) {
        const sequence = Number(entry.sequence ?? 0);
        if (entry.is_deleted === 1) {
          // Tombstone: keep the row so we remain idempotent against future
          // re-deliveries of the same delta. Read end filters by is_deleted=0.
          await db.executeAsync(
            `INSERT INTO mobile_message_reactions (
               message_id, conversation_id, user_id, emoji, sequence, is_deleted, updated_at
             ) VALUES (?, ?, ?, '', ?, 1, ?)
             ON CONFLICT(message_id, user_id) DO UPDATE SET
               conversation_id = excluded.conversation_id,
               emoji = '',
               sequence = CASE
                 WHEN excluded.sequence > mobile_message_reactions.sequence THEN excluded.sequence
                 ELSE mobile_message_reactions.sequence
               END,
               is_deleted = CASE
                 WHEN excluded.sequence > mobile_message_reactions.sequence THEN 1
                 ELSE mobile_message_reactions.is_deleted
               END,
               updated_at = excluded.updated_at`,
            [
              String(entry.message_id),
              String(entry.conversation_id),
              Number(entry.user_id),
              sequence,
              String(entry.updated_at)
            ]
          );
          continue;
        }
        await db.executeAsync(
          `INSERT INTO mobile_message_reactions (
             message_id, conversation_id, user_id, emoji, sequence, is_deleted, updated_at
           ) VALUES (?, ?, ?, ?, ?, 0, ?)
           ON CONFLICT(message_id, user_id) DO UPDATE SET
             conversation_id = excluded.conversation_id,
             emoji = CASE
               WHEN excluded.sequence > mobile_message_reactions.sequence THEN excluded.emoji
               ELSE mobile_message_reactions.emoji
             END,
             sequence = CASE
               WHEN excluded.sequence > mobile_message_reactions.sequence THEN excluded.sequence
               ELSE mobile_message_reactions.sequence
             END,
             is_deleted = CASE
               WHEN excluded.sequence > mobile_message_reactions.sequence THEN 0
               ELSE mobile_message_reactions.is_deleted
             END,
             updated_at = excluded.updated_at`,
          [
            String(entry.message_id),
            String(entry.conversation_id),
            Number(entry.user_id),
            String(entry.emoji ?? ""),
            sequence,
            String(entry.updated_at)
          ]
        );
      }
    },
    async getReactionCursor(clientConversationId) {
      await ensureInitialized();
      const rows = await queryRows<SQLiteRow>(
        db,
        `SELECT sequence FROM mobile_reaction_cursors
         WHERE client_conversation_id = ? LIMIT 1`,
        [String(clientConversationId)]
      );
      return Number(rows[0]?.sequence ?? 0);
    },
    async setReactionCursor(clientConversationId, sequence) {
      await ensureInitialized();
      const next = Math.max(0, Math.floor(Number(sequence) || 0));
      await db.executeAsync(
        `INSERT INTO mobile_reaction_cursors (
           client_conversation_id, sequence, updated_at
         ) VALUES (?, ?, ?)
         ON CONFLICT(client_conversation_id) DO UPDATE SET
           sequence = CASE
             WHEN excluded.sequence > mobile_reaction_cursors.sequence
               THEN excluded.sequence
             ELSE mobile_reaction_cursors.sequence
           END,
           updated_at = excluded.updated_at`,
        [String(clientConversationId), next, new Date().toISOString()]
      );
    }
  };
}
