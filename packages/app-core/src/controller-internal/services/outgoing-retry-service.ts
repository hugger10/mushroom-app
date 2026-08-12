import type {
  AckMessage,
  ChatMessage,
  MessageFileContent
} from "@mushroom/shared";
import {
  isRetryableOutgoingError,
  shouldRetryOutgoingMessage
} from "@mushroom/shared";
import type { ControllerContext } from "../context";
import {
  DEFAULT_OUTGOING_AUTO_RETRY_LIMIT,
  DEFAULT_OUTGOING_RETRY_BASE_MS,
  DEFAULT_OUTGOING_RETRY_CAP_MS
} from "../internal-helpers";

/**
 * OutgoingRetryService 处理出站消息的 ACK / 失败 / 重试调度。
 */
export class OutgoingRetryService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async confirmMessageAck(ack: AckMessage) {
    const repo = this.ctx.getRepository();
    const conversation =
      (await repo.getConversationByClientId(ack.client_conversation_id)) ??
      (await repo.getConversationByServerId(ack.server_conversation_id));
    if (!conversation) {
      return this.ctx.publishSnapshot();
    }

    const messages = await repo.listMessages(
      conversation.client_conversation_id
    );
    const optimisticMessage = messages.find(
      message => message.client_message_id === ack.client_message_id
    );
    if (!optimisticMessage) {
      return this.ctx.publishSnapshot();
    }

    await repo.upsertMessages([
      {
        ...optimisticMessage,
        server_message_id: ack.server_message_id,
        server_conversation_id: ack.server_conversation_id,
        client_conversation_id: ack.client_conversation_id,
        sequence: ack.sequence,
        status: ack.status,
        retry_count: 0,
        next_retry_at: null,
        last_error: null
      }
    ]);

    // ACK 成功 → 释放本地原文件以回收磁盘；缩略图保留供后续滚动 / 转发预览。
    // 任何失败都不影响主流程（attachmentStore 内部已 swallow）。
    const fileContent = this.readFileContent(optimisticMessage);
    if (fileContent?.local_source_ref) {
      try {
        await this.ctx.attachmentStore.delete(fileContent.local_source_ref);
      } catch {
        // ignore
      }
    }
    await repo.upsertConversations([
      {
        ...conversation,
        unread_count: 0,
        mention_unread_count: 0,
        manual_unread_count: 0,
        last_read_sequence: Math.max(
          Number(conversation.last_read_sequence || 0),
          ack.sequence
        ),
        last_server_sequence: Math.max(
          Number(conversation.last_server_sequence || 0),
          ack.sequence
        )
      }
    ]);

    return this.ctx.publishSnapshot();
  }

  async failMessageSend(options: {
    clientConversationId: string;
    clientMessageId: string;
    errorMessage: string;
  }) {
    const repo = this.ctx.getRepository();
    const messages = await repo.listMessages(options.clientConversationId);
    const failedMessage = messages.find(
      message => message.client_message_id === options.clientMessageId
    );
    if (!failedMessage) {
      return this.ctx.publishSnapshot();
    }

    const nextRetryCount = Number(failedMessage.retry_count ?? 0) + 1;
    await repo.upsertMessages([
      {
        ...failedMessage,
        status: -1,
        retry_count: nextRetryCount,
        next_retry_at: isRetryableOutgoingError(options.errorMessage)
          ? this.computeNextOutgoingRetryAt(nextRetryCount)
          : null,
        last_error: options.errorMessage
      }
    ]);

    return this.ctx.publishSnapshot();
  }

  async markOutgoingMessageSending(options: {
    clientConversationId: string;
    clientMessageId: string;
  }) {
    const repo = this.ctx.getRepository();
    const messages = await repo.listMessages(options.clientConversationId);
    const targetMessage = messages.find(
      message => message.client_message_id === options.clientMessageId
    );
    if (!targetMessage) {
      return this.ctx.publishSnapshot();
    }

    await repo.upsertMessages([
      {
        ...targetMessage,
        status: 1,
        next_retry_at: null,
        last_error: null,
        updated_at: new Date().toISOString()
      }
    ]);

    return this.ctx.publishSnapshot();
  }

  async listRetryableOutgoingMessages(options?: { limit?: number }) {
    const repo = this.ctx.getRepository();
    const auth = await this.ctx.getAuthStore().read();
    const currentUserId = Number(auth.user?.userId || 0);
    if (!currentUserId) {
      return [];
    }

    const conversations = await repo.listConversations();
    const candidates: ChatMessage[] = [];

    for (const conversation of conversations) {
      const messages = await repo.listMessages(
        conversation.client_conversation_id
      );
      for (const message of messages) {
        if (
          Number(message.sender_id) !== currentUserId ||
          !message.client_message_id ||
          !shouldRetryOutgoingMessage(message, Date.now(), {
            autoRetryLimit: DEFAULT_OUTGOING_AUTO_RETRY_LIMIT
          })
        ) {
          continue;
        }

        candidates.push(message as ChatMessage);
      }
    }

    return candidates
      .sort((left, right) =>
        String(left.created_at || "").localeCompare(
          String(right.created_at || "")
        )
      )
      .slice(0, options?.limit ?? 50);
  }

  computeNextOutgoingRetryAt(retryCount: number) {
    const normalizedRetryCount = Math.max(1, Number(retryCount || 1));
    const delayMs = Math.min(
      DEFAULT_OUTGOING_RETRY_CAP_MS,
      DEFAULT_OUTGOING_RETRY_BASE_MS * 2 ** (normalizedRetryCount - 1)
    );
    return new Date(Date.now() + delayMs).toISOString();
  }

  private readFileContent(message: {
    type?: number;
    content?: unknown;
  }): MessageFileContent | null {
    if (message.type !== 2) return null;
    const content = message.content;
    if (typeof content !== "object" || content === null) return null;
    const candidate = content as Partial<MessageFileContent> & {
      type?: number;
    };
    if (candidate.type !== 2) return null;
    return candidate as MessageFileContent;
  }
}
