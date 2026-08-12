import type { ChatMessage, Message, MessageMention } from "@mushroom/shared";
import type { MobileAttachmentPayload } from "../../types";
import type { ControllerContext } from "../context";
import type {
  LocalAttachmentSource,
  LocalAttachmentSlot
} from "../../storage/local-attachment-store";
import {
  buildForwardedContent,
  buildReplyReference,
  createClientMessageId
} from "../internal-helpers";

/**
 * MessageSendService 持有所有"写一条新消息（含乐观更新）"的入口。
 * - createOptimisticMessage（私）
 * - 文本 / 附件 / pending attachment / 上传补丁 / 上传失败 / 重试 / 语音
 * - 转发 / 合并转发
 */
export class MessageSendService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async createOptimisticTextMessage(input: {
    clientConversationId: string;
    text: string;
    mentions?: MessageMention[];
    mentionAll?: boolean;
    replyToClientMessageId?: string | null;
  }) {
    return this.createOptimisticMessage({
      clientConversationId: input.clientConversationId,
      type: 1,
      content: {
        type: 1,
        text: input.text.trim(),
        mentions: input.mentions ?? [],
        mention_all: input.mentionAll === true
      },
      replyToClientMessageId: input.replyToClientMessageId ?? null
    });
  }

  async createOptimisticAttachmentMessage(input: {
    clientConversationId: string;
    attachment: MobileAttachmentPayload;
    replyToClientMessageId?: string | null;
  }) {
    const { attachment } = input;
    return this.createOptimisticMessage({
      clientConversationId: input.clientConversationId,
      type: 2,
      content: {
        type: 2,
        upload_id: attachment.uploadId,
        name: attachment.name,
        url: attachment.url,
        size: attachment.size,
        mime_type: attachment.mimeType,
        ...(attachment.width != null ? { width: attachment.width } : {}),
        ...(attachment.height != null ? { height: attachment.height } : {}),
        ...(attachment.durationMs != null
          ? { duration_ms: attachment.durationMs }
          : {}),
        ...(attachment.thumbStatus
          ? { thumb_status: attachment.thumbStatus }
          : {}),
        ...(attachment.thumbnailUploadId
          ? { thumbnail_upload_id: attachment.thumbnailUploadId }
          : {}),
        ...(attachment.originalSize != null && attachment.originalSize > 0
          ? { original_size: attachment.originalSize }
          : {})
      },
      replyToClientMessageId: input.replyToClientMessageId ?? null
    });
  }

  /**
   * 移动端附件两阶段发送 — 第一阶段。详见原 controller 注释。
   */
  async createOptimisticPendingAttachmentMessage(input: {
    clientConversationId: string;
    /** 调用方可显式指定，便于与已 persist 的 outbox 目录共享同一 id。 */
    clientMessageId?: string;
    asset: {
      name: string;
      size: number;
      mimeType?: string;
      width?: number;
      height?: number;
      durationMs?: number;
      localPreviewUri: string;
      thumbnailLocalUri?: string;
      kind?: "voice_message";
      durationSeconds?: number;
      waveform?: number[];
      /**
       * 自有存储 ref —— 调用方应在调用本方法**之前**先调
       * `persistLocalAttachment()` 把原文件 / 缩略图落盘到 outbox，
       * 把返回的 sourceRef / previewRef 透传到这里。空字符串表示
       * 未持久化（兼容尚未接入 outbox 的端），UI 仍走 in-memory
       * `local_preview_uri` 兜底。
       */
      localSourceRef?: string;
      localPreviewRef?: string;
      localPreviewKind?: "image" | "video" | "voice" | "file";
      originalFileName?: string;
      originalFileSize?: number;
    };
    replyToClientMessageId?: string | null;
  }) {
    const { asset } = input;
    return this.createOptimisticMessage({
      clientConversationId: input.clientConversationId,
      clientMessageId: input.clientMessageId,
      type: 2,
      content: {
        type: 2,
        ...(asset.kind ? { kind: asset.kind } : {}),
        upload_id: "",
        name: asset.name,
        url: "",
        size: asset.size,
        mime_type: asset.mimeType ?? "",
        upload_pending: true,
        upload_progress: 0,
        local_preview_uri: asset.localPreviewUri,
        ...(asset.thumbnailLocalUri
          ? { local_thumbnail_uri: asset.thumbnailLocalUri }
          : {}),
        ...(asset.localSourceRef
          ? { local_source_ref: asset.localSourceRef }
          : {}),
        ...(asset.localPreviewRef
          ? { local_preview_ref: asset.localPreviewRef }
          : {}),
        ...(asset.localPreviewKind
          ? { local_preview_kind: asset.localPreviewKind }
          : {}),
        ...(asset.originalFileName
          ? { original_file_name: asset.originalFileName }
          : {}),
        ...(typeof asset.originalFileSize === "number"
          ? { original_file_size: asset.originalFileSize }
          : {}),
        ...(asset.width != null ? { width: asset.width } : {}),
        ...(asset.height != null ? { height: asset.height } : {}),
        ...(asset.durationMs != null ? { duration_ms: asset.durationMs } : {}),
        ...(asset.kind === "voice_message" && asset.durationSeconds != null
          ? {
              duration_seconds: Math.max(
                1,
                Math.floor(Number(asset.durationSeconds))
              )
            }
          : {}),
        ...(asset.kind === "voice_message" && asset.waveform
          ? {
              waveform: asset.waveform.filter(value => Number.isFinite(value))
            }
          : {})
      },
      replyToClientMessageId: input.replyToClientMessageId ?? null
    });
  }

  async patchAttachmentUploaded(input: {
    clientConversationId: string;
    clientMessageId: string;
    attachment: MobileAttachmentPayload;
    durationSeconds?: number;
    waveform?: number[];
  }) {
    const repo = this.ctx.getRepository();
    const messages = await repo.listMessages(input.clientConversationId);
    const target = messages.find(
      message => message.client_message_id === input.clientMessageId
    );
    if (!target) {
      throw new Error("Pending attachment message not found.");
    }
    const previousContent =
      typeof target.content === "object" && target.content !== null
        ? (target.content as Record<string, unknown>)
        : {};
    const cleaned = { ...previousContent };
    delete cleaned.upload_pending;
    delete cleaned.upload_progress;
    delete cleaned.upload_error;

    const { attachment } = input;
    const finalContent: Record<string, unknown> = {
      ...cleaned,
      type: 2,
      upload_id: attachment.uploadId,
      name: attachment.name,
      url: attachment.url,
      size: attachment.size,
      mime_type: attachment.mimeType,
      ...(attachment.width != null ? { width: attachment.width } : {}),
      ...(attachment.height != null ? { height: attachment.height } : {}),
      ...(attachment.durationMs != null
        ? { duration_ms: attachment.durationMs }
        : {}),
      ...(attachment.thumbStatus
        ? { thumb_status: attachment.thumbStatus }
        : {}),
      ...(attachment.thumbnailUploadId
        ? { thumbnail_upload_id: attachment.thumbnailUploadId }
        : {}),
      ...(attachment.originalSize != null && attachment.originalSize > 0
        ? { original_size: attachment.originalSize }
        : {}),
      ...(input.durationSeconds != null
        ? {
            duration_seconds: Math.max(
              1,
              Math.floor(Number(input.durationSeconds))
            )
          }
        : {}),
      ...(input.waveform
        ? { waveform: input.waveform.filter(value => Number.isFinite(value)) }
        : {})
    };

    const patched: ChatMessage = {
      ...(target as ChatMessage),
      messageClassify: "chat",
      content: finalContent as ChatMessage["content"],
      status: 1,
      last_error: null
    };

    await repo.upsertMessages([patched]);
    const conversation = await repo.getConversationByClientId(
      input.clientConversationId
    );
    if (conversation) {
      await repo.upsertConversations([
        {
          ...conversation,
          last_message_content: patched.content,
          last_message_time: patched.created_at,
          last_message_send_id: patched.sender_id
        }
      ]);
    }
    await this.ctx.publishSnapshot();
    return patched;
  }

  async markAttachmentUploadFailed(input: {
    clientConversationId: string;
    clientMessageId: string;
    errorMessage: string;
  }) {
    const repo = this.ctx.getRepository();
    const messages = await repo.listMessages(input.clientConversationId);
    const target = messages.find(
      message => message.client_message_id === input.clientMessageId
    );
    if (!target) {
      return this.ctx.publishSnapshot();
    }
    const previousContent =
      typeof target.content === "object" && target.content !== null
        ? (target.content as Record<string, unknown>)
        : {};
    const nextContent = {
      ...previousContent,
      upload_pending: false,
      upload_error: input.errorMessage
    };
    delete (nextContent as { upload_progress?: number }).upload_progress;

    await repo.upsertMessages([
      {
        ...target,
        status: -1,
        content: nextContent as ChatMessage["content"],
        last_error: input.errorMessage
      }
    ]);
    return this.ctx.publishSnapshot();
  }

  async markAttachmentUploadRetrying(input: {
    clientConversationId: string;
    clientMessageId: string;
  }) {
    const repo = this.ctx.getRepository();
    const messages = await repo.listMessages(input.clientConversationId);
    const target = messages.find(
      message => message.client_message_id === input.clientMessageId
    );
    if (!target) {
      return this.ctx.publishSnapshot();
    }
    const previousContent =
      typeof target.content === "object" && target.content !== null
        ? (target.content as Record<string, unknown>)
        : {};
    const nextContent = {
      ...previousContent,
      upload_pending: true,
      upload_progress: 0
    };
    delete (nextContent as { upload_error?: string }).upload_error;

    await repo.upsertMessages([
      {
        ...target,
        status: 1,
        content: nextContent as ChatMessage["content"],
        last_error: null
      }
    ]);
    return this.ctx.publishSnapshot();
  }

  /**
   * 标记附件本地源已丢失（in-memory map 与 outbox 双双失效）。气泡据此
   * 引导用户"重新选择文件"，对齐 WhatsApp 等主流 IM 的兜底语义。状态归位
   * 为 -1（失败），content 写入 `local_source_missing: true`。
   */
  async markAttachmentLocalSourceMissing(input: {
    clientConversationId: string;
    clientMessageId: string;
  }) {
    const repo = this.ctx.getRepository();
    const messages = await repo.listMessages(input.clientConversationId);
    const target = messages.find(
      message => message.client_message_id === input.clientMessageId
    );
    if (!target) {
      return this.ctx.publishSnapshot();
    }
    const previousContent =
      typeof target.content === "object" && target.content !== null
        ? (target.content as Record<string, unknown>)
        : {};
    // 同步清掉 upload_* 字段：避免气泡仍显示"上传中…"进度条卡死，
    // 也避免后续 resendOutgoingMessages 看到 upload_pending=true 跳过。
    const nextContent = { ...previousContent } as Record<string, unknown>;
    delete nextContent.upload_pending;
    delete nextContent.upload_progress;
    delete nextContent.upload_error;
    nextContent.local_source_missing = true;
    await repo.upsertMessages([
      {
        ...target,
        status: -1,
        content: nextContent as ChatMessage["content"]
      }
    ]);
    return this.ctx.publishSnapshot();
  }

  async createOptimisticVoiceMessage(input: {
    clientConversationId: string;
    attachment: MobileAttachmentPayload & {
      durationSeconds: number;
      waveform?: number[];
    };
    replyToClientMessageId?: string | null;
  }) {
    return this.createOptimisticMessage({
      clientConversationId: input.clientConversationId,
      type: 2,
      content: {
        type: 2,
        kind: "voice_message",
        upload_id: input.attachment.uploadId,
        name: input.attachment.name,
        url: input.attachment.url,
        size: input.attachment.size,
        mime_type: input.attachment.mimeType || "audio/m4a",
        duration_seconds: Math.max(
          1,
          Math.floor(Number(input.attachment.durationSeconds || 0))
        ),
        waveform:
          input.attachment.waveform?.filter(value => Number.isFinite(value)) ??
          []
      },
      replyToClientMessageId: input.replyToClientMessageId ?? null
    });
  }

  async createOptimisticForwardMessage(input: {
    sourceClientConversationId: string;
    sourceClientMessageId: string;
    targetClientConversationId: string;
  }) {
    const repo = this.ctx.getRepository();
    const [sourceConversation, targetConversation] = await Promise.all([
      repo.getConversationByClientId(input.sourceClientConversationId),
      repo.getConversationByClientId(input.targetClientConversationId)
    ]);

    if (!sourceConversation || !targetConversation) {
      throw new Error("Conversation not found.");
    }

    const sourceMessages = await repo.listMessages(
      input.sourceClientConversationId
    );
    const sourceMessage =
      sourceMessages.find(
        item => item.client_message_id === input.sourceClientMessageId
      ) ?? null;
    if (!sourceMessage) {
      throw new Error("Message not found.");
    }
    if (Number(sourceMessage.is_recalled || 0) > 0) {
      throw new Error("Recalled messages cannot be forwarded.");
    }

    const forwardedContent = buildForwardedContent(
      sourceMessage,
      sourceConversation.display_name || sourceConversation.name
    );

    return this.createOptimisticMessage({
      clientConversationId: targetConversation.client_conversation_id,
      type: sourceMessage.type,
      content: forwardedContent
    });
  }

  async createOptimisticMergedForwardMessage(input: {
    targetClientConversationId: string;
    content: Record<string, unknown>;
  }) {
    return this.createOptimisticMessage({
      clientConversationId: input.targetClientConversationId,
      type: 1,
      content: input.content
    });
  }

  async createOptimisticMessage(input: {
    clientConversationId: string;
    type: number;
    content: Record<string, unknown>;
    replyToClientMessageId?: string | null;
    forwardFrom?: Message["forward_from"] | null;
    /**
     * 调用方可显式指定 client_message_id，便于"先持久化 outbox 文件、再插入
     * 乐观消息"的流程使用同一个 id 串联 outbox 目录与 message 记录。
     * 省略则生成新的随机 id（保持历史行为）。
     */
    clientMessageId?: string;
  }) {
    const repo = this.ctx.getRepository();
    const conversation = await repo.getConversationByClientId(
      input.clientConversationId
    );
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const auth = await this.ctx.getAuthStore().read();
    if (!auth.user) {
      throw new Error("Please log in again.");
    }

    if (
      input.type === 1 &&
      typeof input.content.text === "string" &&
      !String(input.content.text).trim()
    ) {
      throw new Error("Message text cannot be empty.");
    }

    // Only perform the full-table scan when the message is a reply so we can
    // locate the referenced message.  Skipping this when there is no reply
    // avoids a wasteful SQLite query on every send.
    let replyToMessage: Message | null = null;
    if (input.replyToClientMessageId) {
      const messages = await repo.listMessages(input.clientConversationId);
      replyToMessage =
        messages.find(
          item => item.client_message_id === input.replyToClientMessageId
        ) ?? null;
    }

    const optimisticMessage: ChatMessage = {
      messageClassify: "chat",
      client_message_id: input.clientMessageId || createClientMessageId(),
      server_message_id: "",
      client_conversation_id: conversation.client_conversation_id,
      server_conversation_id: conversation.server_conversation_id,
      type: input.type,
      status: 1,
      retry_count: 0,
      next_retry_at: null,
      last_error: null,
      sequence: 0,
      content: input.content,
      sender_id: auth.user.userId,
      sender_nickname: auth.user.nickname,
      sender_avatar: auth.profile?.avatar_url ?? auth.user.avatar,
      created_at: new Date().toISOString(),
      is_recalled: 0,
      is_favorited: 0,
      is_pinned: 0,
      reply_to_message_id: replyToMessage?.server_message_id ?? null,
      reply_to: replyToMessage ? buildReplyReference(replyToMessage) : null,
      forward_from: input.forwardFrom ?? null
    };

    await repo.upsertMessages([optimisticMessage]);
    await repo.upsertConversations([
      {
        ...conversation,
        draft: "",
        is_archived: 0,
        unread_count: 0,
        mention_unread_count: 0,
        manual_unread_count: 0,
        last_message_content: optimisticMessage.content,
        last_message_time: optimisticMessage.created_at,
        last_message_send_id: optimisticMessage.sender_id
      }
    ]);

    await this.ctx.publishSnapshot();
    return optimisticMessage;
  }

  /**
   * 把待发送附件的原文件 / 缩略图持久化到自有存储（"outbox"）。
   *
   * 调用方（mobile / web / electron 渲染进程）在弹出 picker、生成缩略图
   * 之后、`createOptimisticPendingAttachmentMessage` 之前调用本方法。返回
   * 的 refs 由调用方写入 message content 的 `local_source_ref` /
   * `local_preview_ref` 字段，让后续重启 / 失败重试 / UI 兜底都能离线工作。
   *
   * 任何一项写入失败都不会抛错（best-effort）：失败时返回空字符串，调用方
   * 据此决定是否回退到旧的内存路径（与历史行为一致，不影响功能）。
   */
  async persistLocalAttachment(input: {
    clientMessageId: string;
    source?: LocalAttachmentSource;
    preview?: LocalAttachmentSource;
    sourceExtension?: string;
    previewExtension?: string;
  }): Promise<{ sourceRef: string; previewRef: string }> {
    const result = { sourceRef: "", previewRef: "" };
    const slots: Array<{
      key: "sourceRef" | "previewRef";
      slot: LocalAttachmentSlot;
      source?: LocalAttachmentSource;
      extension?: string;
    }> = [
      {
        key: "sourceRef",
        slot: "source",
        source: input.source,
        extension: input.sourceExtension
      },
      {
        key: "previewRef",
        slot: "preview",
        source: input.preview,
        extension: input.previewExtension
      }
    ];

    await Promise.all(
      slots.map(async slot => {
        if (!slot.source) return;
        try {
          const ref = await this.ctx.attachmentStore.put({
            clientMessageId: input.clientMessageId,
            slot: slot.slot,
            source: slot.source,
            extension: slot.extension
          });
          result[slot.key] = ref;
        } catch {
          // best-effort：写失败保持空 ref，调用方走旧 in-memory 路径。
        }
      })
    );

    return result;
  }

  /**
   * 异步释放原文件（"source"）。在收到 ACK 成功后调用，缩略图
   * （"preview"）保留以供后续滚动 / 转发预览。
   */
  async releaseLocalAttachmentSource(ref?: string | null): Promise<void> {
    if (!ref) return;
    try {
      await this.ctx.attachmentStore.delete(ref);
    } catch {
      // ignore
    }
  }

  /**
   * 删除一条"失败的本地附件草稿"。仅对纯本地未上链的失败消息生效，
   * 同时清理 outbox 中两个 ref（source / preview）以释放 IndexedDB
   * 配额。对齐 WhatsApp 等主流 IM"右键删除失败消息"语义。
   *
   * 守卫严格：`status === -1 && !server_message_id && type === 2`；
   * 不满足直接 no-op 返回，避免误删已上链消息。
   *
   * 返回值包含已尝试清理的 ref 列表，便于调用方按需做后续清理
   * （如平台层 outgoing 表）。仓库实现的 `deleteLocalMessages` 若缺
   * 失也按 no-op 处理（仍会清 ref），保证老仓库不阻塞调用。
   */
  async deleteFailedLocalAttachmentMessage(input: {
    clientConversationId: string;
    clientMessageId: string;
  }): Promise<{ deleted: boolean; refs: string[] }> {
    const repo = this.ctx.getRepository();
    const messages = await repo.listMessages(input.clientConversationId);
    const target = messages.find(
      message => message.client_message_id === input.clientMessageId
    );
    if (!target) {
      return { deleted: false, refs: [] };
    }
    if (target.status !== -1 || target.server_message_id || target.type !== 2) {
      // 不应被删除（防御性兜底）。调用方应在 UI 层先过滤；这里再守一遍。
      return { deleted: false, refs: [] };
    }
    const content =
      typeof target.content === "object" && target.content !== null
        ? (target.content as {
            local_source_ref?: string;
            local_preview_ref?: string;
          })
        : {};
    const refs: string[] = [];
    if (content.local_source_ref) refs.push(content.local_source_ref);
    if (content.local_preview_ref) refs.push(content.local_preview_ref);

    // 1. best-effort 清理 outbox refs（preview / source）。
    await Promise.all(
      refs.map(async ref => {
        try {
          await this.ctx.attachmentStore.delete(ref);
        } catch {
          // ignore：sweep 会兜底。
        }
      })
    );

    // 2. 删 DB 行。仓库实现缺失时按 no-op（不抛错）。
    if (typeof repo.deleteLocalMessages === "function") {
      try {
        await repo.deleteLocalMessages(input.clientConversationId, [
          input.clientMessageId
        ]);
      } catch {
        // ignore：调用方仍能在 UI 层感知到失败（snapshot 仍会发布）。
      }
    }

    await this.ctx.publishSnapshot();
    return { deleted: true, refs };
  }
}
