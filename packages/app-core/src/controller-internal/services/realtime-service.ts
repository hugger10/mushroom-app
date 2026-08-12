import type {
  AttachmentUpdatedMessage,
  BlockChangedMessage,
  ChatMessage,
  ContactChangedMessage,
  ConversationReadMessage,
  GroupReadMessage,
  Message,
  MessageReactionMessage,
  MessageRecallMessage,
  ServerWsMessage
} from "@mushroom/shared";
import {
  getMessageMentions,
  getNextMentionUnreadCount,
  getNextUnreadCount,
  hasMatchingMessage,
  isMentioningAll
} from "@mushroom/shared";
import {
  mapBlockedUserToContactListItem,
  mapContactToContactListItem
} from "../../mappers";
import type { ControllerContext } from "../context";
import type { IncomingChatMessageContext } from "../../types";

/**
 * RealtimeService 处理所有 WS 帧的路由与具体分支：
 *   - handleRealtimeEvent：分发
 *   - handleRealtimeChatMessage / handleMessageRecall / handleMessageReaction
 *   - handleContactChanged / handleBlockChanged / handleAttachmentUpdated
 *   - handleConversationReadMessage / handleGroupReadMessage
 */
export class RealtimeService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async handleRealtimeEvent(message: ServerWsMessage) {
    if (message.messageClassify === "chat") {
      return this.handleRealtimeChatMessage(message);
    }

    if (message.messageClassify === "conversation_read") {
      return this.handleConversationReadMessage(message);
    }

    if (message.messageClassify === "group_read") {
      return this.handleGroupReadMessage(message);
    }

    if (message.messageClassify === "conversation_sync") {
      // remove 分支走本地直删快速路径，与 apps/web 对齐。
      if (message.action === "remove" && message.conversation_id) {
        const repo = this.ctx.getRepository();
        const conversation = await repo.getConversationByServerId(
          String(message.conversation_id)
        );
        if (conversation) {
          await repo.removeConversations([conversation.client_conversation_id]);
          await repo.clearGroupReadState?.(String(message.conversation_id));
          if (
            this.ctx.getActiveConversationId() ===
            conversation.client_conversation_id
          ) {
            this.ctx.setActiveConversationId(null);
          }
          return this.ctx.publishSnapshot();
        }
      }
      return this.ctx.services.sync.syncNow();
    }

    if (message.messageClassify === "message_recall") {
      return this.handleMessageRecall(message);
    }

    if (message.messageClassify === "message_reaction") {
      return this.handleMessageReaction(message);
    }

    if (message.messageClassify === "contact_changed") {
      return this.handleContactChanged(message);
    }

    if (message.messageClassify === "block_changed") {
      return this.handleBlockChanged(message);
    }

    if (message.messageClassify === "attachment_updated") {
      return this.handleAttachmentUpdated(message);
    }

    return this.ctx.publishSnapshot();
  }

  private async handleRealtimeChatMessage(message: ChatMessage) {
    const repo = this.ctx.getRepository();
    const conversation = await repo.getConversationByServerId(
      String(message.server_conversation_id || "")
    );
    if (!conversation) {
      return this.ctx.services.sync.syncNow();
    }

    const auth = await this.ctx.getAuthStore().read();
    const currentUserId = Number(auth.user?.userId || 0);
    const isIncoming = Number(message.sender_id) !== currentUserId;
    const isActiveConversation =
      conversation.client_conversation_id ===
      this.ctx.getActiveConversationId();
    const existingMessages = await repo.listMessages(
      conversation.client_conversation_id
    );
    const isDuplicateMessage = hasMatchingMessage(existingMessages, message);
    const mentions = getMessageMentions(message.content);
    const mentionAll = isMentioningAll(message.content);
    const mentionMe =
      isIncoming &&
      (mentionAll ||
        mentions.some(mention => Number(mention.user_id) === currentUserId));

    const persistedMessage: Message = {
      ...message,
      client_conversation_id: conversation.client_conversation_id,
      server_conversation_id: conversation.server_conversation_id,
      status: 0
    };

    await repo.upsertMessages([persistedMessage]);
    await repo.upsertConversations([
      {
        ...conversation,
        is_archived: isIncoming ? 0 : conversation.is_archived,
        unread_count: getNextUnreadCount({
          currentUnreadCount: conversation.unread_count,
          isIncoming,
          shouldMarkRead: isActiveConversation,
          isDuplicate: isDuplicateMessage
        }),
        mention_unread_count: getNextMentionUnreadCount({
          currentMentionUnreadCount: conversation.mention_unread_count,
          isIncoming,
          shouldMarkRead: isActiveConversation,
          isDuplicate: isDuplicateMessage,
          mentionMe
        }),
        last_server_sequence: Math.max(
          Number(conversation.last_server_sequence || 0),
          Number(message.sequence || 0)
        ),
        manual_unread_count:
          isIncoming && !isActiveConversation
            ? Number(conversation.manual_unread_count || 0)
            : 0,
        last_message_content: message.content,
        last_message_time: message.created_at,
        last_message_send_id: message.sender_id
      }
    ]);

    if (isIncoming && isActiveConversation) {
      await this.ctx.services.readReceipt.scheduleConversationRead(
        conversation.client_conversation_id,
        { notify: false }
      );
    }

    if (isIncoming && !isDuplicateMessage && this.ctx.onIncomingChatMessage) {
      const incomingCtx: IncomingChatMessageContext = {
        message: persistedMessage,
        conversation,
        isActiveConversation,
        isMentioned: mentionMe,
        isDuplicate: false
      };
      try {
        await this.ctx.onIncomingChatMessage(incomingCtx);
      } catch (error) {
        // Notification dispatch must never break the realtime pipeline.
        void error;
      }
    }

    return this.ctx.publishSnapshot();
  }

  private async handleMessageRecall(message: MessageRecallMessage) {
    const repo = this.ctx.getRepository();
    const conversation = await repo.getConversationByServerId(
      message.server_conversation_id
    );
    if (!conversation) {
      return this.ctx.publishSnapshot();
    }

    const messages = await repo.listMessages(
      conversation.client_conversation_id
    );
    const recalledMessage = messages.find(
      item =>
        item.server_message_id === message.server_message_id ||
        item.client_message_id === message.client_message_id
    );
    if (!recalledMessage) {
      return this.ctx.services.sync.syncNow();
    }

    await repo.upsertMessages([
      {
        ...recalledMessage,
        is_recalled: 1,
        content: message.content,
        updated_at: message.updated_at,
        sequence: message.sequence
      }
    ]);

    return this.ctx.publishSnapshot();
  }

  private async handleMessageReaction(message: MessageReactionMessage) {
    const repo = this.ctx.getRepository();
    const isRemoval =
      message.action === "removed" ||
      message.emoji === null ||
      message.is_deleted === 1;
    await repo.applyReactionDeltas([
      {
        message_id: message.server_message_id,
        conversation_id: message.server_conversation_id,
        client_conversation_id: message.server_conversation_id,
        user_id: message.user_id,
        emoji: isRemoval ? null : message.emoji,
        sequence: Number(message.sequence ?? 0),
        is_deleted: isRemoval ? 1 : 0,
        updated_at: message.updated_at
      }
    ]);
    if (Number(message.sequence ?? 0) > 0) {
      const conversation = await repo.getConversationByServerId(
        message.server_conversation_id
      );
      if (conversation) {
        await repo.setReactionCursor(
          conversation.client_conversation_id,
          Number(message.sequence)
        );
      }
    }
    return this.ctx.publishSnapshot();
  }

  private async handleContactChanged(message: ContactChangedMessage) {
    const repo = this.ctx.getRepository();
    const { action, contact } = message;

    switch (action) {
      case "added":
      case "updated": {
        const item = mapContactToContactListItem(
          contact as Parameters<typeof mapContactToContactListItem>[0]
        );
        await repo.upsertContacts([item]);
        break;
      }
      case "removed": {
        const userId = (contact as { user_id: number }).user_id;
        await repo.removeContacts([userId]);
        break;
      }
    }

    return this.ctx.publishSnapshot();
  }

  private async handleBlockChanged(message: BlockChangedMessage) {
    const repo = this.ctx.getRepository();
    const { action, block } = message;

    switch (action) {
      case "blocked": {
        const item = mapBlockedUserToContactListItem(
          block as Parameters<typeof mapBlockedUserToContactListItem>[0]
        );
        await repo.upsertContacts([item]);
        break;
      }
      case "unblocked": {
        return this.ctx.services.sync.syncNow({ force: true });
      }
    }

    return this.ctx.publishSnapshot();
  }

  private async handleAttachmentUpdated(message: AttachmentUpdatedMessage) {
    const repo = this.ctx.getRepository();
    const uploadId = message.upload_id;
    if (!uploadId) {
      return this.ctx.publishSnapshot();
    }
    const conversations = await repo.listConversations();
    for (const conv of conversations) {
      const messages = await repo.listMessages(conv.client_conversation_id);
      const target = messages.find(item => {
        const c = item.content as Record<string, unknown> | undefined;
        return c && typeof c === "object" && c.upload_id === uploadId;
      });
      if (!target) {
        continue;
      }
      const nextContent = {
        ...(target.content as Record<string, unknown>)
      } as Record<string, unknown>;
      if (typeof message.thumb_url === "string") {
        nextContent.thumb_url = message.thumb_url;
      }
      if (typeof message.preview_url === "string") {
        nextContent.preview_url = message.preview_url;
      }
      if (typeof message.width === "number") {
        nextContent.width = message.width;
      }
      if (typeof message.height === "number") {
        nextContent.height = message.height;
      }
      nextContent.thumb_status = message.thumb_status;
      await repo.upsertMessages([
        {
          ...target,
          content: nextContent as Message["content"]
        }
      ]);
      break;
    }
    return this.ctx.publishSnapshot();
  }

  private async handleConversationReadMessage(
    message: ConversationReadMessage
  ) {
    const repo = this.ctx.getRepository();
    const conversation = await repo.getConversationByServerId(
      message.conversation_id
    );
    if (!conversation) {
      return this.ctx.publishSnapshot();
    }

    await repo.upsertConversations([
      {
        ...conversation,
        unread_count: Number(message.unread_count || 0),
        mention_unread_count:
          Number(message.unread_count || 0) <= 0
            ? 0
            : conversation.mention_unread_count,
        manual_unread_count:
          Number(message.unread_count || 0) <= 0
            ? 0
            : Number(conversation.manual_unread_count || 0),
        peer_last_read_sequence: Math.max(
          Number(conversation.peer_last_read_sequence || 0),
          Number(message.read_seq || 0)
        )
      }
    ]);

    return this.ctx.publishSnapshot();
  }

  private async handleGroupReadMessage(message: GroupReadMessage) {
    // 客户端兜底 gating：详见原 controller 注释。
    if (!this.ctx.services.privacy.isReceiptsEnabled()) {
      return this.ctx.publishSnapshot();
    }
    const repo = this.ctx.getRepository();
    const upsert = repo.upsertGroupReadStates?.bind(repo);
    if (!upsert) {
      return this.ctx.publishSnapshot();
    }
    const conversationId = String(message.conversation_id ?? "");
    const readerUserId = Number(message.reader_user_id ?? 0);
    const lastReadSeq = Number(message.last_read_seq ?? 0);
    if (!conversationId || readerUserId <= 0 || lastReadSeq <= 0) {
      return this.ctx.publishSnapshot();
    }
    const senderUserId = Number(message.message_sender_id ?? 0);
    if (senderUserId > 0 && senderUserId === readerUserId) {
      return this.ctx.publishSnapshot();
    }
    await upsert(conversationId, [
      { user_id: readerUserId, last_read_seq: lastReadSeq }
    ]);
    return this.ctx.publishSnapshot();
  }
}
