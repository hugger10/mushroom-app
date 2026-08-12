import type {
  Message,
  MessageFileContent,
  MergedForwardContent
} from "../types/models";
import {
  getSystemMessageText,
  isSystemMessageContent,
  type SystemMessageTranslate
} from "./system-message";

export type VoiceFileMessageContent = MessageFileContent & {
  kind?: "voice_message";
  duration_seconds?: number;
  waveform?: number[];
};

export function isFileMessageContent(
  value: unknown
): value is MessageFileContent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === 2 &&
    typeof candidate.name === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.size === "number"
  );
}

export function isImageFileMessageContent(
  value: unknown
): value is MessageFileContent {
  if (!isFileMessageContent(value)) {
    return false;
  }

  const candidate = value as {
    mime_type?: string;
    name: string;
  };

  if (candidate.mime_type?.startsWith("image/")) {
    return true;
  }

  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(candidate.name);
}

export function isVideoFileMessageContent(
  value: unknown
): value is MessageFileContent {
  if (!isFileMessageContent(value)) {
    return false;
  }

  const candidate = value as {
    mime_type?: string;
    name: string;
  };

  if (candidate.mime_type?.startsWith("audio/")) {
    return false;
  }

  if (candidate.mime_type?.startsWith("video/")) {
    return true;
  }

  return /\.(mp4|webm|mov|m4v|avi)$/i.test(candidate.name);
}

export function isAudioFileMessageContent(
  value: unknown
): value is MessageFileContent {
  if (!isFileMessageContent(value)) {
    return false;
  }

  const candidate = value as {
    mime_type?: string;
    name: string;
  };

  if (candidate.mime_type?.startsWith("audio/")) {
    return true;
  }

  return /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(candidate.name);
}

export function isVoiceMessageContent(
  value: unknown
): value is VoiceFileMessageContent {
  if (!isFileMessageContent(value) || !isAudioFileMessageContent(value)) {
    return false;
  }

  const candidate = value as VoiceFileMessageContent;
  return (
    candidate.kind === "voice_message" ||
    typeof candidate.duration_seconds === "number"
  );
}

export function formatMediaDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "00:00";
  }

  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export function getFileMessageKindLabel(value: unknown) {
  if (isImageFileMessageContent(value)) {
    return "图片";
  }
  if (isVideoFileMessageContent(value)) {
    return "视频";
  }
  if (isVoiceMessageContent(value)) {
    return "语音";
  }
  if (isAudioFileMessageContent(value)) {
    return "音频";
  }
  if (isFileMessageContent(value)) {
    return "文件";
  }
  return "附件";
}

export function isMergedForwardContent(
  value: unknown
): value is MergedForwardContent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === "merged_forward" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.messages)
  );
}

export function getMessageSummaryText(
  content: unknown,
  translate?: SystemMessageTranslate
) {
  const tr = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    translate ? translate(key, { defaultValue: fallback, ...opts }) : fallback;

  if (!content) {
    return tr("messagePreview.unknown", "[消息]");
  }

  if (isMergedForwardContent(content)) {
    return tr("messagePreview.mergedForward", "[聊天记录]");
  }

  if (isSystemMessageContent(content)) {
    return getSystemMessageText(content, translate);
  }

  if (isFileMessageContent(content)) {
    const candidate = content as unknown as Record<string, unknown>;
    const fileName = String(candidate.name ?? "");
    if (isImageFileMessageContent(content)) {
      return tr("messagePreview.image", "[图片]");
    }
    if (isVideoFileMessageContent(content)) {
      return tr("messagePreview.video", "[视频]");
    }
    if (isVoiceMessageContent(content)) {
      const duration = formatMediaDuration(
        Number(candidate.duration_seconds || 0)
      );
      return tr("messagePreview.voice", `[语音] ${duration}`, { duration });
    }
    if (isAudioFileMessageContent(content)) {
      return tr("messagePreview.audio", "[音频]");
    }
    return tr("messagePreview.file", `[文件] ${fileName}`, { name: fileName });
  }

  const text = getTextMessageText(content);
  if (text) {
    return text;
  }

  return tr("messagePreview.unknown", "[消息]");
}

/**
 * 从消息 content 中提取普通文字消息的完整文本。
 *
 * 仅当 content 是"普通文字消息"（type: 1，且非文件/系统/合并转发）且
 * 携带非空 text 时返回该文本，其余情况一律返回 null。
 * 调用方可据此判断消息是否可被"复制"，以及复制什么内容。
 */
export function getTextMessageText(content: unknown): string | null {
  if (!content || typeof content !== "object") {
    return null;
  }

  if (isFileMessageContent(content)) {
    return null;
  }

  if (isSystemMessageContent(content)) {
    return null;
  }

  if (isMergedForwardContent(content)) {
    return null;
  }

  const candidate = content as Record<string, unknown>;
  if (typeof candidate.text === "string" && candidate.text.trim()) {
    return candidate.text;
  }

  return null;
}

/**
 * 从一段消息 content 里递归收集所有附件 upload_id。
 * 覆盖：
 *   - 直接的文件型 content（type=2），其 upload_id + thumbnail_upload_id
 *   - 合并转发卡片里嵌套消息的 content
 *
 * 注：当前 MessageReplyReference / MessageForwardReference 不携带附件 URL/upload_id，
 * 因此引用/转发头不会被收集；如未来扩展需要同步收集。
 */
export function collectUploadIdsFromContent(
  content: unknown,
  out: Set<string>
) {
  if (!content || typeof content !== "object") return;

  if (isFileMessageContent(content)) {
    const file = content as MessageFileContent;
    if (file.upload_id) out.add(String(file.upload_id));
    if (file.thumbnail_upload_id) out.add(String(file.thumbnail_upload_id));
    return;
  }

  if (isMergedForwardContent(content)) {
    const merged = content as MergedForwardContent;
    if (Array.isArray(merged.messages)) {
      for (const item of merged.messages) {
        collectUploadIdsFromContent(item?.content, out);
      }
    }
  }
}

/**
 * 从一组消息中收集所有附件 upload_id（去重）。
 * 用于"打开会话时一次性批量预刷新过期的预签名 URL"等场景。
 *
 * 可选的 onAttachment 回调在每收集到一个 upload_id 时触发（已去重前），
 * 调用方可借此构造 upload_id -> messageId 映射，供 refresh-urls 持久化使用。
 */
export function collectAttachmentUploadIds<
  M extends Pick<Message, "content"> = Pick<Message, "content">
>(
  messages: ReadonlyArray<M> | null | undefined,
  onAttachment?: (message: M, uploadId: string) => void
): string[] {
  if (!messages || messages.length === 0) return [];
  const set = new Set<string>();
  for (const message of messages) {
    if (!message) continue;
    const before = set.size;
    collectUploadIdsFromContent(message.content, set);
    if (onAttachment && set.size > before) {
      // 把新加入的 ids 回调出去
      // 由于 Set 顺序保持插入序，可以重算差异
      const added = Array.from(set).slice(before);
      for (const id of added) onAttachment(message, id);
    }
  }
  return Array.from(set);
}

export function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let nextSize = size;
  let unitIndex = 0;

  while (nextSize >= 1024 && unitIndex < units.length - 1) {
    nextSize /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : nextSize >= 10 ? 1 : 2;
  return `${nextSize.toFixed(digits)} ${units[unitIndex]}`;
}
