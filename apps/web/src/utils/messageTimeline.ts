import {
  getOutgoingFailureDisplayText,
  isRetryableOutgoingError
} from "@mushroom/shared";
import type { Message } from "../types/chat";
import { i18n } from "../i18n";

export function sortMessagesForTimeline(messages: Message[]) {
  const merged = new Map<string, Message>();
  for (const message of messages) {
    merged.set(message.client_message_id, message);
  }

  return Array.from(merged.values()).sort((a, b) => {
    const aSequence = Number(a.sequence ?? 0);
    const bSequence = Number(b.sequence ?? 0);
    if (aSequence > 0 && bSequence > 0 && aSequence !== bSequence) {
      return aSequence - bSequence;
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

export function isBlockedSendFailure(lastError?: string | null) {
  return !isRetryableOutgoingError(lastError);
}

export function getMessageFailureDisplayText(lastError?: string | null) {
  return getOutgoingFailureDisplayText(lastError, i18n.t);
}
