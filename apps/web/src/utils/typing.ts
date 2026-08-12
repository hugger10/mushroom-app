import type { TypingMessage } from "@mushroom/shared";
import {
  buildTypingPreview,
  type TypingActivity,
  type TypingIndicator as SharedTypingIndicator
} from "@mushroom/shared";

export type TypingIndicator = SharedTypingIndicator;

/**
 * Per-conversation typing state, keyed by sender user id so multiple
 * concurrent typers in group chats can be tracked simultaneously.
 */
export type TypingMap = Record<string, Record<number, TypingIndicator>>;

export function applyTypingSignal(
  current: TypingMap,
  message: Pick<
    TypingMessage,
    "conversation_id" | "sender_user_id" | "active" | "activity"
  >
): TypingMap {
  const conversationId = String(message.conversation_id || "");
  const senderUserId = Number(message.sender_user_id || 0);
  if (!conversationId || !senderUserId) {
    return current;
  }

  const conversationTypers = current[conversationId];

  if (!message.active) {
    if (!conversationTypers || !(senderUserId in conversationTypers)) {
      return current;
    }
    const nextConversationTypers = { ...conversationTypers };
    delete nextConversationTypers[senderUserId];
    const next = { ...current };
    if (Object.keys(nextConversationTypers).length === 0) {
      delete next[conversationId];
    } else {
      next[conversationId] = nextConversationTypers;
    }
    return next;
  }

  const nextIndicator: TypingIndicator = {
    activity: message.activity === "voice" ? "voice" : "text"
  };
  const existing = conversationTypers?.[senderUserId];
  if (existing?.activity === nextIndicator.activity) {
    return current;
  }

  return {
    ...current,
    [conversationId]: {
      ...(conversationTypers ?? {}),
      [senderUserId]: nextIndicator
    }
  };
}

/**
 * Returns true if anyone is currently typing/recording in the conversation.
 */
export function hasActiveTypers(
  typers: Record<number, TypingIndicator> | undefined
): boolean {
  return !!typers && Object.keys(typers).length > 0;
}

/**
 * Returns the first observed activity (text/voice) for the conversation, or
 * null if no one is currently typing. Used by 1:1 chats and as a fallback.
 */
export function getFirstTypingActivity(
  typers: Record<number, TypingIndicator> | undefined
): TypingActivity | null {
  if (!typers) return null;
  const entries = Object.values(typers);
  return entries[0]?.activity ?? null;
}

export type TypingSubtitleTranslate = (
  key: string,
  options?: { defaultValue?: string } & Record<string, unknown>
) => string;

function tr(
  translate: TypingSubtitleTranslate | undefined,
  key: string,
  fallback: string
): string {
  if (!translate) return fallback;
  return translate(key, { defaultValue: fallback });
}

export function getTypingSubtitle(
  activity?: TypingActivity | null,
  translate?: TypingSubtitleTranslate
) {
  return activity === "voice"
    ? tr(translate, "chatDetail.recording", "正在录音…")
    : tr(translate, "chatDetail.typing", "正在输入…");
}

/**
 * Resolves a localized subtitle for a (possibly multi-user) typing indicator.
 * Group chats show member names (1 / 2 / aggregated >=3); 1:1 falls back to
 * {@link getTypingSubtitle}. The display-name resolver should return short
 * nicknames suitable for header rendering.
 */
export function getGroupTypingSubtitle(
  typers: Record<number, TypingIndicator>,
  resolveName: (userId: number) => string | null | undefined,
  translate?: TypingSubtitleTranslate
): string {
  const preview = buildTypingPreview({
    typers,
    isGroup: true,
    resolveDisplayName: resolveName,
    translate
  });
  return preview?.text ?? "";
}
