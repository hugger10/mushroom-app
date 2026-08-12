import { ipcMain } from "electron";
import type {
  ConversationSyncPayload,
  MessageSyncPayload
} from "@mushroom/shared";
import { getDb } from "../connection";
import { store } from "../..";
import log from "../../../utils/log";
import { fmtCount } from "../shared";
import { normalizeConversationRecordForWrite } from "../normalizers";
import {
  calculateConversationCutoff,
  upsertConversationBackfillJob,
  getConversationSyncProgress
} from "../conversation-sync";
import { clearGroupReadCacheForConversation } from "./read-receipts";

export function registerConversationHandlers() {
  ipcMain.handle("db:get-conversation-by-serverId", (_event, serverConvId) => {
    const stmt = getDb().prepare(
      "SELECT * FROM local_conversations WHERE server_conversation_id = ?"
    );
    const conv = stmt.get(serverConvId) as any;
    if (conv) {
      return {
        ...conv,
        last_message_content: JSON.parse(conv.last_message_content || "{}")
      };
    }
    return null;
  });

  ipcMain.handle(
    "db:get-conversations",
    (_event, includeArchived = false, includeLocallyDeleted = false) => {
      const db = getDb();
      const currentUserId = store.get("last-login-user") as number | null;
      const whereClauses: string[] = [];
      if (!includeArchived) {
        whereClauses.push("COALESCE(is_archived, 0) = 0");
      }
      if (!includeLocallyDeleted) {
        whereClauses.push("COALESCE(is_locally_deleted, 0) = 0");
      }
      const conversations = db
        .prepare(
          `
      SELECT *
      FROM local_conversations
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ""}
      ORDER BY is_pinned DESC, last_message_time DESC
    `
        )
        .all() as Array<any>;

      // Batch-fetch all members for all conversations (1 query instead of N)
      const convIds = conversations.map(
        (c: any) => c.client_conversation_id as string
      );
      const allMembersMap = new Map<string, Array<any>>();
      if (convIds.length > 0) {
        const placeholders = convIds.map(() => "?").join(",");
        const allMembers = db
          .prepare(
            `
            SELECT conversation_id, user_id, nickname, avatar_url, role, muted_until, muted_by, joined_at
            FROM local_conversation_members
            WHERE conversation_id IN (${placeholders})
            ORDER BY role DESC, joined_at ASC, user_id ASC
            `
          )
          .all(...convIds) as Array<any>;
        for (const member of allMembers) {
          const cid = member.conversation_id as string;
          if (!allMembersMap.has(cid)) {
            allMembersMap.set(cid, []);
          }
          allMembersMap.get(cid)!.push(member);
        }
      }

      // Batch-fetch contacts cache for all private chat peer_ids (1 query instead of N)
      const peerIds = conversations
        .filter((c: any) => c.type === 1 && c.peer_id != null)
        .map((c: any) => c.peer_id as number);
      const contactsCacheMap = new Map<
        number,
        {
          remark_name?: string | null;
          nickname?: string | null;
          username?: string | null;
          avatar_url?: string | null;
        }
      >();
      if (peerIds.length > 0) {
        const placeholders = peerIds.map(() => "?").join(",");
        const contacts = db
          .prepare(
            `
            SELECT user_id, remark_name, nickname, username, avatar_url
            FROM contacts_cache
            WHERE user_id IN (${placeholders})
            `
          )
          .all(...peerIds) as Array<any>;
        for (const contact of contacts) {
          contactsCacheMap.set(contact.user_id as number, contact);
        }
      }

      return conversations.map(conv => {
        let display_name = conv.name;
        let display_avatar = conv.avatar_url;

        const convId = conv.client_conversation_id as string;
        const members = (allMembersMap.get(convId) ?? []) as Array<any>;

        if (conv.type === 1) {
          const otherMember = members.find(
            member => member.user_id !== currentUserId
          ) as { nickname: string; avatar_url: string } | undefined;
          const cachedFriend = conv.peer_id
            ? contactsCacheMap.get(conv.peer_id as number)
            : undefined;
          display_name =
            cachedFriend?.remark_name ||
            otherMember?.nickname ||
            cachedFriend?.nickname ||
            cachedFriend?.username ||
            conv.name ||
            "Contact";
          display_avatar =
            otherMember?.avatar_url || cachedFriend?.avatar_url || "";
        }

        return {
          ...conv,
          last_message_content: JSON.parse(conv.last_message_content || "{}"),
          members,
          display_name,
          display_avatar
        };
      });
    }
  );

  ipcMain.handle("db:get-backfill-jobs", (_event, limit = 10) => {
    const rows = getDb()
      .prepare(
        `
        SELECT client_conversation_id, job_kind, priority, not_before_at, payload, updated_at
        FROM sync_backfill_jobs
        ORDER BY priority DESC, updated_at ASC
        LIMIT ?
        `
      )
      .all(limit);

    return rows.map(row => {
      const record = row as Record<string, unknown> & {
        payload?: string | null;
      };

      return {
        ...record,
        payload:
          typeof record.payload === "string" && record.payload.length > 0
            ? JSON.parse(record.payload)
            : null
      };
    });
  });

  ipcMain.handle("db:create-conversations", (event, conversations) => {
    log.debug("Creating conversations " + fmtCount(conversations));
    const insertConversation = getDb().prepare(`
      INSERT INTO local_conversations (
        client_conversation_id, server_conversation_id, type, name, avatar_url, owner_id, 
        peer_id, last_message_send_id, last_message_content, last_message_time, unread_count, mention_unread_count,
        last_sync_sequence, last_server_sequence, sync_gap_detected, tail_loaded_from_seq, tail_loaded_to_seq, history_complete, needs_backfill,
        last_read_sequence, peer_last_read_sequence, status, is_pinned, is_muted, is_archived, draft, description, settings,
        local_hidden_before_seq, is_locally_deleted
      ) VALUES (
        @client_conversation_id, @server_conversation_id, @type, @name, @avatar_url, @owner_id,
        @peer_id, @last_message_send_id, @last_message_content, 
        COALESCE(@last_message_time, CURRENT_TIMESTAMP),
        @unread_count, @mention_unread_count, @last_sync_sequence, @last_server_sequence, @sync_gap_detected, @tail_loaded_from_seq, @tail_loaded_to_seq, @history_complete, @needs_backfill,
        @last_read_sequence, @peer_last_read_sequence, @status, @is_pinned, @is_muted, @is_archived, @draft, @description, @settings,
        COALESCE(@local_hidden_before_seq, 0), COALESCE(@is_locally_deleted, 0)
      )
      ON CONFLICT(server_conversation_id) DO UPDATE SET
        type = excluded.type,
        name = excluded.name,
        avatar_url = excluded.avatar_url,
        owner_id = excluded.owner_id,
        peer_id = excluded.peer_id,
        last_message_send_id = excluded.last_message_send_id,
        last_message_content = excluded.last_message_content,
        last_message_time = excluded.last_message_time,
        unread_count = excluded.unread_count,
        mention_unread_count = COALESCE(excluded.mention_unread_count, local_conversations.mention_unread_count),
        last_sync_sequence = excluded.last_sync_sequence,
        last_server_sequence = excluded.last_server_sequence,
        sync_gap_detected = excluded.sync_gap_detected,
        tail_loaded_from_seq = excluded.tail_loaded_from_seq,
        tail_loaded_to_seq = excluded.tail_loaded_to_seq,
        history_complete = excluded.history_complete,
        needs_backfill = excluded.needs_backfill,
        last_read_sequence = excluded.last_read_sequence,
        peer_last_read_sequence = excluded.peer_last_read_sequence,
        status = excluded.status,
        is_pinned = excluded.is_pinned,
        is_muted = excluded.is_muted,
        is_archived = excluded.is_archived,
        draft = COALESCE(excluded.draft, local_conversations.draft),
        description = excluded.description,
        settings = excluded.settings,
        local_hidden_before_seq = COALESCE(excluded.local_hidden_before_seq, local_conversations.local_hidden_before_seq),
        is_locally_deleted = COALESCE(excluded.is_locally_deleted, local_conversations.is_locally_deleted)
    `);

    const insertMember = getDb().prepare(`
      INSERT INTO local_conversation_members (
        conversation_id, user_id, nickname, avatar_url, role, muted_until, muted_by, joined_at
      ) VALUES (
        @conversation_id, @user_id, @nickname, @avatar_url, @role, @muted_until, @muted_by, @joined_at
      )
      ON CONFLICT(conversation_id, user_id) DO NOTHING
    `);

    const createConversation = getDb().transaction(conversations => {
      for (const conversation of conversations) {
        const new_conversation =
          normalizeConversationRecordForWrite(conversation);
        // console.log("new_conversation", new_conversation);
        insertConversation.run(new_conversation);
        upsertConversationBackfillJob(
          getDb(),
          String(conversation.client_conversation_id)
        );

        for (const member of conversation.members) {
          insertMember.run({
            conversation_id: conversation.client_conversation_id,
            user_id: member.user_id,
            nickname: member.nickname,
            avatar_url: member.avatar_url,
            role: member.role,
            muted_until: member.muted_until,
            muted_by: member.muted_by,
            joined_at: member.joined_at
          });
        }
      }
      return conversations;
    });
    event.sender.send("conversation-sync", {
      source: "db:create-conversations",
      affectedClientConversationIds: conversations
        .map((c: { client_conversation_id?: string }) =>
          String(c.client_conversation_id || "")
        )
        .filter((id: string) => id.length > 0)
    } satisfies ConversationSyncPayload);
    return createConversation(conversations);
  });

  ipcMain.handle("db:update-conversations", (event, conversations) => {
    log.debug("Updating conversations " + fmtCount(conversations));
    const updateConversation = getDb().prepare(`
    UPDATE local_conversations SET
      server_conversation_id = @server_conversation_id,
      type = @type,
      name = @name,
      avatar_url = @avatar_url,
      owner_id = @owner_id,
      peer_id = @peer_id,
      last_message_send_id = @last_message_send_id,
      last_message_content = @last_message_content,
      last_message_time = COALESCE(@last_message_time, CURRENT_TIMESTAMP),
      unread_count = @unread_count,
      mention_unread_count = COALESCE(@mention_unread_count, mention_unread_count),
      last_sync_sequence = @last_sync_sequence,
      last_server_sequence = COALESCE(@last_server_sequence, last_server_sequence),
      sync_gap_detected = COALESCE(@sync_gap_detected, sync_gap_detected),
      tail_loaded_from_seq = COALESCE(@tail_loaded_from_seq, tail_loaded_from_seq),
      tail_loaded_to_seq = COALESCE(@tail_loaded_to_seq, tail_loaded_to_seq),
      history_complete = COALESCE(@history_complete, history_complete),
      needs_backfill = COALESCE(@needs_backfill, needs_backfill),
      last_read_sequence = @last_read_sequence,
      peer_last_read_sequence = COALESCE(@peer_last_read_sequence, peer_last_read_sequence),
      status = @status,
      is_pinned = @is_pinned,
      is_muted = @is_muted,
      is_archived = @is_archived,
      draft = COALESCE(@draft, draft),
      description = @description,
      settings = @settings,
      local_hidden_before_seq = COALESCE(@local_hidden_before_seq, local_hidden_before_seq),
      is_locally_deleted = COALESCE(@is_locally_deleted, is_locally_deleted)
    WHERE client_conversation_id = @client_conversation_id
  `);

    const deleteMembers = getDb().prepare(`
    DELETE FROM local_conversation_members
    WHERE conversation_id = @conversation_id
  `);

    const insertMember = getDb().prepare(`
    INSERT INTO local_conversation_members (
      conversation_id, user_id, nickname, avatar_url, role, muted_until, muted_by, joined_at
    ) VALUES (
      @conversation_id, @user_id, @nickname, @avatar_url, @role, @muted_until, @muted_by, @joined_at
    )
  `);

    const updateConversations = getDb().transaction((conversations: any[]) => {
      for (const conversation of conversations) {
        const updatedConversation =
          normalizeConversationRecordForWrite(conversation);
        updateConversation.run(updatedConversation);
        upsertConversationBackfillJob(
          getDb(),
          String(conversation.client_conversation_id)
        );

        deleteMembers.run({
          conversation_id: conversation.client_conversation_id
        });

        for (const member of conversation.members) {
          insertMember.run({
            conversation_id: conversation.client_conversation_id,
            user_id: member.user_id,
            nickname: member.nickname,
            avatar_url: member.avatar_url,
            role: member.role,
            muted_until: member.muted_until,
            muted_by: member.muted_by,
            joined_at: member.joined_at
          });
        }
      }
      return conversations;
    });
    event.sender.send("conversation-sync", {
      source: "db:update-conversations",
      affectedClientConversationIds: conversations
        .map((c: { client_conversation_id?: string }) =>
          String(c.client_conversation_id || "")
        )
        .filter((id: string) => id.length > 0)
    } satisfies ConversationSyncPayload);
    return updateConversations(conversations);
  });

  ipcMain.handle("db:update-conversation-state", (event, conversation) => {
    const hasDraft = Object.prototype.hasOwnProperty.call(
      conversation,
      "draft"
    );
    const result = getDb()
      .prepare(
        `
          UPDATE local_conversations
          SET is_pinned = COALESCE(@is_pinned, is_pinned),
              is_muted = COALESCE(@is_muted, is_muted),
              is_archived = COALESCE(@is_archived, is_archived),
              draft = CASE WHEN @has_draft = 1 THEN @draft ELSE draft END,
              updated_at = CURRENT_TIMESTAMP
          WHERE client_conversation_id = @client_conversation_id
        `
      )
      .run({
        ...conversation,
        is_pinned:
          conversation.is_pinned === undefined ? null : conversation.is_pinned,
        is_muted:
          conversation.is_muted === undefined ? null : conversation.is_muted,
        is_archived:
          conversation.is_archived === undefined
            ? null
            : conversation.is_archived,
        has_draft: hasDraft ? 1 : 0,
        draft: hasDraft ? (conversation.draft ?? null) : null
      });

    const shouldBroadcastSync =
      result.changes > 0 &&
      (Object.prototype.hasOwnProperty.call(conversation, "is_pinned") ||
        Object.prototype.hasOwnProperty.call(conversation, "is_muted") ||
        Object.prototype.hasOwnProperty.call(conversation, "is_archived"));

    if (shouldBroadcastSync) {
      event.sender.send("conversation-sync", {
        source: "db:update-conversation-state",
        affectedClientConversationIds: [
          String(conversation.client_conversation_id)
        ]
      } satisfies ConversationSyncPayload);
    }

    return result;
  });

  ipcMain.handle(
    "db:delete-conversations",
    (event, conversationIds: string[]) => {
      log.debug("Deleting conversations " + fmtCount(conversationIds));
      const deleteMembers = getDb().prepare(`
        DELETE FROM local_conversation_members
        WHERE conversation_id = ?
      `);

      const deleteMessages = getDb().prepare(`
        DELETE FROM local_messages
        WHERE client_conversation_id = ?
      `);

      const deleteOutgoing = getDb().prepare(`
        DELETE FROM outgoing_messages
        WHERE client_conversation_id = ?
      `);

      const lookupServerConvId = getDb().prepare(`
        SELECT server_conversation_id
        FROM local_conversations
        WHERE client_conversation_id = ?
      `);

      const deleteConversation = getDb().prepare(`
        DELETE FROM local_conversations
        WHERE client_conversation_id = ?
      `);
      const deleteBackfillJob = getDb().prepare(`
        DELETE FROM sync_backfill_jobs
        WHERE client_conversation_id = ?
      `);

      const deleteConversations = getDb().transaction((ids: string[]) => {
        for (const id of ids) {
          deleteMembers.run(id);
          deleteMessages.run(id);
          deleteOutgoing.run(id);
          deleteBackfillJob.run(id);
          const convRow = lookupServerConvId.get(id) as
            | { server_conversation_id?: string }
            | undefined;
          if (convRow?.server_conversation_id) {
            clearGroupReadCacheForConversation(
              String(convRow.server_conversation_id)
            );
          }
          deleteConversation.run(id);
        }
        return ids;
      });
      event.sender.send("conversation-sync", {
        source: "db:delete-conversations",
        removedClientConversationIds: conversationIds.map(id => String(id))
      } satisfies ConversationSyncPayload);
      return deleteConversations(conversationIds);
    }
  );

  ipcMain.handle(
    "db:delete-conversation-locally",
    (event, clientConversationId: string) => {
      const db = getDb();
      const deleteConversationLocally = db.transaction((id: string) => {
        const cutoffSeq = calculateConversationCutoff(db, id);
        db.prepare(
          `
          DELETE FROM local_messages
          WHERE client_conversation_id = ?
        `
        ).run(id);
        db.prepare(
          `
          DELETE FROM outgoing_messages
          WHERE client_conversation_id = ?
        `
        ).run(id);
        const convForRead = db
          .prepare(
            `SELECT server_conversation_id FROM local_conversations WHERE client_conversation_id = ?`
          )
          .get(id) as { server_conversation_id?: string } | undefined;
        if (convForRead?.server_conversation_id) {
          clearGroupReadCacheForConversation(
            String(convForRead.server_conversation_id)
          );
        }
        db.prepare(
          `
          DELETE FROM sync_backfill_jobs
          WHERE client_conversation_id = ?
        `
        ).run(id);
        db.prepare(
          `
          UPDATE local_conversations
          SET
            last_message_id = NULL,
            last_message_send_id = 0,
            last_message_content = '{}',
            last_message_time = '',
            unread_count = 0,
            mention_unread_count = 0,
            last_sync_sequence = ?,
            last_server_sequence = CASE
              WHEN COALESCE(last_server_sequence, 0) > ? THEN last_server_sequence
              ELSE ?
            END,
            sync_gap_detected = 0,
            tail_loaded_from_seq = 0,
            tail_loaded_to_seq = 0,
            history_complete = 1,
            needs_backfill = 0,
            last_read_sequence = CASE
              WHEN COALESCE(last_read_sequence, 0) > ? THEN last_read_sequence
              ELSE ?
            END,
            draft = NULL,
            local_hidden_before_seq = ?,
            is_locally_deleted = 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE client_conversation_id = ?
        `
        ).run(
          cutoffSeq,
          cutoffSeq,
          cutoffSeq,
          cutoffSeq,
          cutoffSeq,
          cutoffSeq,
          id
        );
      });

      deleteConversationLocally(clientConversationId);
      event.sender.send("message-sync", {
        source: "db:delete-conversation-locally",
        clientConversationId: String(clientConversationId),
        clearAllMessages: true
      } satisfies MessageSyncPayload);
      event.sender.send("conversation-sync", {
        source: "db:delete-conversation-locally",
        affectedClientConversationIds: [String(clientConversationId)]
      } satisfies ConversationSyncPayload);
      return true;
    }
  );

  ipcMain.handle("db:clear-conversation-messages", (event, conversationId) => {
    const db = getDb();
    const clearConversation = db.transaction((id: string) => {
      const cutoffSeq = calculateConversationCutoff(db, id);
      db.prepare(
        `
        DELETE FROM local_messages
        WHERE client_conversation_id = ?
      `
      ).run(id);

      db.prepare(
        `
        DELETE FROM outgoing_messages
        WHERE client_conversation_id = ?
      `
      ).run(id);

      const convForRead = db
        .prepare(
          `SELECT server_conversation_id FROM local_conversations WHERE client_conversation_id = ?`
        )
        .get(id) as { server_conversation_id?: string } | undefined;
      if (convForRead?.server_conversation_id) {
        clearGroupReadCacheForConversation(
          String(convForRead.server_conversation_id)
        );
      }

      db.prepare(
        `
        UPDATE local_conversations
        SET
          last_message_id = NULL,
          last_message_send_id = 0,
          last_message_content = '{}',
          last_message_time = '',
          unread_count = 0,
          mention_unread_count = 0,
          last_sync_sequence = ?,
          last_server_sequence = CASE
            WHEN COALESCE(last_server_sequence, 0) > ? THEN last_server_sequence
            ELSE ?
          END,
          sync_gap_detected = 0,
          tail_loaded_from_seq = 0,
          tail_loaded_to_seq = 0,
          history_complete = 1,
          needs_backfill = 0,
          last_read_sequence = CASE
            WHEN COALESCE(last_read_sequence, 0) > ? THEN last_read_sequence
            ELSE ?
          END,
          local_hidden_before_seq = ?,
          is_locally_deleted = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE client_conversation_id = ?
      `
      ).run(
        cutoffSeq,
        cutoffSeq,
        cutoffSeq,
        cutoffSeq,
        cutoffSeq,
        cutoffSeq,
        id
      );
      db.prepare(
        `
        DELETE FROM sync_backfill_jobs
        WHERE client_conversation_id = ?
      `
      ).run(id);
    });

    clearConversation(conversationId);
    event.sender.send("message-sync", {
      source: "db:clear-conversation-messages",
      clientConversationId: String(conversationId),
      clearAllMessages: true
    } satisfies MessageSyncPayload);
    event.sender.send("conversation-sync", {
      source: "db:clear-conversation-messages",
      affectedClientConversationIds: [String(conversationId)]
    } satisfies ConversationSyncPayload);
    return true;
  });

  ipcMain.handle(
    "db:mark-history-complete",
    (
      event,
      payload: {
        clientConversationId: string;
        oldestVisibleSequence?: number | null;
      }
    ) => {
      const clientConversationId = String(payload?.clientConversationId ?? "");
      if (!clientConversationId) {
        return null;
      }
      const oldestVisibleSequence = Math.max(
        0,
        Number(payload?.oldestVisibleSequence ?? 0)
      );
      const db = getDb();
      const current = getConversationSyncProgress(db, clientConversationId);
      if (!current) {
        return null;
      }

      // 仅在远端探底确认更老历史不存在时被调用。为避免覆盖其它路径刚检测到
      // 的真实 gap / 排入的 backfill 任务，这里只更新与「历史已完整」直接
      // 相关的三列：
      //   - history_complete    标记本会话再无更老历史
      //   - local_hidden_before_seq 抬升到 oldestVisibleSequence - 1，
      //     永久愈合「清空 cutoff -> 新消息 seq」之间的缺口
      //   - tail_loaded_from_seq 收紧到当前最老可见 sequence
      // 显式不写 sync_gap_detected / needs_backfill / last_sync_sequence，
      // 让 reconcileConversationSyncProgress 在下次新消息到达时自然复算；
      // 也不删除 sync_backfill_jobs，避免误伤其它路径排入的补齐任务。
      const existingHidden = Number(current.local_hidden_before_seq || 0);
      const candidateCutoff =
        oldestVisibleSequence > 0 ? oldestVisibleSequence - 1 : 0;
      const nextHidden = Math.max(existingHidden, candidateCutoff);

      const existingTailFrom = Number(current.tail_loaded_from_seq || 0);
      const nextTailFrom =
        oldestVisibleSequence > 0
          ? existingTailFrom === 0
            ? oldestVisibleSequence
            : Math.min(existingTailFrom, oldestVisibleSequence)
          : existingTailFrom;

      db.prepare(
        `
        UPDATE local_conversations
        SET
          history_complete = 1,
          local_hidden_before_seq = ?,
          tail_loaded_from_seq = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE client_conversation_id = ?
        `
      ).run(nextHidden, nextTailFrom, clientConversationId);

      event.sender.send("conversation-sync", {
        source: "db:mark-history-complete",
        affectedClientConversationIds: [clientConversationId]
      } satisfies ConversationSyncPayload);

      return getConversationSyncProgress(db, clientConversationId);
    }
  );

  ipcMain.handle("db:update-conv-lastMsg", (_event, conversation) => {
    log.debug("Updating last msg ccid=" + conversation?.client_conversation_id);
    const conversationForDb = {
      ...conversation,
      last_message_content: JSON.stringify(conversation.last_message_content),
      last_message_time: conversation.last_message_time
    };
    const stmt = getDb().prepare(`
      UPDATE local_conversations SET 
      last_message_send_id = @last_message_send_id, 
      last_message_content = @last_message_content, 
      last_message_time = @last_message_time 
      WHERE client_conversation_id = @client_conversation_id
    `);
    return stmt.run(conversationForDb);
  });
}
