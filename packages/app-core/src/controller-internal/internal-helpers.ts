import { ApiError } from "@mushroom/shared";
import type { Message } from "@mushroom/shared";
import {
  getMessageSummaryText,
  isAudioFileMessageContent,
  isFileMessageContent,
  isImageFileMessageContent,
  isVideoFileMessageContent
} from "@mushroom/shared";
import type { MobileMessageSearchFilter, SyncMetrics } from "../types";

export const DEFAULT_READ_DEBOUNCE_MS = 240;
export const DEFAULT_OUTGOING_RETRY_BASE_MS = 2_000;
export const DEFAULT_OUTGOING_RETRY_CAP_MS = 30_000;
export const DEFAULT_OUTGOING_AUTO_RETRY_LIMIT = 3;
export const DEFAULT_VISIBLE_MESSAGE_PAGE_SIZE = 50;

export function emptyMetrics(): SyncMetrics {
  return {
    syncedContacts: 0,
    syncedConversations: 0,
    syncedMessages: 0,
    syncedMessageStates: 0,
    completedAt: null,
    syncing: false
  };
}

export function isUnauthorizedError(error: unknown) {
  const status = Number((error as { status?: unknown } | null)?.status ?? 0);
  if (status === 401 || status === 403) {
    return true;
  }

  return (
    error instanceof ApiError && (error.status === 401 || error.status === 403)
  );
}

export function createClientMessageId() {
  return `msg:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export function buildReplyReference(message: Message) {
  if (!message.server_message_id) {
    return null;
  }

  return {
    message_id: message.server_message_id,
    sender_id: message.sender_id,
    sender_nickname: message.sender_nickname,
    text: getMessageSummaryText(message.content)
  };
}

export function buildForwardedContent(
  message: Message,
  _sourceConversationName?: string
) {
  const baseContent =
    typeof message.content === "object" && message.content !== null
      ? { ...message.content }
      : {
          type: 1,
          text: String(message.content ?? "")
        };

  // Remove any existing forwarded_from to ensure clean content
  if ("forwarded_from" in baseContent) {
    delete (baseContent as Record<string, unknown>).forwarded_from;
  }

  return baseContent;
}

export function matchesMessageSearchFilter(
  message: Message,
  filter: MobileMessageSearchFilter
) {
  switch (filter) {
    case "text":
      return !isFileMessageContent(message.content);
    case "images":
      return isImageFileMessageContent(message.content);
    case "videos":
      return isVideoFileMessageContent(message.content);
    case "files":
      return isFileMessageContent(message.content);
    case "favorited":
      return Number(message.is_favorited || 0) > 0;
    case "pinned":
      return Number(message.is_pinned || 0) > 0;
    case "recalled":
      return Number(message.is_recalled || 0) > 0;
    default:
      return true;
  }
}

export function buildMessageSearchText(message: Message) {
  const segments = [
    getMessageSummaryText(message.content),
    message.sender_nickname || "",
    message.reply_to?.text || ""
  ];

  if (isFileMessageContent(message.content)) {
    segments.push(message.content.name);
    if (message.content.mime_type) {
      segments.push(message.content.mime_type);
    }
    if (isAudioFileMessageContent(message.content)) {
      segments.push("音频");
    }
    if (isVideoFileMessageContent(message.content)) {
      segments.push("视频");
    }
    if (isImageFileMessageContent(message.content)) {
      segments.push("图片");
    }
  }

  if (typeof message.content === "object" && message.content !== null) {
    const forwardedFrom = (message.content as Record<string, unknown>)
      .forwarded_from;
    if (forwardedFrom && typeof forwardedFrom === "object") {
      const candidate = forwardedFrom as Record<string, unknown>;
      segments.push(String(candidate.conversation_name ?? ""));
      segments.push(String(candidate.sender_nickname ?? ""));
    }
  }

  return segments.join(" ").trim().toLowerCase();
}

export type SnapshotListener = (
  snapshot: import("../types").MobileAppSnapshot
) => void | Promise<void>;

export type SyncNowOptions = {
  force?: boolean;
};
