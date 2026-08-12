import type { Conversation, Message } from "@mushroom/shared";
import { refreshGroupReadState } from "@mushroom/shared";
import type { ControllerContext } from "../context";
import { DEFAULT_READ_DEBOUNCE_MS } from "../internal-helpers";

/**
 * ReadReceiptService 负责：
 *   - scheduleConversationRead：去抖 + 延迟 flush 到服务端
 *   - markConversationRead：立即 flush
 *   - flushConversationRead：调用 markConversationRead API + 写入仓库
 *   - computeConversationReadSequence
 *   - refreshConversationReadState：群已读补齐
 */
export class ReadReceiptService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async scheduleConversationRead(
    clientConversationId: string,
    options?: {
      delayMs?: number;
      notify?: boolean;
    }
  ) {
    const repo = this.ctx.getRepository();
    const conversation =
      await repo.getConversationByClientId(clientConversationId);
    if (!conversation) {
      return options?.notify === false
        ? this.ctx.snapshot()
        : this.ctx.publishSnapshot();
    }

    const messages = await repo.listMessages(clientConversationId);
    const readSequence = this.computeConversationReadSequence(
      conversation,
      messages
    );

    if (
      readSequence <= Number(conversation.last_read_sequence || 0) &&
      Number(conversation.unread_count || 0) <= 0
    ) {
      return options?.notify === false
        ? this.ctx.snapshot()
        : this.ctx.publishSnapshot();
    }

    await repo.upsertConversations([
      {
        ...conversation,
        unread_count: 0,
        mention_unread_count: 0,
        manual_unread_count: 0,
        last_read_sequence: Math.max(
          Number(conversation.last_read_sequence || 0),
          readSequence
        )
      }
    ]);

    const existingTimer = this.ctx.pendingReadTimers.get(clientConversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.ctx.pendingReadTimers.delete(clientConversationId);
      void this.flushConversationRead(clientConversationId, readSequence).catch(
        () => {
          // The next sync or realtime event will reconcile read state.
        }
      );
    }, options?.delayMs ?? DEFAULT_READ_DEBOUNCE_MS);
    this.ctx.pendingReadTimers.set(clientConversationId, timer);

    return options?.notify === false
      ? this.ctx.snapshot()
      : this.ctx.publishSnapshot();
  }

  async markConversationRead(clientConversationId: string, notify = true) {
    const existingTimer = this.ctx.pendingReadTimers.get(clientConversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.ctx.pendingReadTimers.delete(clientConversationId);
    }

    const repo = this.ctx.getRepository();
    const conversation =
      await repo.getConversationByClientId(clientConversationId);
    if (!conversation) {
      return notify ? this.ctx.publishSnapshot() : this.ctx.snapshot();
    }

    const messages = await repo.listMessages(clientConversationId);
    const readSequence = this.computeConversationReadSequence(
      conversation,
      messages
    );

    if (
      readSequence <= Number(conversation.last_read_sequence || 0) &&
      Number(conversation.unread_count || 0) <= 0
    ) {
      return notify ? this.ctx.publishSnapshot() : this.ctx.snapshot();
    }

    return this.flushConversationRead(
      clientConversationId,
      readSequence,
      notify
    );
  }

  async flushConversationRead(
    clientConversationId: string,
    readSequence: number,
    notify = false
  ) {
    const repo = this.ctx.getRepository();
    const conversation =
      await repo.getConversationByClientId(clientConversationId);
    if (!conversation) {
      return notify ? this.ctx.publishSnapshot() : this.ctx.snapshot();
    }

    const result = await this.ctx.api.markConversationRead({
      conversationId: conversation.server_conversation_id,
      readSequence
    });

    await repo.upsertConversations([
      {
        ...conversation,
        unread_count: result.data.unread_count,
        mention_unread_count: 0,
        manual_unread_count: 0,
        last_read_sequence: Math.max(
          Number(conversation.last_read_sequence || 0),
          Number(result.data.read_seq || 0)
        )
      }
    ]);

    return notify ? this.ctx.publishSnapshot() : this.ctx.snapshot();
  }

  computeConversationReadSequence(
    conversation: Conversation,
    messages: Message[]
  ) {
    return messages.reduce(
      (maxValue, message) => Math.max(maxValue, Number(message.sequence || 0)),
      Number(conversation.last_read_sequence || 0)
    );
  }

  async refreshConversationReadState(
    serverConversationIdInput: string | number | null | undefined
  ): Promise<void> {
    const repo = this.ctx.getRepository();
    const upsert = repo.upsertGroupReadStates?.bind(repo);
    if (!upsert) return;
    const serverConversationId = String(serverConversationIdInput ?? "").trim();
    if (!serverConversationId) return;
    const conversation =
      await repo.getConversationByServerId(serverConversationId);
    if (!conversation || conversation.type !== 2) {
      return;
    }
    let didApply = false;
    await refreshGroupReadState({
      serverConversationId,
      fetchReadState: id => this.ctx.api.getConversationReadState(id),
      applyEntries: async (id, entries) => {
        await upsert(id, entries);
        didApply = true;
      },
      onError: err => {
        console.warn("[refreshConversationReadState] failed", {
          conversationId: serverConversationId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    });
    if (didApply) {
      await this.ctx.publishSnapshot();
    }
  }
}
