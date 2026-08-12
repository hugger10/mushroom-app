import { Conversation, type ConversationMember } from "@mushroom/shared";
import { useMemo } from "react";
import { i18n } from "../../../i18n";

export type MessageMentionOption =
  | {
      kind: "all";
      key: string;
      label: string;
      nickname: string;
    }
  | {
      kind: "member";
      key: string;
      label: string;
      nickname: string;
      userId: number;
      avatarUrl?: string | null;
    };

function useMentionQueryRange(text: string, cursor: number) {
  return useMemo(() => {
    const normalizedCursor = Math.max(
      0,
      Math.min(cursor || text.length, text.length)
    );
    const mentionStart = text.lastIndexOf("@", normalizedCursor - 1);
    if (mentionStart < 0) {
      return null;
    }

    const previousChar = text[mentionStart - 1];
    if (mentionStart > 0 && previousChar && !/\s/.test(previousChar)) {
      return null;
    }

    const query = text.slice(mentionStart + 1, normalizedCursor);
    if (/\s/.test(query) || /[@.]/.test(query)) {
      return null;
    }

    return {
      start: mentionStart,
      end: normalizedCursor,
      query
    };
  }, [cursor, text]);
}

function getMemberMentionName(member: ConversationMember) {
  return (
    member.nickname || i18n.t("display.unknownUser", { id: member.user_id })
  );
}

function buildMentionOptions(input: {
  conversation: Conversation;
  currentUserId?: number | null;
  query: string;
}): MessageMentionOption[] {
  if (input.conversation.type !== 2) {
    return [];
  }

  const keyword = input.query.trim().toLowerCase();
  const options: MessageMentionOption[] = [];
  const allLabel = i18n.t("mention.all");
  if (allLabel.toLowerCase().includes(keyword) || "all".includes(keyword)) {
    options.push({
      kind: "all",
      key: "all",
      label: `@${allLabel}`,
      nickname: allLabel
    });
  }

  for (const member of input.conversation.members ?? []) {
    if (Number(member.user_id) === Number(input.currentUserId)) {
      continue;
    }

    const nickname = getMemberMentionName(member);
    const searchable = `${nickname} ${member.user_id}`.toLowerCase();
    if (keyword && !searchable.includes(keyword)) {
      continue;
    }

    options.push({
      kind: "member",
      key: String(member.user_id),
      label: `@${nickname}`,
      nickname,
      userId: Number(member.user_id),
      avatarUrl: member.avatar_url || member.avatar || null
    });
  }

  return options.slice(0, 6);
}

export type UseMentionQueryInput = {
  text: string;
  cursor: number;
  conversation: Conversation;
  currentUserId?: number | null;
  onChangeText: (next: string) => void;
  setCursor: (next: number) => void;
};

export function useMentionQuery(input: UseMentionQueryInput) {
  const { text, cursor, conversation, currentUserId, onChangeText, setCursor } =
    input;

  const mentionQueryRange = useMentionQueryRange(text, cursor);
  const mentionOptions = useMemo(
    () =>
      buildMentionOptions({
        conversation,
        currentUserId,
        query: mentionQueryRange?.query ?? ""
      }),
    [conversation, currentUserId, mentionQueryRange?.query]
  );
  const showMentionPanel =
    conversation.type === 2 &&
    mentionQueryRange !== null &&
    mentionOptions.length > 0;

  function insertMention(option: MessageMentionOption) {
    if (!mentionQueryRange) {
      return;
    }

    const token = `@${option.nickname} `;
    const nextText =
      text.slice(0, mentionQueryRange.start) +
      token +
      text.slice(mentionQueryRange.end);
    onChangeText(nextText);
    setCursor(mentionQueryRange.start + token.length);
  }

  return {
    mentionQueryRange,
    mentionOptions,
    showMentionPanel,
    insertMention
  };
}
