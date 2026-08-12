import { mapRemoteMessage } from "../../mappers";
import type { ControllerContext } from "../context";
import { DEFAULT_VISIBLE_MESSAGE_PAGE_SIZE } from "../internal-helpers";

/**
 * MessageWindowService 负责"窗口/分页"语义的消息加载：
 *   - loadOlderMessages：向上翻页
 *   - loadMessagesAround：跳转定位
 *   - ensureMessageVisible：保证某消息出现在可视窗口
 *   - shrinkVisibleWindow：收缩窗口
 */
export class MessageWindowService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async loadOlderMessages(clientConversationId: string, pageSize = 50) {
    const repo = this.ctx.getRepository();
    const conversation =
      await repo.getConversationByClientId(clientConversationId);
    if (!conversation) {
      return this.ctx.publishSnapshot();
    }

    const normalizedPageSize = Math.min(Math.max(pageSize, 1), 200);
    const currentLimit =
      this.ctx.visibleMessageLimits.get(clientConversationId) ??
      DEFAULT_VISIBLE_MESSAGE_PAGE_SIZE;
    const localMessages = await repo.listMessages(clientConversationId);
    const visibleMessages = localMessages.slice(-currentLimit);
    const hasLocalOlder = localMessages.length > visibleMessages.length;

    if (hasLocalOlder) {
      this.ctx.visibleMessageLimits.set(
        clientConversationId,
        currentLimit + normalizedPageSize
      );
      return this.ctx.publishSnapshot();
    }

    const oldestVisibleSequence = Number(visibleMessages[0]?.sequence || 0);
    const hiddenFloor = Number(conversation.local_hidden_before_seq || 0);
    const canFetchOlder =
      oldestVisibleSequence > hiddenFloor + 1 &&
      Number(conversation.history_complete || 0) === 0;

    if (canFetchOlder) {
      const { data } = await this.ctx.api.listMessages({
        conversationId: conversation.server_conversation_id,
        clientConversationId: conversation.client_conversation_id,
        beforeSequence: oldestVisibleSequence,
        limit: normalizedPageSize
      });
      await repo.upsertMessages(
        data.messages.map(item =>
          mapRemoteMessage(item, conversation.client_conversation_id)
        )
      );
      const collected: Array<{
        message_id: string;
        conversation_id: string;
        user_id: number;
        emoji: string;
        updated_at: string;
      }> = [];
      for (const m of data.messages) {
        if (!m.reactions) continue;
        for (const r of m.reactions) {
          collected.push({
            message_id: String(m.id),
            conversation_id: String(m.conversation_id),
            user_id: Number(r.user_id),
            emoji: r.emoji,
            updated_at: r.updated_at
          });
        }
      }
      if (collected.length > 0) {
        await repo.applyMessageReactions(collected);
      }
      if (!data.has_more) {
        const latestConversation =
          await repo.getConversationByClientId(clientConversationId);
        if (latestConversation) {
          await repo.upsertConversations([
            {
              ...latestConversation,
              history_complete: 1
            }
          ]);
        }
      }
    }

    this.ctx.visibleMessageLimits.set(
      clientConversationId,
      currentLimit + normalizedPageSize
    );
    return this.ctx.publishSnapshot();
  }

  async loadMessagesAround(
    clientConversationId: string,
    pivotSequence: number,
    pageSize = 50
  ) {
    const repo = this.ctx.getRepository();
    const conversation =
      await repo.getConversationByClientId(clientConversationId);
    if (!conversation) {
      return this.ctx.publishSnapshot();
    }
    const normalizedPageSize = Math.min(Math.max(pageSize, 2), 200);
    const { data } = await this.ctx.api.listMessagesAround({
      conversationId: conversation.server_conversation_id,
      clientConversationId: conversation.client_conversation_id,
      pivotSequence: Math.max(0, Math.floor(pivotSequence)),
      limit: normalizedPageSize
    });
    await repo.upsertMessages(
      data.messages.map(item =>
        mapRemoteMessage(item, conversation.client_conversation_id)
      )
    );
    const collected: Array<{
      message_id: string;
      conversation_id: string;
      user_id: number;
      emoji: string;
      updated_at: string;
    }> = [];
    for (const m of data.messages) {
      if (!m.reactions) continue;
      for (const r of m.reactions) {
        collected.push({
          message_id: String(m.id),
          conversation_id: String(m.conversation_id),
          user_id: Number(r.user_id),
          emoji: r.emoji,
          updated_at: r.updated_at
        });
      }
    }
    if (collected.length > 0) {
      await repo.applyMessageReactions(collected);
    }
    return this.ctx.publishSnapshot();
  }

  async ensureMessageVisible(
    clientConversationId: string,
    clientMessageId: string,
    options: {
      pivotSequence?: number;
      pageSize?: number;
      maxHistoryFetchRounds?: number;
    } = {}
  ): Promise<boolean> {
    const pageSize = options.pageSize ?? DEFAULT_VISIBLE_MESSAGE_PAGE_SIZE;
    const maxRounds = options.maxHistoryFetchRounds ?? Number.POSITIVE_INFINITY;
    const repo = this.ctx.getRepository();

    const isVisible = async (): Promise<boolean> => {
      const all = await repo.listMessages(clientConversationId);
      const idx = all.findIndex(m => m.client_message_id === clientMessageId);
      if (idx < 0) return false;
      const required = all.length - idx;
      const current =
        this.ctx.visibleMessageLimits.get(clientConversationId) ??
        DEFAULT_VISIBLE_MESSAGE_PAGE_SIZE;
      if (required > current) {
        const next = Math.ceil(required / pageSize) * pageSize;
        this.ctx.visibleMessageLimits.set(clientConversationId, next);
        await this.ctx.publishSnapshot();
      }
      return true;
    };

    if (await isVisible()) return true;

    if (options.pivotSequence && options.pivotSequence > 0) {
      await this.loadMessagesAround(
        clientConversationId,
        options.pivotSequence,
        pageSize
      );
      if (await isVisible()) return true;
    }

    let rounds = 0;
    while (rounds < maxRounds) {
      const conversation =
        await repo.getConversationByClientId(clientConversationId);
      if (!conversation) return false;
      if (Number(conversation.history_complete || 0) === 1) {
        return isVisible();
      }
      await this.loadOlderMessages(clientConversationId, pageSize);
      rounds += 1;
      if (await isVisible()) return true;
    }
    return false;
  }

  async shrinkVisibleWindow(
    clientConversationId: string,
    limit = DEFAULT_VISIBLE_MESSAGE_PAGE_SIZE
  ) {
    const normalized = Math.max(1, Math.floor(limit));
    this.ctx.visibleMessageLimits.set(clientConversationId, normalized);
    return this.ctx.publishSnapshot();
  }
}
