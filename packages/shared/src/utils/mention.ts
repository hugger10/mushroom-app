import type { MessageMention } from "../types/models";

/**
 * Canonical "@all" tokens recognized when scanning message text. Keep the
 * legacy Chinese token for backward compatibility with previously sent
 * messages; new UIs may insert any listed token.
 */
export const MENTION_ALL_TOKENS = ["@所有人", "@everyone"] as const;

function containsMentionAll(text: string): boolean {
  const normalized = text.toLowerCase();
  return MENTION_ALL_TOKENS.some(token =>
    normalized.includes(token.toLowerCase())
  );
}

export function getMessageMentions(
  content: Record<string, unknown> | null | undefined
): MessageMention[] {
  if (!content || !Array.isArray(content.mentions)) {
    return [];
  }

  return content.mentions.filter(
    (mention): mention is MessageMention =>
      !!mention &&
      typeof mention === "object" &&
      typeof (mention as MessageMention).user_id === "number" &&
      typeof (mention as MessageMention).nickname === "string"
  );
}

export function isMentioningAll(
  content: Record<string, unknown> | null | undefined
) {
  return content?.mention_all === true;
}

export function isMentioningUser(
  content: Record<string, unknown> | null | undefined,
  userId: number
) {
  return (
    isMentioningAll(content) ||
    getMessageMentions(content).some(mention => mention.user_id === userId)
  );
}

export function normalizeMentionDraft(
  text: string,
  mentions: MessageMention[] | null | undefined,
  mentionAll: boolean | null | undefined
) {
  const nextText = String(text ?? "");
  const uniqueMentions = new Map<number, MessageMention>();

  for (const mention of mentions ?? []) {
    if (!nextText.includes(`@${mention.nickname}`)) {
      continue;
    }
    uniqueMentions.set(mention.user_id, mention);
  }

  return {
    mentions: Array.from(uniqueMentions.values()),
    mentionAll: mentionAll === true && containsMentionAll(nextText)
  };
}
