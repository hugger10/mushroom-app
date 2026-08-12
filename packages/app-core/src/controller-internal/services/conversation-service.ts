import type { Conversation } from "@mushroom/shared";
import {
  createClientConversationId,
  mapRemoteConversation
} from "../../mappers";
import type { ControllerContext } from "../context";
import { DEFAULT_VISIBLE_MESSAGE_PAGE_SIZE } from "../internal-helpers";

/**
 * ConversationService 负责会话级别操作（不含分页消息加载，那些归
 * MessageWindowService）。包含：
 *   - 查询：getConversationByPeerId / requireConversation
 *   - 创建：ensureDirectConversation
 *   - 激活：setActiveConversation
 *   - 草稿 / 状态：saveConversationDraft / updateConversationState
 *   - 未读 / 删除 / 退出 / 解散
 *   - clearConversationMessages
 */
export class ConversationService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async getConversationByPeerId(peerId: number) {
    const conversations = await this.ctx.getRepository().listConversations();
    return (
      conversations.find(
        item => item.type === 1 && Number(item.peer_id || 0) === Number(peerId)
      ) ?? null
    );
  }

  async ensureDirectConversation(peerId: number) {
    const existing = await this.getConversationByPeerId(peerId);
    if (existing) {
      return existing;
    }

    const result = await this.ctx.api.createDirectConversation({
      target_user_id: peerId
    });

    const fromServerId = await this.ctx
      .getRepository()
      .getConversationByServerId(result.data.id);
    if (fromServerId) {
      return fromServerId;
    }

    const created = mapRemoteConversation(
      result.data,
      createClientConversationId()
    );
    await this.ctx.getRepository().upsertConversations([created]);
    await this.ctx.publishSnapshot();

    // Backfill the rest opportunistically; don't block open-chat flow.
    void this.ctx.services.sync.syncNow().catch(() => undefined);

    const localConversation = await this.getConversationByPeerId(peerId);
    if (localConversation) {
      return localConversation;
    }

    return created;
  }

  async setActiveConversation(
    clientConversationId: string | null,
    syncRead = true
  ) {
    this.ctx.setActiveConversationId(clientConversationId);
    if (
      clientConversationId &&
      !this.ctx.visibleMessageLimits.has(clientConversationId)
    ) {
      this.ctx.visibleMessageLimits.set(
        clientConversationId,
        DEFAULT_VISIBLE_MESSAGE_PAGE_SIZE
      );
    }
    if (clientConversationId && syncRead) {
      await this.ctx.services.readReceipt.scheduleConversationRead(
        clientConversationId,
        { notify: false }
      );
    }

    // 群会话：打开时补齐其他成员的已读高水位（fire-and-forget）。
    if (clientConversationId) {
      const activeConv = await this.ctx
        .getRepository()
        .getConversationByClientId(clientConversationId);
      if (
        activeConv &&
        activeConv.type === 2 &&
        activeConv.server_conversation_id
      ) {
        void this.ctx.services.readReceipt.refreshConversationReadState(
          activeConv.server_conversation_id
        );
      }
    }

    return this.ctx.publishSnapshot();
  }

  async saveConversationDraft(clientConversationId: string, draft: string) {
    const conversation = await this.ctx
      .getRepository()
      .getConversationByClientId(clientConversationId);
    if (!conversation) {
      return this.ctx.publishSnapshot();
    }

    const normalizedDraft = draft.trim() ? draft : "";
    await this.ctx.getRepository().upsertConversations([
      {
        ...conversation,
        draft: normalizedDraft
      }
    ]);

    try {
      await this.ctx.api.updateConversationState({
        conversationId: conversation.server_conversation_id,
        draft: normalizedDraft
      });
    } catch {
      // Keep the local draft even when the remote state write fails.
    }

    return this.ctx.publishSnapshot();
  }

  async updateConversationState(input: {
    clientConversationId: string;
    is_pinned?: 0 | 1;
    is_muted?: 0 | 1;
    is_archived?: 0 | 1;
    draft?: string | null;
  }) {
    const conversation = await this.ctx
      .getRepository()
      .getConversationByClientId(input.clientConversationId);
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const previousConversation = { ...conversation };
    const nextConversation = {
      ...conversation,
      ...(input.is_pinned === undefined ? {} : { is_pinned: input.is_pinned }),
      ...(input.is_muted === undefined ? {} : { is_muted: input.is_muted }),
      ...(input.is_archived === undefined
        ? {}
        : { is_archived: input.is_archived }),
      ...(input.draft === undefined ? {} : { draft: input.draft ?? "" })
    };
    const wasActiveConversation =
      this.ctx.getActiveConversationId() === input.clientConversationId;

    await this.ctx.getRepository().upsertConversations([nextConversation]);
    if (wasActiveConversation && input.is_archived === 1) {
      this.ctx.setActiveConversationId(null);
    }
    await this.ctx.publishSnapshot();

    try {
      const result = await this.ctx.api.updateConversationState({
        conversationId: conversation.server_conversation_id,
        ...(input.is_pinned === undefined
          ? {}
          : { is_pinned: input.is_pinned }),
        ...(input.is_muted === undefined ? {} : { is_muted: input.is_muted }),
        ...(input.is_archived === undefined
          ? {}
          : { is_archived: input.is_archived }),
        ...(input.draft === undefined ? {} : { draft: input.draft ?? "" })
      });

      await this.ctx.getRepository().upsertConversations([
        {
          ...nextConversation,
          is_pinned: result.data.is_pinned,
          is_muted: result.data.is_muted,
          is_archived: result.data.is_archived,
          draft:
            input.draft === undefined
              ? nextConversation.draft
              : (input.draft ?? "")
        }
      ]);

      return this.ctx.publishSnapshot();
    } catch (error) {
      await this.ctx
        .getRepository()
        .upsertConversations([previousConversation]);
      if (wasActiveConversation) {
        this.ctx.setActiveConversationId(
          previousConversation.client_conversation_id
        );
      }
      await this.ctx.publishSnapshot();
      throw error;
    }
  }

  async markConversationUnread(clientConversationId: string) {
    const existingTimer = this.ctx.pendingReadTimers.get(clientConversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.ctx.pendingReadTimers.delete(clientConversationId);
    }

    const conversation = await this.ctx
      .getRepository()
      .getConversationByClientId(clientConversationId);
    if (!conversation) {
      return this.ctx.publishSnapshot();
    }

    const messages = await this.ctx
      .getRepository()
      .listMessages(clientConversationId);
    const latestSequence = Math.max(
      Number(conversation.last_server_sequence || 0),
      Number(conversation.last_read_sequence || 0),
      ...messages.map(message => Number(message.sequence || 0))
    );
    if (latestSequence <= 0 && !conversation.last_message_time) {
      return this.ctx.publishSnapshot();
    }

    await this.ctx.getRepository().upsertConversations([
      {
        ...conversation,
        unread_count: Math.max(
          1,
          Number(conversation.unread_count || 0),
          Number(conversation.manual_unread_count || 0)
        ),
        last_read_sequence: Math.max(0, latestSequence - 1),
        manual_unread_count: 1
      }
    ]);

    return this.ctx.publishSnapshot();
  }

  async deleteConversation(clientConversationId: string) {
    const existingTimer = this.ctx.pendingReadTimers.get(clientConversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.ctx.pendingReadTimers.delete(clientConversationId);
    }

    const conversation = await this.ctx
      .getRepository()
      .getConversationByClientId(clientConversationId);
    if (!conversation) {
      return this.ctx.publishSnapshot();
    }

    const wasActiveConversation =
      this.ctx.getActiveConversationId() === clientConversationId;

    // Server-first: only mutate local state after server recorded
    // hidden_before_seq.
    await this.ctx.api.deleteConversation({
      conversationId: conversation.server_conversation_id
    });

    try {
      await this.ctx
        .getRepository()
        .softDeleteConversation(clientConversationId);
    } catch (error) {
      console.error(
        "[deleteConversation] local soft-delete failed; will reconcile on next sync",
        { clientConversationId, error }
      );
      throw error;
    }

    if (wasActiveConversation) {
      this.ctx.setActiveConversationId(null);
    }
    return this.ctx.publishSnapshot();
  }

  async clearConversationMessages(clientConversationId: string) {
    await this.ctx
      .getRepository()
      .clearConversationMessages(clientConversationId);
    return this.ctx.publishSnapshot();
  }

  async leaveConversation(clientConversationId: string) {
    const conversation = await this.requireConversation(clientConversationId);
    await this.ctx.api.leaveConversation({
      conversationId: conversation.server_conversation_id
    });
    await this.ctx.services.sync.syncNow();
    return this.ctx.publishSnapshot();
  }

  async disbandConversation(clientConversationId: string) {
    const existingTimer = this.ctx.pendingReadTimers.get(clientConversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.ctx.pendingReadTimers.delete(clientConversationId);
    }

    const conversation = await this.requireConversation(clientConversationId);
    const wasActiveConversation =
      this.ctx.getActiveConversationId() === clientConversationId;

    await this.ctx.api.disbandConversation({
      conversationId: conversation.server_conversation_id
    });

    try {
      await this.ctx
        .getRepository()
        .softDeleteConversation(clientConversationId);
    } catch (error) {
      console.error("[disbandConversation] local soft-delete failed", {
        clientConversationId,
        error
      });
      throw error;
    }

    if (wasActiveConversation) {
      this.ctx.setActiveConversationId(null);
    }
    await this.ctx.services.sync.syncNow();
    return this.ctx.publishSnapshot();
  }

  async requireConversation(
    clientConversationId: string
  ): Promise<Conversation> {
    const conversation = await this.ctx
      .getRepository()
      .getConversationByClientId(clientConversationId);
    if (!conversation) {
      throw new Error("Conversation not found.");
    }
    return conversation;
  }
}
