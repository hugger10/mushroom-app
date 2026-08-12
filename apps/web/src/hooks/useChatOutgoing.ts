import { v4 as uuidv4 } from "uuid";
import log from "@/utils/log";
import i18next from "i18next";
import {
  bytesToMB,
  detectAttachmentCategory,
  getMessageSummaryText,
  isRetryableOutgoingError,
  normalizeMentionDraft,
  shouldRetryOutgoingMessage
} from "@mushroom/shared";
import { useCallback, type RefObject } from "react";
import type { MessageMention } from "@mushroom/shared";
import type { Conversation, Message } from "../types/chat";
import type { LoginUser } from "../types/user";
import type { WsUiState } from "../ws/WSClient";
import type { ChatMessage } from "../ws/types";
import { ensureLimits, uploadAttachment } from "../http/api";
import { getWSClient } from "../ws/index";
import { computeNextRetryAt } from "./useChatHelpers";
import { compressImageForUpload } from "../media/compressImage";
import { THUMBNAIL_IMAGE_COMPRESS } from "@mushroom/shared";
import { extractVideoThumbnail } from "../media/extractVideoThumbnail";
import {
  deletePendingUploadFile,
  getPendingUploadFile,
  setPendingUploadFile
} from "./pendingFileMap";
import {
  clearAttachmentProgress,
  setAttachmentProgress
} from "./attachmentProgressStore";
import { getOutboxClient } from "../services/outbox-store";

type UseChatOutgoingOptions = {
  loginUser: LoginUser | null;
  activeConversationRef: RefObject<Conversation | undefined>;
  wsUiStateRef: RefObject<WsUiState>;
  sendingOutgoingIdsRef: RefObject<Set<string>>;
  retryingOutgoingRef: RefObject<boolean>;
  autoRetryLimit: number;
  applyConversationUpdate: (
    clientConversationId: string,
    updater: (conversation: Conversation) => Conversation
  ) => void;
};

function inferLocalPreviewKindFromMime(
  mime: string | undefined
): "image" | "video" | "audio" | "file" {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

function inferExtensionFromFile(file: File): string | undefined {
  const idx = file.name.lastIndexOf(".");
  if (idx >= 0 && idx < file.name.length - 1) {
    return file.name.slice(idx + 1).toLowerCase();
  }
  const m = (file.type || "").toLowerCase();
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  if (m === "video/mp4") return "mp4";
  if (m === "audio/mpeg") return "mp3";
  return undefined;
}

export function useChatOutgoing({
  loginUser,
  activeConversationRef,
  wsUiStateRef,
  sendingOutgoingIdsRef,
  retryingOutgoingRef,
  autoRetryLimit,
  applyConversationUpdate
}: UseChatOutgoingOptions) {
  const sendExistingMessage = useCallback(
    async (
      draftMessage: Message & { server_conversation_id: string },
      conversationSnapshot: Conversation,
      options?: {
        /**
         * 跳过本地消息插入与会话 last-message 更新。用于附件两阶段发送：
         * 第一阶段已写入"上传中"乐观消息 + 会话快照，第二阶段（上传成功
         * 后调用本函数）只需把最终内容入队并通过 WS 推送即可，避免重复
         * 写库与重复触发会话 ordering。
         */
        skipInsert?: boolean;
      }
    ) => {
      if (!loginUser) return;

      const now = new Date().toISOString();
      const initialStatus = wsUiStateRef.current.status === "connected" ? 1 : 2;
      const messageToPersist: Message & { server_conversation_id: string } = {
        ...draftMessage,
        status: initialStatus
      };
      await window.electronAPI.queueOutgoingMessage({
        client_message_id: messageToPersist.client_message_id,
        client_conversation_id: messageToPersist.client_conversation_id,
        server_conversation_id: messageToPersist.server_conversation_id,
        payload: messageToPersist,
        status: initialStatus,
        retry_count: 0,
        created_at: now,
        updated_at: now
      });

      if (!options?.skipInsert) {
        await window.electronAPI.addMessage(messageToPersist);
        await window.electronAPI.updateConvLastMsg({
          ...conversationSnapshot,
          last_message_content: messageToPersist.content,
          last_message_time: messageToPersist.created_at,
          last_message_send_id: loginUser.userId,
          unread_count: 0
        });
        applyConversationUpdate(
          conversationSnapshot.client_conversation_id,
          conversation => ({
            ...conversation,
            last_message_content: messageToPersist.content,
            last_message_time: messageToPersist.created_at,
            last_message_send_id: loginUser.userId,
            unread_count: 0,
            mention_unread_count: 0,
            draft: "",
            is_archived: 0
          })
        );
      } else {
        // skipInsert：只更新已存在消息行的内容/状态（附件最终内容 patch）。
        await window.electronAPI.updateMessageStatus({
          ...messageToPersist,
          updated_at: new Date().toISOString()
        });
        await window.electronAPI.updateConvLastMsg({
          ...conversationSnapshot,
          last_message_content: messageToPersist.content,
          last_message_time: messageToPersist.created_at,
          last_message_send_id: loginUser.userId,
          unread_count: 0
        });
        applyConversationUpdate(
          conversationSnapshot.client_conversation_id,
          conversation => ({
            ...conversation,
            last_message_content: messageToPersist.content,
            last_message_time: messageToPersist.created_at,
            last_message_send_id: loginUser.userId
          })
        );
      }

      if (wsUiStateRef.current.status !== "connected") {
        return;
      }

      const ws = await getWSClient();
      const wsNewMessage: ChatMessage = {
        ...messageToPersist,
        messageClassify: "chat"
      };
      try {
        sendingOutgoingIdsRef.current.add(messageToPersist.client_message_id);
        const serverMessage = await ws.sendMessageWithAck(wsNewMessage);
        await window.electronAPI.updateMessageStatus({
          ...messageToPersist,
          ...serverMessage,
          status: 0
        });
        await window.electronAPI.deleteOutgoingMessage(
          messageToPersist.client_message_id
        );
        // ACK 成功 → 释放 outbox 中的原文件（缩略图保留供后续滚动 / 转发预览）。
        const contentForRelease = messageToPersist.content as {
          local_source_ref?: string;
        } | null;
        const sourceRef = contentForRelease?.local_source_ref;
        if (sourceRef) {
          void getOutboxClient().delete(sourceRef);
        }
      } catch (error) {
        log.error("Message send failed", error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const retryCount = 1;
        await window.electronAPI.updateOutgoingMessage({
          client_message_id: messageToPersist.client_message_id,
          status: -1,
          retry_count: retryCount,
          next_retry_at: isRetryableOutgoingError(errorMessage)
            ? computeNextRetryAt(retryCount)
            : null,
          last_error: errorMessage,
          updated_at: new Date().toISOString()
        });
        await window.electronAPI.updateMessageStatus({
          ...messageToPersist,
          status: -1,
          updated_at: new Date().toISOString()
        });
      } finally {
        sendingOutgoingIdsRef.current.delete(
          messageToPersist.client_message_id
        );
      }
    },
    [applyConversationUpdate, loginUser, sendingOutgoingIdsRef, wsUiStateRef]
  );

  const handleSendMessage = useCallback(
    async (
      text: string,
      replyTo?: Message | null,
      mentions?: MessageMention[],
      mentionAll?: boolean
    ) => {
      const conversation = activeConversationRef.current;
      if (!conversation || !text.trim() || !loginUser) return;
      const normalizedMentionDraft = normalizeMentionDraft(
        text.trim(),
        mentions,
        mentionAll
      );

      const newMessage: Message & { server_conversation_id: string } = {
        client_message_id: uuidv4(),
        server_message_id: "",
        client_conversation_id: conversation.client_conversation_id,
        server_conversation_id: conversation.server_conversation_id,
        type: 1,
        status: 1,
        sequence: 0,
        content: {
          type: 1,
          text: text.trim(),
          mentions: normalizedMentionDraft.mentions,
          mention_all: normalizedMentionDraft.mentionAll
        },
        reply_to_message_id: replyTo?.server_message_id || null,
        reply_to: replyTo?.server_message_id
          ? {
              message_id: replyTo.server_message_id,
              sender_id: replyTo.sender_id,
              sender_nickname: replyTo.sender_nickname,
              text: getMessageSummaryText(replyTo.content)
            }
          : null,
        sender_id: loginUser.userId,
        created_at: new Date().toISOString(),
        is_recalled: 0
      };

      await sendExistingMessage(newMessage, conversation);
    },
    [activeConversationRef, loginUser, sendExistingMessage]
  );

  const handleSendFileMessage = useCallback(
    async (
      file: File,
      onProgress?: (percent: number) => void,
      options?: {
        kind?: "voice_message";
        durationSeconds?: number;
        waveform?: number[];
        /** 用户勾选了"原图"，跳过客户端压缩 */
        sendAsOriginal?: boolean;
      }
    ) => {
      const conversation = activeConversationRef.current;
      if (!conversation || !loginUser) return;

      const limits = await ensureLimits();
      const category = detectAttachmentCategory({
        mimeType: file.type,
        name: file.name,
        isVoice: options?.kind === "voice_message"
      });

      // 客户端图片压缩（默认开启；勾选"原图"或非图片类型跳过）
      // 注：压缩仅在 image 类内变换格式（HEIC→JPEG / PNG→PNG / JPEG→JPEG），
      // 不会改变附件分类，因此无需重算 category。
      let workingFile: File = file;
      let originalSize: number | undefined;
      // 图片尺寸：用于发送侧主动写入 content.width/height，避免接收端在 worker
      // 回填前缺失尺寸 → CachedImageMessage 无法占位 → 滚动到底偏差的回归。
      let imageWidth: number | undefined;
      let imageHeight: number | undefined;

      // 先做尺寸校验：避免对超限文件做无意义的解码 / createImageBitmap，
      // 防止低端机在拒绝上传前 RSS 飙升。
      const maxBytes = limits.attachments[category];
      if (file.size > maxBytes) {
        throw new Error(
          i18next.t("chat.attachmentSizeExceeded", {
            label: i18next.t(`chat.attachmentCategory.${category}`),
            size: bytesToMB(maxBytes)
          })
        );
      }

      if (category === "image" && !options?.sendAsOriginal) {
        const compressed = await compressImageForUpload(file);
        if (compressed.meta.didCompress && compressed.file !== file) {
          workingFile = compressed.file;
          if (compressed.meta.originalSize > 0) {
            originalSize = compressed.meta.originalSize;
          }
        }
        if (compressed.meta.width > 0 && compressed.meta.height > 0) {
          imageWidth = compressed.meta.width;
          imageHeight = compressed.meta.height;
        }
      }
      // skip 路径（GIF/未知/sendAsOriginal）下 compress 没有解码图片，单独
      // 用 createImageBitmap 探测一次尺寸；失败不阻断主流程。
      if (
        category === "image" &&
        (imageWidth == null || imageHeight == null) &&
        typeof createImageBitmap !== "undefined"
      ) {
        try {
          const bmp = await createImageBitmap(workingFile);
          if (bmp.width > 0 && bmp.height > 0) {
            imageWidth = bmp.width;
            imageHeight = bmp.height;
          }
          bmp.close?.();
        } catch (err) {
          log.warn("[useChatOutgoing] probe image bitmap failed", err);
        }
      }
      // 压缩后的兜底校验：理论上压缩只会变小，但 PNG 重编码极端场景
      // 可能膨胀；保留二次防御以匹配 server 端 maxBytes 约束。
      if (workingFile.size > maxBytes) {
        throw new Error(
          i18next.t("chat.attachmentSizeExceeded", {
            label: i18next.t(`chat.attachmentCategory.${category}`),
            size: bytesToMB(maxBytes)
          })
        );
      }

      // === 1) 先插入"上传中"的乐观附件消息（status=1, upload_pending=true）。
      // 失败/重试都通过气泡而非 Composer 卡片表达，对齐 WhatsApp/Telegram/WeChat。
      const clientMessageId = uuidv4();
      setPendingUploadFile(clientMessageId, workingFile);
      setAttachmentProgress(clientMessageId, 0);

      // 把原文件 + 缩略图持久化到 outbox（"自有存储"），让重启 / 失败 /
      // 离线场景下气泡始终能渲染缩略图，并允许失败后无须重新选择文件
      // 即可重试。失败 best-effort：ref 为空时退回到 in-memory pendingFileMap。
      const outbox = getOutboxClient();
      const previewKind = inferLocalPreviewKindFromMime(workingFile.type);
      const sourceExtension = inferExtensionFromFile(workingFile);

      // 缩略图：图片走 THUMBNAIL_IMAGE_COMPRESS（≤512 长边、JPEG q70），目标 < 50KB，
      // 避免把原图（数 MB）整份写进 IndexedDB / outbox。非图片暂不生成缩略图占位。
      let thumbFile: File | null = null;
      if (previewKind === "image") {
        try {
          const thumb = await compressImageForUpload(
            workingFile,
            THUMBNAIL_IMAGE_COMPRESS
          );
          // 即便 didCompress=false（原图已经很小），thumb.file 也是合法的小文件，
          // 可以直接当缩略图使用。
          thumbFile = thumb.file;
        } catch (err) {
          log.warn(
            "[outbox] thumbnail compress failed; fallback to source",
            err
          );
          thumbFile = workingFile;
        }
      }

      const [sourceRef, previewRef] = await Promise.all([
        outbox.put({
          uid: loginUser.userId,
          clientMessageId,
          slot: "source",
          data: workingFile,
          mimeType: workingFile.type,
          extension: sourceExtension
        }),
        thumbFile
          ? outbox.put({
              uid: loginUser.userId,
              clientMessageId,
              slot: "preview",
              data: thumbFile,
              mimeType: thumbFile.type || "image/jpeg",
              extension: "jpg"
            })
          : Promise.resolve("")
      ]);

      // local_preview_uri 用缩略图，避免气泡组件去 decode 原始大图卡顿。
      const localPreviewUri = URL.createObjectURL(thumbFile ?? workingFile);

      const optimisticMessage: Message & {
        server_conversation_id: string;
      } = {
        client_message_id: clientMessageId,
        server_message_id: "",
        client_conversation_id: conversation.client_conversation_id,
        server_conversation_id: conversation.server_conversation_id,
        type: 2,
        status: 1,
        sequence: 0,
        content: {
          type: 2,
          ...(options?.kind ? { kind: options.kind } : {}),
          // 上传完成前 upload_id / url 暂为占位空串；upload_pending=true 时
          // resendOutgoingMessages 与 WS 发送都会跳过该消息。
          upload_id: "",
          name: workingFile.name,
          url: "",
          size: workingFile.size,
          mime_type: workingFile.type,
          upload_pending: true,
          upload_progress: 0,
          local_preview_uri: localPreviewUri,
          ...(sourceRef ? { local_source_ref: sourceRef } : {}),
          ...(previewRef ? { local_preview_ref: previewRef } : {}),
          local_preview_kind: previewKind,
          original_file_name: workingFile.name,
          original_file_size: workingFile.size,
          ...(options?.durationSeconds != null
            ? { duration_seconds: options.durationSeconds }
            : {}),
          ...(options?.waveform ? { waveform: options.waveform } : {}),
          ...(originalSize != null ? { original_size: originalSize } : {}),
          // 提前写入 width/height（即便 server worker 还没回填），
          // 让接收端 CachedImageMessage 立即按真实 aspect-ratio 占位。
          ...(imageWidth != null ? { width: imageWidth } : {}),
          ...(imageHeight != null ? { height: imageHeight } : {})
        },
        reply_to_message_id: null,
        reply_to: null,
        sender_id: loginUser.userId,
        created_at: new Date().toISOString(),
        is_recalled: 0
      };

      await window.electronAPI.addMessage(optimisticMessage);
      await window.electronAPI.updateConvLastMsg({
        ...conversation,
        last_message_content: optimisticMessage.content,
        last_message_time: optimisticMessage.created_at,
        last_message_send_id: loginUser.userId,
        unread_count: 0
      });
      applyConversationUpdate(conversation.client_conversation_id, prev => ({
        ...prev,
        last_message_content: optimisticMessage.content,
        last_message_time: optimisticMessage.created_at,
        last_message_send_id: loginUser.userId,
        unread_count: 0,
        mention_unread_count: 0,
        draft: "",
        is_archived: 0
      }));

      // === 2) 视频首帧抽取（容错；失败仅 warn，不阻断主流程）。
      let thumbnailUploadId: string | undefined;
      let videoDurationSeconds: number | undefined;
      if (category === "video") {
        try {
          const thumb = await extractVideoThumbnail(workingFile);
          if (thumb) {
            videoDurationSeconds = thumb.durationSeconds;
            const thumbUploaded = await uploadAttachment(
              thumb.file,
              undefined,
              {
                category: "image",
                width: thumb.meta.width,
                height: thumb.meta.height
              }
            );
            thumbnailUploadId = thumbUploaded.uploadId;
          }
        } catch (err) {
          log.warn("video thumbnail extract/upload failed", err);
        }
      }

      // === 3) 真正上传 + 进度同步（只走内存 store；写库仅在 0/100/失败三处）。
      let uploaded: Awaited<ReturnType<typeof uploadAttachment>>;
      try {
        uploaded = await uploadAttachment(
          workingFile,
          percent => {
            setAttachmentProgress(clientMessageId, percent);
            onProgress?.(percent);
          },
          {
            category,
            // 让服务端 attachment_uploads 行在 initiate 阶段就带上 width/height，
            // 哪怕缩略图 worker 失败，DB 也不会留 NULL → 接收端永不缺尺寸。
            ...(category === "image" && imageWidth != null
              ? { width: imageWidth }
              : {}),
            ...(category === "image" && imageHeight != null
              ? { height: imageHeight }
              : {}),
            durationMs:
              options?.durationSeconds != null
                ? Math.round(options.durationSeconds * 1000)
                : undefined
          }
        );
      } catch (error) {
        log.error("attachment upload failed", error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        // 失败：标记消息 status=-1。错误文案写入 content.upload_error（而非
        // outgoing_messages.last_error），因为上传失败时 outgoing 队列里还没有
        // 该消息记录；这样 UI 可直接从 content 读取失败原因，并可在重试成功
        // 后随 content 一起被覆写为干净值。
        const failedContent = {
          ...(optimisticMessage.content as Record<string, unknown>),
          upload_pending: false,
          upload_error: errorMessage
        };
        await window.electronAPI.updateMessageStatus({
          ...optimisticMessage,
          status: -1,
          content: failedContent,
          updated_at: new Date().toISOString()
        });
        clearAttachmentProgress(clientMessageId);
        // 抛回给调用方，便于 Composer 决定是否清空 pendingImage（成功才清）。
        throw error;
      }

      setAttachmentProgress(clientMessageId, 100);

      // === 4) 用真实的上传结果 patch 消息内容，并通过 WS 推送给服务端。
      const finalContent = {
        type: 2 as const,
        ...(options?.kind ? { kind: options.kind } : {}),
        upload_id: uploaded.uploadId,
        name: uploaded.originalname,
        url: uploaded.url,
        size: uploaded.size,
        mime_type: uploaded.mimeType,
        ...(uploaded.width != null
          ? { width: uploaded.width }
          : imageWidth != null
            ? { width: imageWidth }
            : {}),
        ...(uploaded.height != null
          ? { height: uploaded.height }
          : imageHeight != null
            ? { height: imageHeight }
            : {}),
        ...(uploaded.durationMs != null
          ? { duration_ms: uploaded.durationMs }
          : {}),
        ...(uploaded.thumbStatus ? { thumb_status: uploaded.thumbStatus } : {}),
        ...(thumbnailUploadId
          ? { thumbnail_upload_id: thumbnailUploadId }
          : {}),
        ...(options?.durationSeconds || videoDurationSeconds
          ? {
              duration_seconds: options?.durationSeconds ?? videoDurationSeconds
            }
          : {}),
        ...(options?.waveform ? { waveform: options.waveform } : {}),
        ...(originalSize != null ? { original_size: originalSize } : {})
        // 注意：upload_pending / upload_progress / local_preview_uri 不出现在最终内容中，
        // 服务端载荷保持纯净；本地 DB 也写入清理后的版本。
      };

      const messageToSend: Message & { server_conversation_id: string } = {
        ...optimisticMessage,
        content: finalContent
      };

      // 上传成功后，pendingFileMap 内的 File 可释放；保留至 WS ack 成功也无害，
      // 提前清理以减少内存压力（重试场景仅在 status=-1 时需要 File）。
      deletePendingUploadFile(clientMessageId);
      URL.revokeObjectURL(localPreviewUri);
      clearAttachmentProgress(clientMessageId);

      await sendExistingMessage(messageToSend, conversation, {
        skipInsert: true
      });
    },
    [
      activeConversationRef,
      applyConversationUpdate,
      loginUser,
      sendExistingMessage
    ]
  );

  const handleRetryMessage = useCallback(
    async (message: Message) => {
      const conversation = activeConversationRef.current;
      if (!conversation || !loginUser) return;
      if (message.status !== -1) return;
      if (
        message.client_conversation_id !== conversation.client_conversation_id
      ) {
        return;
      }

      // 附件消息重试分两种：
      // 1) 已上传成功但 WS 发送失败：content.upload_id 已就绪，走标准重试路径。
      // 2) 上传阶段失败：从 pendingFileMap 取回 File 重新走 handleSendFileMessage。
      //    若 pendingFileMap 已被清理（进程重启等），提示用户重新选择文件。
      const isAttachmentMessage = message.type === 2;
      const attachmentContent =
        isAttachmentMessage && typeof message.content === "object"
          ? (message.content as {
              upload_id?: string;
              upload_pending?: boolean;
            })
          : null;
      const needsReupload =
        isAttachmentMessage &&
        (!attachmentContent?.upload_id || attachmentContent?.upload_pending);

      if (needsReupload) {
        let file = getPendingUploadFile(message.client_message_id);
        if (!file) {
          // 进程刷新 / 重启 → in-memory map 已丢，回退到 outbox 取回原文件，
          // 让"离线时拍照、关掉 app、回来后重试"也能无缝完成（对齐 WhatsApp）。
          const contentForRetry = message.content as {
            local_source_ref?: string;
            original_file_name?: string;
            name?: string;
            mime_type?: string;
            local_source_missing?: boolean;
          };
          const ref = contentForRetry?.local_source_ref;
          if (ref) {
            const handle = await getOutboxClient().get(ref);
            if (handle) {
              const filename =
                contentForRetry.original_file_name ||
                contentForRetry.name ||
                "attachment";
              file = new File([handle.blob], filename, {
                type: contentForRetry.mime_type || handle.mimeType || ""
              });
              // 回写 in-memory map，后续进度回调不再走 outbox。
              setPendingUploadFile(message.client_message_id, file);
            }
          }
        }
        if (!file) {
          // 真正丢了 → 标记 missing 供 UI 提示"重新选择文件"。
          // 注意：早期版本这里 throw 会被 PendingAttachmentBubble 的
          // onClick → onRetry() 直接吞掉，产生 unhandledrejection。
          // 现在改为：仅做状态写入并 best-effort 返回，UI 会切到"重新选择文件"按钮，
          // 不再有抛错。
          try {
            const cur = message.content as Record<string, unknown>;
            await window.electronAPI.updateMessageStatus({
              ...message,
              status: -1,
              content: { ...cur, local_source_missing: true },
              updated_at: new Date().toISOString()
            });
          } catch (err) {
            log.warn("[retry] mark local_source_missing failed", err);
          }
          return;
        }
        // 删除旧的失败消息行（handleSendFileMessage 会以同样 client_message_id
        // 重新插入新的乐观消息？不会——它每次都生成新的 uuid。为了避免重复气泡，
        // 我们这里直接复用上传流程：原失败消息保留 status=-1，重试会产生一条
        // 新的乐观消息。为了语义清晰，先把旧失败消息标为"已撤销"般的逻辑过于复杂。
        // 折中：直接调用 handleSendFileMessage 即可，旧失败消息可由用户手动长按删除。
        // —— 实际更优雅的做法见下：复用相同 client_message_id 走两阶段。
        await window.electronAPI.updateMessageStatus({
          ...message,
          status: 1,
          last_error: null,
          updated_at: new Date().toISOString(),
          content: {
            ...(message.content as Record<string, unknown>),
            upload_pending: true,
            upload_progress: 0
          }
        });
        setAttachmentProgress(message.client_message_id, 0);

        try {
          const uploaded = await uploadAttachment(file, percent => {
            setAttachmentProgress(message.client_message_id, percent);
          });
          setAttachmentProgress(message.client_message_id, 100);

          const originalContent = message.content as Record<string, unknown>;
          const finalContent = {
            ...originalContent,
            upload_id: uploaded.uploadId,
            name: uploaded.originalname,
            url: uploaded.url,
            size: uploaded.size,
            mime_type: uploaded.mimeType,
            ...(uploaded.width != null ? { width: uploaded.width } : {}),
            ...(uploaded.height != null ? { height: uploaded.height } : {}),
            ...(uploaded.durationMs != null
              ? { duration_ms: uploaded.durationMs }
              : {}),
            ...(uploaded.thumbStatus
              ? { thumb_status: uploaded.thumbStatus }
              : {})
          };
          delete (finalContent as { upload_pending?: boolean }).upload_pending;
          delete (finalContent as { upload_progress?: number }).upload_progress;
          delete (finalContent as { local_preview_uri?: string })
            .local_preview_uri;
          delete (finalContent as { upload_error?: string }).upload_error;

          const previewUri = (message.content as { local_preview_uri?: string })
            .local_preview_uri;
          if (previewUri && previewUri.startsWith("blob:")) {
            URL.revokeObjectURL(previewUri);
          }
          deletePendingUploadFile(message.client_message_id);
          clearAttachmentProgress(message.client_message_id);

          const messageToSend: Message & { server_conversation_id: string } = {
            ...message,
            server_conversation_id: conversation.server_conversation_id,
            content: finalContent as Message["content"],
            status: wsUiStateRef.current.status === "connected" ? 1 : 2
          };
          await sendExistingMessage(messageToSend, conversation, {
            skipInsert: true
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const failedContent = {
            ...(message.content as Record<string, unknown>),
            upload_pending: false,
            upload_error: errorMessage
          };
          await window.electronAPI.updateMessageStatus({
            ...message,
            status: -1,
            content: failedContent,
            updated_at: new Date().toISOString()
          });
          clearAttachmentProgress(message.client_message_id);
          throw error;
        }
        return;
      }

      const retryMessage: Message & { server_conversation_id: string } = {
        ...message,
        server_message_id: message.server_message_id || "",
        server_conversation_id: conversation.server_conversation_id,
        status: wsUiStateRef.current.status === "connected" ? 1 : 2,
        sequence: message.sequence ?? 0,
        created_at: message.created_at,
        sender_id: loginUser.userId
      };

      await sendExistingMessage(retryMessage, conversation, {
        skipInsert: true
      });
    },
    [activeConversationRef, loginUser, sendExistingMessage, wsUiStateRef]
  );

  /**
   * 删除一条"失败的本地附件草稿"消息。仅对 status === -1 且未上链的 type=2
   * 消息生效；同步清理 outbox 中的 source / preview ref、outgoing 队列行、
   * pending file map 与进度缓存，对齐 WhatsApp 长按 → 删除 语义（无二次确认）。
   *
   * Web 不依赖 @mushroom/app-core，所以这里手写 5 步流程；mobile / electron
   * 主进程共享 controller 提供的等价方法。
   */
  const handleDeleteFailedMessage = useCallback(async (message: Message) => {
    if (message.status !== -1) return;
    if (message.server_message_id) return;
    if (message.type !== 2) return;

    const content = (
      typeof message.content === "object" && message.content !== null
        ? message.content
        : {}
    ) as {
      local_source_ref?: string;
      local_preview_ref?: string;
      local_preview_uri?: string;
    };
    const refs: string[] = [];
    if (content.local_source_ref) refs.push(content.local_source_ref);
    if (content.local_preview_ref) refs.push(content.local_preview_ref);

    // 1. 撤回 in-memory blob URL，避免内存泄漏。
    if (content.local_preview_uri?.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(content.local_preview_uri);
      } catch {
        // ignore
      }
    }
    // 2. outbox refs。
    const client = getOutboxClient();
    await Promise.all(
      refs.map(async ref => {
        try {
          await client.delete(ref);
        } catch (err) {
          log.warn("[delete-failed] outbox delete failed", err);
        }
      })
    );
    // 3. outgoing 队列行。
    try {
      await window.electronAPI.deleteOutgoingMessage(message.client_message_id);
    } catch (err) {
      log.warn("[delete-failed] delete outgoing failed", err);
    }
    // 4. pendingFileMap + 进度。
    deletePendingUploadFile(message.client_message_id);
    clearAttachmentProgress(message.client_message_id);
    // 5. local_messages 行删除（主进程会回 message-sync removedClientMessageIds，
    // 渲染端无需自己再 patch list）。
    try {
      await window.electronAPI.deleteLocalMessage({
        clientConversationId: message.client_conversation_id,
        clientMessageId: message.client_message_id
      });
    } catch (err) {
      log.warn("[delete-failed] delete local message failed", err);
    }
  }, []);

  /**
   * 用户在失败气泡上"重新选择文件"。流程对齐 WhatsApp / Telegram：
   *   1. 等用户真正选完 file（取消 → 不动旧消息）；
   *   2. 删旧失败消息（含 outbox refs、outgoing、pending file 等所有副作用）；
   *   3. 复用 handleSendFileMessage 走完整发送流程，生成一条新的乐观消息。
   *
   * 这里 inputAccept 用大类（image/* / video/* / *）而非具体扩展名，避免
   * 用户取证选不到原文件类型时被卡住。
   */
  const handleReselectAttachment = useCallback(
    async (message: Message, file: File) => {
      if (message.status !== -1) return;
      if (message.server_message_id) return;
      if (message.type !== 2) return;
      // 顺序很重要：先删旧（含 outbox / outgoing / DB），再以新 file 重新发起。
      await handleDeleteFailedMessage(message);
      await handleSendFileMessage(file);
    },
    [handleDeleteFailedMessage, handleSendFileMessage]
  );

  const runStartupRecovery = useCallback(async () => {
    if (!loginUser) return;
    try {
      const queued = await window.electronAPI.getOutgoingMessages();
      const activeRefs = new Set<string>();
      const now = new Date().toISOString();
      for (const item of queued) {
        const content = item.payload?.content as
          | { local_source_ref?: string; local_preview_ref?: string }
          | null
          | undefined;
        if (content?.local_source_ref) activeRefs.add(content.local_source_ref);
        if (content?.local_preview_ref)
          activeRefs.add(content.local_preview_ref);

        // status:1（发送中）但进程已重启 → 没人会再 ACK，归位为 -1，
        // 让 UI 显示"发送失败"，并允许用户气泡内点击重试。
        // 同时清掉 upload_pending/upload_progress，避免 UI 显示"上传中…"
        // 进度条卡死。
        if (item.status === 1) {
          try {
            await window.electronAPI.updateOutgoingMessage({
              client_message_id: item.client_message_id,
              status: -1,
              retry_count: item.retry_count ?? 0,
              last_error: item.last_error ?? "interrupted",
              updated_at: now
            });
            const payloadContent = (item.payload?.content ?? {}) as Record<
              string,
              unknown
            >;
            const cleanedContent = { ...payloadContent };
            delete cleanedContent.upload_pending;
            delete cleanedContent.upload_progress;
            delete cleanedContent.upload_error;
            await window.electronAPI.updateMessageStatus({
              ...item.payload,
              content: cleanedContent,
              status: -1,
              updated_at: now
            });
          } catch (err) {
            log.warn("[startup-recovery] mark interrupted failed", err);
          }
        }
      }

      // 合并 messages 表中"仍被引用但已不在 outgoing 队列"的 refs（例如
      // 失败态 status=-1 但用户已删除/重试后队列已被消费的场景）；不收进
      // active 集合就会被 sweep 误删 → 用户点重试时本地源消失。
      try {
        const messageRefs =
          (await window.electronAPI.listLocalAttachmentRefs?.()) ?? [];
        for (const ref of messageRefs) {
          if (ref) activeRefs.add(ref);
        }
      } catch (err) {
        log.warn("[startup-recovery] list message refs failed", err);
      }

      // 清理 outbox 中"不再被任何消息/队列引用"的文件，避免长期堆积。
      await getOutboxClient().sweep({
        uid: loginUser.userId,
        activeRefs
      });
    } catch (err) {
      log.warn("[startup-recovery] failed", err);
    }
  }, [loginUser]);

  const resendOutgoingMessages = useCallback(async () => {
    if (
      !loginUser ||
      retryingOutgoingRef.current ||
      wsUiStateRef.current.status !== "connected"
    ) {
      return;
    }

    retryingOutgoingRef.current = true;
    try {
      const ws = await getWSClient();
      const queued = await window.electronAPI.getOutgoingMessages();
      const now = Date.now();

      for (const item of queued) {
        if (sendingOutgoingIdsRef.current.has(item.client_message_id)) {
          continue;
        }
        if (
          !shouldRetryOutgoingMessage(item, now, {
            autoRetryLimit
          })
        ) {
          continue;
        }

        const payload = {
          ...item.payload,
          server_conversation_id:
            item.server_conversation_id ?? item.payload.server_conversation_id
        };

        if (!payload.server_conversation_id) {
          await window.electronAPI.updateOutgoingMessage({
            client_message_id: item.client_message_id,
            status: -1,
            retry_count: item.retry_count,
            last_error: "Missing server_conversation_id for queued message",
            updated_at: new Date().toISOString()
          });
          continue;
        }

        await window.electronAPI.updateMessageStatus({
          ...payload,
          status: 1
        });

        try {
          sendingOutgoingIdsRef.current.add(item.client_message_id);
          const serverMessage = await ws.sendMessageWithAck({
            ...payload,
            messageClassify: "chat"
          });
          await window.electronAPI.updateMessageStatus({
            ...payload,
            ...serverMessage,
            status: 0
          });
          await window.electronAPI.deleteOutgoingMessage(
            item.client_message_id
          );
        } catch (error) {
          const nextRetryCount = (item.retry_count ?? 0) + 1;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const canRetry = isRetryableOutgoingError(errorMessage);
          const reachedLimit = !canRetry || nextRetryCount >= autoRetryLimit;
          await window.electronAPI.updateOutgoingMessage({
            client_message_id: item.client_message_id,
            status: -1,
            retry_count: nextRetryCount,
            next_retry_at: reachedLimit
              ? null
              : computeNextRetryAt(nextRetryCount),
            last_error: errorMessage,
            updated_at: new Date().toISOString()
          });
          await window.electronAPI.updateMessageStatus({
            ...payload,
            status: -1,
            updated_at: new Date().toISOString()
          });
        } finally {
          sendingOutgoingIdsRef.current.delete(item.client_message_id);
        }
      }
    } finally {
      retryingOutgoingRef.current = false;
    }
  }, [
    autoRetryLimit,
    loginUser,
    retryingOutgoingRef,
    sendingOutgoingIdsRef,
    wsUiStateRef
  ]);

  return {
    resendOutgoingMessages,
    runStartupRecovery,
    sendExistingMessage,
    handleSendMessage,
    handleSendFileMessage,
    handleRetryMessage,
    handleReselectAttachment,
    handleDeleteFailedMessage
  };
}
