import type { TFunction } from "i18next";
import type { MessageDateLabels, MessageReactionEntry } from "@mushroom/shared";
import type { Message } from "../../../types/chat";
import {
  getMessageFailureDisplayText,
  isBlockedSendFailure
} from "../../../utils/messageTimeline";
import {
  buildMediaCachePayload,
  resolveMessageMediaCacheCategory
} from "../messageMediaCache";
import { isFileMessageContent } from "@mushroom/shared";

export type ReactionGroup = {
  emoji: string;
  count: number;
  mine: boolean;
  users: MessageReactionEntry[];
};

/**
 * Group reactions by emoji, sorted by count desc. Marks `mine` when
 * the current user has reacted with that emoji.
 */
export function groupReactions(
  reactions: MessageReactionEntry[] | undefined,
  currentUserId: number | null | undefined
): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>();
  for (const item of reactions ?? []) {
    if (!item || !item.emoji) continue;
    const existing = map.get(item.emoji);
    const isMine = Number(item.user_id) === Number(currentUserId);
    if (existing) {
      existing.count += 1;
      existing.users.push(item);
      if (isMine) {
        existing.mine = true;
      }
    } else {
      map.set(item.emoji, {
        emoji: item.emoji,
        count: 1,
        mine: isMine,
        users: [item]
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/**
 * Compute i18n labels for date separators. Pure function; suitable to wrap in useMemo
 * by callers keyed on the translator instance.
 */
export function computeDateSeparatorLabels(t: TFunction): MessageDateLabels {
  return {
    today: t("chat.dateSeparator.today", "今天"),
    yesterday: t("chat.dateSeparator.yesterday", "昨天"),
    weekdays: [
      t("chat.dateSeparator.weekday0", "周日"),
      t("chat.dateSeparator.weekday1", "周一"),
      t("chat.dateSeparator.weekday2", "周二"),
      t("chat.dateSeparator.weekday3", "周三"),
      t("chat.dateSeparator.weekday4", "周四"),
      t("chat.dateSeparator.weekday5", "周五"),
      t("chat.dateSeparator.weekday6", "周六")
    ] as MessageDateLabels["weekdays"],
    sameYear: t("chat.dateSeparator.sameYear", "{{month}}月{{day}}日"),
    otherYear: t(
      "chat.dateSeparator.otherYear",
      "{{year}}年{{month}}月{{day}}日"
    )
  };
}

/**
 * Display text for a send-failure error. Special-cases attachment uploads
 * (type === 2) which carry the error on content.upload_error.
 */
export function getMessageFailureText(msg: Message): string {
  if (
    msg.type === 2 &&
    typeof msg.content === "object" &&
    (msg.content as { upload_error?: string }).upload_error
  ) {
    return (msg.content as { upload_error?: string }).upload_error || "";
  }
  return getMessageFailureDisplayText(msg.last_error);
}

/**
 * Whether a failed (status === -1) message can be retried by the sender.
 * Blocked-by-relationship failures are not retryable.
 */
export function canRetryFailedMessage(msg: Message): boolean {
  return msg.status === -1 && !isBlockedSendFailure(msg.last_error);
}

/**
 * Invoke the Electron "save media as" flow for an attachment message.
 * Returns a status describing the outcome so the caller can surface a toast.
 */
export type SaveMediaAsResult =
  | { kind: "saved" }
  | { kind: "canceled" }
  | { kind: "unsupported" }
  | { kind: "error" };

export async function saveMediaAs(msg: Message): Promise<SaveMediaAsResult> {
  if (!isFileMessageContent(msg.content)) {
    return { kind: "error" };
  }
  if (typeof window.electronAPI?.saveMediaCacheAs !== "function") {
    return { kind: "unsupported" };
  }
  try {
    const result = await window.electronAPI.saveMediaCacheAs(
      buildMediaCachePayload({
        message: msg,
        content: msg.content,
        category: resolveMessageMediaCacheCategory(msg.content)
      })
    );
    return result.canceled ? { kind: "canceled" } : { kind: "saved" };
  } catch {
    return { kind: "error" };
  }
}
