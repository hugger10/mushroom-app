import { createSystemMessageContent } from "@mushroom/shared";
import type { ControllerContext } from "../context";

/**
 * MessageStateService 负责消息层面的 favorite / pin / recall / reaction。
 */
export class MessageStateService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async toggleFavoriteMessage(input: {
    clientConversationId: string;
    clientMessageId: string;
  }) {
    return this.updateMessageState({
      clientConversationId: input.clientConversationId,
      clientMessageId: input.clientMessageId,
      nextFavorite: "toggle"
    });
  }

  async togglePinMessage(input: {
    clientConversationId: string;
    clientMessageId: string;
  }) {
    return this.updateMessageState({
      clientConversationId: input.clientConversationId,
      clientMessageId: input.clientMessageId,
      nextPin: "toggle"
    });
  }

  async recallMessage(input: {
    clientConversationId: string;
    clientMessageId: string;
  }) {
    const repo = this.ctx.getRepository();
    const conversation = await repo.getConversationByClientId(
      input.clientConversationId
    );
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const messages = await repo.listMessages(input.clientConversationId);
    const message =
      messages.find(item => item.client_message_id === input.clientMessageId) ??
      null;
    if (!message?.server_message_id) {
      throw new Error("Only delivered messages can be recalled.");
    }
    if (Number(message.is_recalled || 0) > 0) {
      return this.ctx.publishSnapshot();
    }

    const previousMessage = { ...message };
    await repo.upsertMessages([
      {
        ...message,
        is_recalled: 1,
        content: createSystemMessageContent("message_recalled"),
        updated_at: new Date().toISOString()
      }
    ]);
    await this.ctx.publishSnapshot();

    try {
      const result = await this.ctx.api.recallMessage({
        messageId: message.server_message_id,
        conversationId: conversation.server_conversation_id
      });
      await repo.upsertMessages([
        {
          ...message,
          is_recalled: 1,
          content: result.data.content,
          updated_at: result.data.updated_at,
          server_message_id: result.data.message_id,
          server_conversation_id: result.data.conversation_id,
          sequence: result.data.sequence
        }
      ]);
      return this.ctx.publishSnapshot();
    } catch (error) {
      await repo.upsertMessages([previousMessage]);
      await this.ctx.publishSnapshot();
      throw error;
    }
  }

  async toggleMessageReaction(input: {
    clientConversationId: string;
    clientMessageId: string;
    emoji: string | null;
  }) {
    const repo = this.ctx.getRepository();
    const conversation = await repo.getConversationByClientId(
      input.clientConversationId
    );
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const messages = await repo.listMessages(input.clientConversationId);
    const message =
      messages.find(item => item.client_message_id === input.clientMessageId) ??
      null;
    if (!message?.server_message_id) {
      throw new Error("Only delivered messages can be reacted to.");
    }
    if (Number(message.is_recalled || 0) > 0) {
      throw new Error("Cannot react to a recalled message.");
    }
    if (Number(message.type) === 0) {
      throw new Error("Cannot react to a system message.");
    }

    const auth = await this.ctx.getAuthStore().read();
    if (!auth.user) {
      throw new Error("Please log in again.");
    }
    const userId = Number(auth.user.userId);

    const previousReactions = await repo.loadReactionsByMessageIds([
      message.server_message_id
    ]);
    const previousMine =
      previousReactions.find(item => Number(item.user_id) === userId) ?? null;

    const desired = input.emoji;
    const sameAsCurrent = previousMine && desired === previousMine.emoji;
    const willRemove = desired === null || sameAsCurrent;
    const optimisticTimestamp = new Date().toISOString();
    // Optimistic writes use a strictly negative placeholder so the server
    // confirmed positive sequence (or any incoming WS delta) wins.
    const optimisticSequence = -Date.now();

    if (willRemove) {
      await repo.removeMessageReaction(message.server_message_id, userId);
    } else {
      await repo.applyMessageReactions([
        {
          message_id: message.server_message_id,
          conversation_id: conversation.server_conversation_id,
          user_id: userId,
          emoji: desired as string,
          updated_at: optimisticTimestamp,
          sequence: optimisticSequence
        }
      ]);
    }
    await this.ctx.publishSnapshot();

    try {
      const result = await this.ctx.api.setMessageReaction({
        messageId: message.server_message_id,
        conversationId: conversation.server_conversation_id,
        emoji: desired
      });
      const data = result.data;
      await repo.applyReactionDeltas([
        {
          message_id: data.message_id,
          conversation_id: data.conversation_id,
          client_conversation_id: conversation.client_conversation_id,
          user_id: data.user_id,
          emoji: data.action === "removed" ? null : data.emoji,
          sequence: Number(data.sequence ?? 0),
          is_deleted: data.action === "removed" ? 1 : 0,
          updated_at: data.updated_at
        }
      ]);
      if (Number(data.sequence ?? 0) > 0) {
        await repo.setReactionCursor(
          conversation.client_conversation_id,
          Number(data.sequence)
        );
      }
      return this.ctx.publishSnapshot();
    } catch (error) {
      await repo.removeMessageReaction(message.server_message_id, userId);
      if (previousMine) {
        await repo.applyMessageReactions([previousMine]);
      }
      await this.ctx.publishSnapshot();
      throw error;
    }
  }

  private async updateMessageState(input: {
    clientConversationId: string;
    clientMessageId: string;
    nextFavorite?: 0 | 1 | "toggle";
    nextPin?: 0 | 1 | "toggle";
  }) {
    const repo = this.ctx.getRepository();
    const conversation = await repo.getConversationByClientId(
      input.clientConversationId
    );
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const messages = await repo.listMessages(input.clientConversationId);
    const message =
      messages.find(item => item.client_message_id === input.clientMessageId) ??
      null;
    if (!message?.server_message_id) {
      throw new Error("Only delivered messages can be updated.");
    }

    const previousMessage = { ...message };
    const nextFavorite =
      input.nextFavorite === "toggle"
        ? Number(message.is_favorited || 0) > 0
          ? 0
          : 1
        : input.nextFavorite;
    const nextPin =
      input.nextPin === "toggle"
        ? Number(message.is_pinned || 0) > 0
          ? 0
          : 1
        : input.nextPin;

    const resolvedFavorite = (
      nextFavorite === undefined ? message.is_favorited : nextFavorite
    ) as 0 | 1;
    const resolvedPin = (
      nextPin === undefined ? message.is_pinned : nextPin
    ) as 0 | 1;

    // 先更新 mobile_message_states 表，确保 upsertMessages 内部
    // 持久化时读到的是最新状态而非 stale 旧值。
    await repo.applyMessageStates([
      {
        message_id: message.server_message_id,
        conversation_id: conversation.server_conversation_id,
        is_favorited: resolvedFavorite,
        is_pinned: resolvedPin,
        updated_at: new Date().toISOString()
      }
    ]);

    await repo.upsertMessages([
      {
        ...message,
        is_favorited: resolvedFavorite,
        is_pinned: resolvedPin
      }
    ]);
    await this.ctx.publishSnapshot();

    try {
      const result = await this.ctx.api.updateMessageState({
        messageId: message.server_message_id,
        conversationId: conversation.server_conversation_id,
        ...(nextFavorite === undefined ? {} : { is_favorited: nextFavorite }),
        ...(nextPin === undefined ? {} : { is_pinned: nextPin })
      });
      await repo.applyMessageStates([
        {
          message_id: result.data.message_id,
          conversation_id: result.data.conversation_id,
          is_favorited: result.data.is_favorited,
          is_pinned: result.data.is_pinned,
          updated_at: result.data.updated_at
        }
      ]);
      await repo.upsertMessages([
        {
          ...message,
          is_favorited: result.data.is_favorited,
          is_pinned: result.data.is_pinned,
          updated_at: result.data.updated_at
        }
      ]);
      return this.ctx.publishSnapshot();
    } catch (error) {
      await repo.applyMessageStates([
        {
          message_id: message.server_message_id,
          conversation_id: conversation.server_conversation_id,
          is_favorited: (previousMessage.is_favorited ?? 0) as 0 | 1,
          is_pinned: (previousMessage.is_pinned ?? 0) as 0 | 1,
          updated_at: previousMessage.updated_at ?? new Date().toISOString()
        }
      ]);
      await repo.upsertMessages([previousMessage]);
      await this.ctx.publishSnapshot();
      throw error;
    }
  }
}
