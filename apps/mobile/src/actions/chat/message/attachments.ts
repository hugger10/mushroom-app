import i18next from "i18next";
import {
  bytesToMB,
  detectAttachmentCategory,
  THUMBNAIL_IMAGE_COMPRESS,
  type Message
} from "@mushroom/shared";
import { createClientMessageId } from "@mushroom/app-core";
import {
  mobileAppController,
  mobileServerApi,
  uploadMobileFile
} from "../../../services/app-runtime";
import {
  pickFileAttachment,
  pickFromCamera,
  pickFromGallery
} from "../../../platform/native-pickers";
import { compressImageForUpload } from "../../../media/compressImage";
import { extractVideoThumbnail } from "../../../media/extractVideoThumbnail";
import {
  setAttachmentProgress,
  clearAttachmentProgress
} from "../../../services/attachmentProgressStore";
import {
  deletePendingAsset,
  getPendingAsset,
  setPendingAsset,
  type PendingMobileAsset
} from "../../../services/pendingAssetMap";
import * as RNFS from "react-native-fs";
import log from "../../../utils/log";
import type {
  MessageActionsCtx,
  ProcessAttachmentArgs,
  UploadAndFinalizeArgs
} from "./types";

export function createAttachmentActions(ctx: MessageActionsCtx) {
  const { state } = ctx;

  async function handleSendAttachment(
    kind: "image" | "file",
    onOptimisticCreated?: () => void
  ) {
    if (!state.activeConversation) {
      return;
    }

    if (kind === "image") {
      // 兼容旧调用：默认走相册入口。
      await ctx.handleSendImageFromGallery();
      return;
    }

    state.setPending(true);
    state.setError("");
    state.setStatus("");

    try {
      const asset = await pickFileAttachment();
      if (!asset) {
        // 用户主动取消是常态操作，不再吐 toast / 状态条提示，
        // 对齐微信 / Telegram 静默取消的行为。
        return;
      }
      await processAndSendAttachmentAsset(
        {
          asset,
          kind: "file",
          sendAsOriginal: false
        },
        onOptimisticCreated
      );
    } catch (currentError) {
      state.setError(
        currentError instanceof Error
          ? currentError.message
          : String(currentError ?? "")
      );
      state.setStatus(i18next.t("messageActions.attachmentSendFailed"));
    } finally {
      state.setPending(false);
    }
  }

  async function pickImageAndPreview(
    source: "gallery" | "camera",
    statusText: string
  ) {
    if (!state.activeConversation) {
      return;
    }

    state.setPending(true);
    state.setError("");
    state.setStatus(statusText);

    try {
      const asset =
        source === "gallery" ? await pickFromGallery() : await pickFromCamera();
      if (!asset) {
        // 静默取消
        return;
      }
      // 选完图直接展示全屏预览页，由用户在预览页确认/调整「原图」后再发送。
      state.setPendingImageAsset(asset);
      state.setImagePreviewVisible(true);
      state.setComposerToolsVisible(false);
    } catch (currentError) {
      state.setError(
        currentError instanceof Error
          ? currentError.message
          : String(currentError ?? "")
      );
      state.setStatus(i18next.t("messageActions.attachmentSendFailed"));
    } finally {
      state.setPending(false);
    }
  }

  async function handleSendImageFromGallery() {
    await pickImageAndPreview("gallery", "");
  }

  async function handleSendImageFromCamera() {
    await pickImageAndPreview("camera", "");
  }

  function handleCancelImagePreview() {
    state.setImagePreviewVisible(false);
    state.setPendingImageAsset(null);
    state.setImagePreviewSendTopRight(false);
    // 不重置 sendImageAsOriginal：保留用户的勾选意图，便于重新选图时延续。
  }

  async function handleConfirmSendImage(onOptimisticCreated?: () => void) {
    const asset = state.pendingImageAsset;
    if (!asset || !state.activeConversation) {
      handleCancelImagePreview();
      return;
    }

    const sendAsOriginal = Boolean(state.sendImageAsOriginal);

    // 立即关闭预览弹窗，上传进度显示在聊天气泡内
    state.setImagePreviewVisible(false);
    state.setPendingImageAsset(null);
    state.setImagePreviewSendTopRight(false);
    state.setSendImageAsOriginal(false);

    try {
      await processAndSendAttachmentAsset(
        {
          asset,
          kind: "image",
          sendAsOriginal
        },
        onOptimisticCreated
      );
    } catch (currentError) {
      state.setError(
        currentError instanceof Error
          ? currentError.message
          : String(currentError ?? "")
      );
      state.setStatus(i18next.t("messageActions.attachmentSendFailed"));
    }
  }

  /**
   * 公共上传 + 发送流程。被「文档」直接调用，以及「图片预览页确认」调用。
   * 仅图片支持 sendAsOriginal 跳过压缩；视频/文件忽略该标志。
   *
   * 流程（两阶段，对齐桌面端 `useChatOutgoing.handleSendFileMessage`，
   * 参考 WhatsApp / Telegram / 微信）：
   *   1) 在选择/压缩完成后立刻插入 `upload_pending=true` 的占位消息，气泡
   *      显示本地预览 + 上传进度；同时把 asset 描述放入 `pendingAssetMap`。
   *   2) 视频先抽取首帧并上传，再上传主附件；进度通过
   *      `attachmentProgressStore` 实时同步，写库仅 0/100/失败 三处。
   *   3) 上传成功 -> `patchAttachmentUploaded` 写真实 content -> 通过
   *      `sendPreparedMessage` 入 outgoing 队列 + WS 推送。
   *   4) 上传失败 -> `markAttachmentUploadFailed` 把 status 置 -1 并写入
   *      `content.upload_error`，用户可在气泡上点击重试。
   */
  async function processAndSendAttachmentAsset(
    params: ProcessAttachmentArgs,
    onOptimisticCreated?: () => void
  ) {
    if (!state.activeConversation) {
      return;
    }
    const { asset, kind, sendAsOriginal } = params;

    // 预校验：根据服务端 limits 拉取的分级限额提前拒绝过大附件。
    const isVideoAsset = Boolean(asset.type?.startsWith("video/"));
    const category = detectAttachmentCategory({
      mimeType: asset.type,
      name: asset.name
    });
    const limitsRes = await mobileServerApi.getLimits().catch(() => null);
    const limits = limitsRes?.data ?? null;
    const maxBytes = limits?.attachments?.[category];
    if (maxBytes && asset.size && asset.size > maxBytes) {
      state.setError(
        i18next.t("chat.attachmentSizeExceeded", {
          label: i18next.t(`chat.attachmentCategory.${category}`),
          size: bytesToMB(maxBytes)
        })
      );
      state.setStatus(i18next.t("messageActions.attachmentTooLarge"));
      return;
    }

    state.setComposerToolsVisible(false); // 客户端图片压缩：默认开启；勾选"原图"或非图片跳过
    let uploadInput: {
      uri: string;
      name: string;
      type: string;
      size: number | undefined;
      width?: number;
      height?: number;
      durationMs?: number;
    } = {
      uri: asset.uri,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      width: asset.width,
      height: asset.height,
      durationMs: asset.durationMs
    };
    let originalSize: number | undefined;
    if (kind === "image" && !isVideoAsset && !sendAsOriginal) {
      const compressed = await compressImageForUpload({
        uri: asset.uri,
        name: asset.name,
        type: asset.type,
        size: asset.size,
        width: asset.width,
        height: asset.height
      });
      if (compressed.meta.didCompress) {
        uploadInput = {
          uri: compressed.uri,
          name: compressed.name,
          type: compressed.type,
          size: compressed.size,
          width: compressed.width,
          height: compressed.height,
          durationMs: asset.durationMs
        };
        originalSize =
          compressed.meta.originalSize > 0
            ? compressed.meta.originalSize
            : undefined;
      }
    }

    const uploadCategory = detectAttachmentCategory({
      mimeType: uploadInput.type,
      name: uploadInput.name
    });

    // 视频：在写占位消息之前先抽取首帧（本地预览用），上传留到主流程并行。
    // best-effort：抽帧失败仅 warn，占位气泡退化成"无封面"。
    let localThumbnailUri: string | undefined;
    let thumbnailAsset:
      | {
          uri: string;
          name: string;
          type: string;
          size: number | undefined;
          width?: number;
          height?: number;
        }
      | undefined;
    if (isVideoAsset) {
      try {
        const thumb = await extractVideoThumbnail(asset.uri);
        if (thumb) {
          localThumbnailUri = thumb.uri;
          thumbnailAsset = {
            uri: thumb.uri,
            name: thumb.name,
            type: thumb.type,
            size: thumb.size,
            width: thumb.width,
            height: thumb.height
          };
        }
      } catch (thumbErr) {
        log
          .scope("mobile")
          .warn("video thumbnail generation failed (pre-upload)", thumbErr);
      }
    }

    // 图片：为 outbox preview slot 单独生成"缩略图档位"文件（≤512 长边、JPEG q70，
    // 目标 < 50KB），避免把原图（数 MB）整份当缩略图存进 RNFS outbox。
    // best-effort：失败则退化为不写 preview，气泡降级显示文件信息。
    if (kind === "image" && !isVideoAsset) {
      try {
        const thumb = await compressImageForUpload(
          {
            uri: uploadInput.uri,
            name: uploadInput.name,
            type: uploadInput.type,
            size: uploadInput.size,
            width: uploadInput.width,
            height: uploadInput.height
          },
          THUMBNAIL_IMAGE_COMPRESS
        );
        // 即便 didCompress=false（原图很小），thumb.uri 也是合法的小文件路径。
        localThumbnailUri = thumb.uri;
      } catch (thumbErr) {
        log
          .scope("mobile")
          .warn("image thumbnail generation failed (pre-upload)", thumbErr);
      }
    }

    // === 1) 先插入"上传中"乐观消息（status=1, upload_pending=true）。
    //     在此之前先把原文件 + 缩略图持久化到 outbox（"自有存储"），
    //     让重启 / 失败 / 离线场景下气泡始终能渲染缩略图，并允许失败
    //     后无须重新选择文件即可重试。
    const provisionalClientMessageId = createClientMessageId();
    const previewKind = inferLocalPreviewKind(uploadInput.type);
    const sourceExtension = inferExtensionFromUpload(
      uploadInput.name,
      uploadInput.type
    );
    const persistResult = await mobileAppController.persistLocalAttachment({
      clientMessageId: provisionalClientMessageId,
      source: {
        kind: "path",
        path: uploadInput.uri,
        mimeType: uploadInput.type
      },
      preview: localThumbnailUri
        ? { kind: "path", path: localThumbnailUri, mimeType: "image/jpeg" }
        : undefined,
      sourceExtension,
      previewExtension: "jpg"
    });

    const optimisticMessage =
      await mobileAppController.createOptimisticPendingAttachmentMessage({
        clientConversationId: state.activeConversation.client_conversation_id,
        clientMessageId: provisionalClientMessageId,
        asset: {
          name: uploadInput.name,
          size: uploadInput.size ?? 0,
          mimeType: uploadInput.type,
          width: uploadInput.width,
          height: uploadInput.height,
          durationMs: uploadInput.durationMs,
          localPreviewUri: uploadInput.uri,
          thumbnailLocalUri: localThumbnailUri,
          localSourceRef: persistResult.sourceRef,
          localPreviewRef: persistResult.previewRef,
          localPreviewKind: previewKind,
          originalFileName: uploadInput.name,
          originalFileSize: uploadInput.size
        },
        replyToClientMessageId: state.replyTargetId
      });
    state.setReplyTargetId(null);
    state.setSelectedMessageId(null);

    // 乐观消息已创建，通知调用方滚动到底部
    onOptimisticCreated?.();

    const pendingAsset: PendingMobileAsset = {
      uri: uploadInput.uri,
      name: uploadInput.name,
      type: uploadInput.type,
      size: uploadInput.size,
      width: uploadInput.width,
      height: uploadInput.height,
      durationMs: uploadInput.durationMs,
      category: uploadCategory,
      sendAsOriginal,
      thumbnail: thumbnailAsset,
      durationMsFromAsset: asset.durationMs,
      originalSize
    };
    setPendingAsset(optimisticMessage.client_message_id, pendingAsset);

    setAttachmentProgress(optimisticMessage.client_message_id, 0);

    // === 2/3) 上传 + patch + WS 推送
    await uploadAndFinalizeAttachment({
      clientConversationId: state.activeConversation.client_conversation_id,
      clientMessageId: optimisticMessage.client_message_id,
      asset: pendingAsset,
      successStatus: ""
    });
  }

  /**
   * 执行实际的"上传 + finalize + WS 发送"。被首次上传和"用户点击重试"
   * 共同调用：原始的 asset 元数据存在 `pendingAssetMap` 里，重试时直接
   * 复用同一 `client_message_id` 走两阶段流程，避免重复气泡。
   */
  async function uploadAndFinalizeAttachment(args: UploadAndFinalizeArgs) {
    const { clientConversationId, clientMessageId, asset, successStatus } =
      args;

    state.setPending(true);
    state.setError("");

    try {
      // 主附件上传（带进度回调，仅写内存 store）。
      const uploaded = await uploadMobileFile({
        uri: asset.uri,
        name: asset.name,
        type: asset.type,
        size: asset.size,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs ?? asset.durationMsFromAsset,
        category: asset.category,
        onProgress: percent => {
          setAttachmentProgress(clientMessageId, percent);
        }
      });

      // 视频首帧缩略图：若 asset.thumbnail 仍未上传，则在此上传。
      let thumbnailUploadId: string | undefined;
      if (asset.thumbnail) {
        try {
          const thumbUploaded = await uploadMobileFile({
            uri: asset.thumbnail.uri,
            name: asset.thumbnail.name,
            type: asset.thumbnail.type,
            size: asset.thumbnail.size,
            width: asset.thumbnail.width,
            height: asset.thumbnail.height,
            category: "image"
          });
          thumbnailUploadId = thumbUploaded.upload_id;
        } catch (thumbErr) {
          log.scope("mobile").warn("video thumbnail upload failed", thumbErr);
        }
      }

      setAttachmentProgress(clientMessageId, 100);

      // === 3) patch 真实 content（去掉 upload_pending）。
      const patched = await mobileAppController.patchAttachmentUploaded({
        clientConversationId,
        clientMessageId,
        attachment: {
          uploadId: uploaded.upload_id,
          name: uploaded.originalname,
          url: uploaded.url,
          size: uploaded.size,
          mimeType: uploaded.mime_type,
          width: uploaded.width,
          height: uploaded.height,
          durationMs: uploaded.duration_ms ?? asset.durationMsFromAsset,
          thumbStatus: uploaded.thumb_status,
          thumbnailUploadId,
          originalSize: asset.originalSize
        },
        durationSeconds: asset.durationSeconds,
        waveform: asset.waveform
      });

      // 上传成功后释放本地资源。WS ack 失败的"已上传待重传"由 outgoing
      // 队列自动重试，不再需要本地 asset。
      deletePendingAsset(clientMessageId);
      clearAttachmentProgress(clientMessageId);

      // === 4) 走标准 outgoing 流程通过 WS 把 patched 消息发出去。
      await ctx.sendPreparedMessage(patched, successStatus);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error ?? "");
      log.scope("mobile").error("attachment upload failed", error);

      await mobileAppController.markAttachmentUploadFailed({
        clientConversationId,
        clientMessageId,
        errorMessage
      });
      clearAttachmentProgress(clientMessageId);
      // asset 仍保留在 pendingAssetMap，等用户点击重试时复用；失败文案
      // 在气泡内通过 content.upload_error 渲染，同时把错误同步到全局
      // state.error 以便底部 toast / 调试面板（与文本消息失败一致）。
      state.setError(errorMessage);
      state.setStatus(i18next.t("messageActions.attachmentSendFailed"));
    } finally {
      state.setPending(false);
    }
  }

  /**
   * 用户在失败附件气泡上点击"重试"。两类情况：
   *   1) content.upload_pending=false 但 upload_id 为空 / upload_error 存在
   *      => 上传阶段失败：从 pendingAssetMap 取回 asset 重新走上传流程。
   *      若 asset 已丢失（进程重启等），提示用户重新选择文件发送。
   *   2) content.upload_id 已就绪、status=-1：通常是 WS 发送阶段失败，
   *      该消息已入 outgoing 队列，由后台自动重试；此处仅做提示。
   */
  /**
   * 重试时尽力恢复 PendingMobileAsset：
   *   1) 优先用 in-memory pendingAssetMap（同一进程内）；
   *   2) 否则从消息 content.local_source_ref 指向的 outbox 文件重建
   *      （进程重启 / 关闭重开场景）；
   *   3) 仍失败返回 undefined。
   */
  async function ensureRetryAsset(
    message: Message
  ): Promise<PendingMobileAsset | undefined> {
    const existing = getPendingAsset(message.client_message_id);
    if (existing) return existing;

    const content =
      typeof message.content === "object" && message.content !== null
        ? (message.content as Record<string, unknown>)
        : {};
    const sourceRef =
      typeof content.local_source_ref === "string"
        ? content.local_source_ref
        : "";
    if (!sourceRef) return undefined;
    try {
      const exists = await RNFS.exists(sourceRef);
      if (!exists) return undefined;
      const stat = await RNFS.stat(sourceRef);
      const fileName =
        (typeof content.original_file_name === "string" &&
          content.original_file_name) ||
        (typeof content.name === "string" && content.name) ||
        "attachment";
      const mimeType =
        (typeof content.mime_type === "string" && content.mime_type) ||
        (typeof content.type === "string" && content.type) ||
        "";
      const category = detectAttachmentCategory({
        mimeType,
        name: fileName
      });
      const reconstructed: PendingMobileAsset = {
        uri: sourceRef,
        name: fileName,
        type: mimeType,
        size: Number(stat.size) || undefined,
        width:
          typeof content.width === "number"
            ? (content.width as number)
            : undefined,
        height:
          typeof content.height === "number"
            ? (content.height as number)
            : undefined,
        durationMs:
          typeof content.duration_ms === "number"
            ? (content.duration_ms as number)
            : undefined,
        category,
        sendAsOriginal: false
      };
      // 回写 in-memory map，避免同一会话内多次重试都走 RNFS.stat。
      setPendingAsset(message.client_message_id, reconstructed);
      return reconstructed;
    } catch (err) {
      log.scope("mobile").warn("ensureRetryAsset failed", err);
      return undefined;
    }
  }

  /**
   * 删除一条失败态的本地附件草稿（status=-1 + 无 server_message_id + type=2）。
   * 通过 controller 串清 outbox refs / outgoing 队列 / SQLite 行 / 内存映射，
   * 并通过 publishSnapshot 把删除推到 UI。无二次确认。
   */
  async function handleDeleteFailedAttachment(message: Message) {
    if (!state.activeConversation) return;
    const ccid = state.activeConversation.client_conversation_id;
    if (message.client_conversation_id !== ccid) return;
    try {
      await mobileAppController.deleteFailedLocalAttachmentMessage({
        clientConversationId: ccid,
        clientMessageId: message.client_message_id
      });
    } catch (err) {
      log
        .scope("mobile")
        .warn("deleteFailedLocalAttachmentMessage failed", err);
    }
    deletePendingAsset(message.client_message_id);
    clearAttachmentProgress(message.client_message_id);
  }

  /**
   * 用户在失败附件气泡上点击"重新选择文件"。按 mime_type 自动分流到
   * 相册图 / 相册视频 / 文件选择器。用户取消则保留旧消息；用户选完
   * 文件后才删旧消息，然后走标准 processAndSendAttachmentAsset 流程
   * 重新生成一条新草稿（新的 client_message_id），不复用旧 cid。
   */
  async function handleReselectAttachment(message: Message) {
    if (!state.activeConversation) return;
    const ccid = state.activeConversation.client_conversation_id;
    if (message.client_conversation_id !== ccid) return;
    if (Number(message.type) !== 2) return;

    const content =
      typeof message.content === "object" && message.content !== null
        ? (message.content as Record<string, unknown>)
        : {};
    const mime =
      typeof content.mime_type === "string"
        ? (content.mime_type as string).toLowerCase()
        : "";

    let asset: Awaited<ReturnType<typeof pickFileAttachment>> | null = null;
    let kind: "image" | "file" = "file";
    try {
      if (mime.startsWith("image/")) {
        asset = await pickFromGallery();
        kind = "image";
      } else if (mime.startsWith("video/")) {
        asset = await pickFromGallery();
        kind = "image"; // 相册同时支持视频，processAndSendAttachmentAsset 内
        // 会按 asset.type 自动识别 video 分支
      } else {
        asset = await pickFileAttachment();
        kind = "file";
      }
    } catch (err) {
      log.scope("mobile").warn("reselect picker failed", err);
      return;
    }
    if (!asset) {
      // 用户取消：保留旧失败消息，与微信/Telegram 行为一致。
      return;
    }

    // 用户已选好新文件 → 先删旧失败消息（best-effort）→ 再发新消息。
    await handleDeleteFailedAttachment(message);
    await processAndSendAttachmentAsset({
      asset,
      kind,
      sendAsOriginal: false
    });
  }

  /**
   * 用户在失败附件气泡上点击"重试"。两类情况：
   *   1) content.upload_pending=false 但 upload_id 为空 / upload_error 存在
   *      => 上传阶段失败：从 pendingAssetMap 取回 asset 重新走上传流程。
   *      若 asset 已丢失（进程重启等），标记 local_source_missing 让气泡
   *      切到"重新选择文件"按钮。
   *   2) content.upload_id 已就绪、status=-1：通常是 WS 发送阶段失败，
   *      该消息已入 outgoing 队列，由后台自动重试；此处仅做提示。
   */
  async function handleRetryAttachment(message: Message) {
    if (!state.activeConversation) return;
    if (message.status !== -1) return;
    if (
      message.client_conversation_id !==
      state.activeConversation.client_conversation_id
    ) {
      return;
    }
    if (Number(message.type) !== 2) return;

    const content =
      typeof message.content === "object" && message.content !== null
        ? (message.content as Record<string, unknown>)
        : {};
    const uploadId =
      typeof content.upload_id === "string" ? content.upload_id : "";
    const needsReupload =
      !uploadId ||
      content.upload_pending === true ||
      typeof content.upload_error === "string";

    if (!needsReupload) {
      // 上传已完成，只是 WS 发送失败：交给 outgoing 队列后台重试。
      state.setStatus(i18next.t("messageActions.resending"), "silent");
      return;
    }

    const asset = await ensureRetryAsset(message);
    if (!asset) {
      // 已尝试从 outbox 重建仍失败 → 标记 missing 让气泡引导"重新选择文件"。
      try {
        await mobileAppController.markAttachmentLocalSourceMissing({
          clientConversationId: state.activeConversation.client_conversation_id,
          clientMessageId: message.client_message_id
        });
      } catch (err) {
        log
          .scope("mobile")
          .warn("markAttachmentLocalSourceMissing failed", err);
      }
      state.setError(i18next.t("messageActions.sourceLost"));
      return;
    }

    await mobileAppController.markAttachmentUploadRetrying({
      clientConversationId: state.activeConversation.client_conversation_id,
      clientMessageId: message.client_message_id
    });
    setAttachmentProgress(message.client_message_id, 0);

    await uploadAndFinalizeAttachment({
      clientConversationId: state.activeConversation.client_conversation_id,
      clientMessageId: message.client_message_id,
      asset,
      successStatus: ""
    });
  }

  return {
    handleSendAttachment,
    handleSendImageFromGallery,
    handleSendImageFromCamera,
    handleCancelImagePreview,
    handleConfirmSendImage,
    processAndSendAttachmentAsset,
    uploadAndFinalizeAttachment,
    handleRetryAttachment,
    handleReselectAttachment,
    handleDeleteFailedAttachment
  };
}

function inferLocalPreviewKind(
  mimeType: string | undefined
): "image" | "video" | "voice" | "file" {
  const mt = (mimeType || "").toLowerCase();
  if (mt.startsWith("image/")) return "image";
  if (mt.startsWith("video/")) return "video";
  if (mt.startsWith("audio/")) return "voice";
  return "file";
}

function inferExtensionFromUpload(
  name: string,
  mimeType: string | undefined
): string {
  const dot = name.lastIndexOf(".");
  if (dot > 0) {
    return name.slice(dot + 1).toLowerCase();
  }
  const mt = (mimeType || "").toLowerCase();
  if (mt === "image/jpeg") return "jpg";
  if (mt === "image/png") return "png";
  if (mt === "video/mp4") return "mp4";
  if (mt === "audio/mp4" || mt === "audio/aac") return "m4a";
  return "bin";
}
