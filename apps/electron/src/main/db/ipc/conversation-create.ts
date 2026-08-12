import { ipcMain } from "electron";
import { getDb } from "../connection";
import log from "../../../utils/log";
import { normalizeConversationRecordForWrite } from "../normalizers";
import { upsertConversationBackfillJob } from "../conversation-sync";

export function registerConversationCreateHandler() {
  ipcMain.handle(
    "db:create-conversation",
    (_event, conversation, members, message) => {
      log.debug(
        "Creating conversation ccid=" +
          conversation?.client_conversation_id +
          " members=" +
          (Array.isArray(members) ? members.length : 0) +
          " hasInitMsg=" +
          (message ? 1 : 0)
      );
      const insertConversation = getDb().prepare(`
      INSERT INTO local_conversations (
        client_conversation_id, server_conversation_id, type, name, avatar_url, owner_id, 
        peer_id, last_message_send_id, last_message_content, last_message_time, 
        unread_count, mention_unread_count, last_sync_sequence, last_server_sequence, sync_gap_detected,
        tail_loaded_from_seq, tail_loaded_to_seq, history_complete, needs_backfill,
        last_read_sequence, peer_last_read_sequence, status, is_pinned, is_muted, is_archived, draft,
        local_hidden_before_seq, is_locally_deleted
      ) VALUES (
        @client_conversation_id, @server_conversation_id, @type, @name, @avatar_url, @owner_id,
        @peer_id, @last_message_send_id, @last_message_content, 
        COALESCE(@last_message_time, CURRENT_TIMESTAMP),
        @unread_count, @mention_unread_count, @last_sync_sequence, @last_server_sequence, @sync_gap_detected,
        @tail_loaded_from_seq, @tail_loaded_to_seq, @history_complete, @needs_backfill,
        @last_read_sequence, @peer_last_read_sequence, @status, @is_pinned, @is_muted, @is_archived, @draft,
        COALESCE(@local_hidden_before_seq, 0), COALESCE(@is_locally_deleted, 0)
      )
      ON CONFLICT(client_conversation_id) DO NOTHING
    `);

      const insertMember = getDb().prepare(`
      INSERT INTO local_conversation_members (
        conversation_id, user_id, nickname, avatar_url, role, muted_until, muted_by, joined_at
      ) VALUES (
        @conversation_id, @user_id, @nickname, @avatar_url, @role, @muted_until, @muted_by, @joined_at
      )
      ON CONFLICT(conversation_id, user_id) DO NOTHING
    `);

      const insertMessage = getDb().prepare(`
      INSERT OR IGNORE INTO local_messages (
      client_message_id,
      server_message_id,
      client_conversation_id,
      sequence,
      sender_id,
      sender_nickname,
      sender_avatar,
      content,
      type,
      created_at,
      status,
      is_recalled,
      is_favorited,
      is_pinned,
      reply_to_message_id,
      reply_to_sender_id,
      reply_to_sender_nickname,
      reply_to_text
      ) VALUES (
        @client_message_id,
        @server_message_id,
        @client_conversation_id,
        @sequence,
        @sender_id,
        @sender_nickname,
        @sender_avatar,
        @content,
        @type,
        COALESCE(@created_at, CURRENT_TIMESTAMP),
        @status,
        @is_recalled,
        @is_favorited,
        @is_pinned,
        @reply_to_message_id,
        @reply_to_sender_id,
        @reply_to_sender_nickname,
        @reply_to_text
      )
    `);

      const createConversation = getDb().transaction(
        (conversation, members, message) => {
          const new_conversation =
            normalizeConversationRecordForWrite(conversation);
          insertConversation.run(new_conversation);
          upsertConversationBackfillJob(
            getDb(),
            String(conversation.client_conversation_id)
          );

          for (const member of members) {
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

          const new_message = {
            ...message,
            content: JSON.stringify(message.content),
            sender_nickname: message.sender_nickname ?? null,
            sender_avatar: message.sender_avatar ?? null,
            is_favorited: message.is_favorited ?? 0,
            is_pinned: message.is_pinned ?? 0,
            reply_to_message_id: message.reply_to_message_id || null,
            reply_to_sender_id: message.reply_to?.sender_id || null,
            reply_to_sender_nickname: message.reply_to?.sender_nickname || null,
            reply_to_text: message.reply_to?.text || null
          };
          insertMessage.run(new_message);
          return {
            ...conversation,
            members
          };
        }
      );

      return createConversation(conversation, members, message);
    }
  );
}
