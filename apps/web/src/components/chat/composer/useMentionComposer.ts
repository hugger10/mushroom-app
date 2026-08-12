import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeMentionDraft } from "@mushroom/shared";
import type { MessageMention } from "@mushroom/shared";
import type { Conversation } from "../../../types/chat";
import type {
  MentionOption,
  MentionQueryRange,
  TextSelectionRef
} from "./types";
import { focusComposerTextarea, getMentionQueryRange } from "./utils";
import { i18n } from "../../../i18n";

interface UseMentionComposerOptions {
  activeConversation: Conversation;
  canMentionAll: boolean;
  currentUserId: number;
  inputValue: string;
  mentionAll: boolean;
  selectedMentions: MessageMention[];
  selectionRef: TextSelectionRef;
  onInputChange: (
    value: string,
    mentions: MessageMention[],
    mentionAll: boolean
  ) => void;
  onTextInputActivity: (nextValue: string) => void;
}

export function useMentionComposer({
  activeConversation,
  canMentionAll,
  currentUserId,
  inputValue,
  mentionAll,
  selectedMentions,
  selectionRef,
  onInputChange,
  onTextInputActivity
}: UseMentionComposerOptions) {
  const [mentionQueryRange, setMentionQueryRange] =
    useState<MentionQueryRange | null>(null);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);

  const updateMentionQuery = useCallback(
    (nextValue: string, cursor: number) => {
      setMentionQueryRange(
        activeConversation.type === 2
          ? getMentionQueryRange(nextValue, cursor)
          : null
      );
    },
    [activeConversation.type]
  );

  const handleInputChange = useCallback(
    (nextValue: string) => {
      const normalizedMentionDraft = normalizeMentionDraft(
        nextValue,
        selectedMentions,
        mentionAll
      );
      onInputChange(
        nextValue,
        normalizedMentionDraft.mentions,
        normalizedMentionDraft.mentionAll
      );

      updateMentionQuery(nextValue, selectionRef.current.end);
      onTextInputActivity(nextValue);
    },
    [
      mentionAll,
      onInputChange,
      onTextInputActivity,
      selectedMentions,
      selectionRef,
      updateMentionQuery
    ]
  );

  const mentionOptions: MentionOption[] = useMemo(() => {
    if (activeConversation.type !== 2 || !mentionQueryRange) {
      return [];
    }

    return [
      ...(canMentionAll &&
      (() => {
        const allLabel = i18n.t("mention.all");
        const query = mentionQueryRange.query.trim().toLowerCase();
        return "all".includes(query) || allLabel.toLowerCase().includes(query);
      })()
        ? [
            {
              kind: "all" as const,
              key: "mention-all",
              label: i18n.t("mention.all")
            }
          ]
        : []),
      ...(activeConversation.members ?? [])
        .filter(member => member.user_id !== currentUserId)
        .filter(member => member.user_id !== 0)
        .filter(member => {
          const keyword = mentionQueryRange.query.trim().toLowerCase();
          if (!keyword) {
            return true;
          }

          return (
            member.nickname.toLowerCase().includes(keyword) ||
            String(member.user_id).includes(keyword)
          );
        })
        .map(member => ({
          kind: "member" as const,
          key: `mention-member-${member.user_id}`,
          userId: member.user_id,
          nickname: member.nickname,
          avatarUrl: member.avatar_url
        }))
    ];
  }, [
    activeConversation.members,
    activeConversation.type,
    canMentionAll,
    currentUserId,
    mentionQueryRange
  ]);

  const isMentionMenuVisible =
    activeConversation.type === 2 &&
    mentionQueryRange !== null &&
    mentionOptions.length > 0;

  useEffect(() => {
    setHighlightedMentionIndex(0);
  }, [mentionQueryRange?.query, mentionOptions.length]);

  const applyMentionOption = useCallback(
    (option: MentionOption) => {
      if (!mentionQueryRange) {
        return;
      }

      const token =
        option.kind === "all"
          ? `@${i18n.t("mention.all")}`
          : `@${option.nickname}`;
      const nextValue =
        inputValue.slice(0, mentionQueryRange.start) +
        `${token} ` +
        inputValue.slice(mentionQueryRange.end);
      const nextCursor = mentionQueryRange.start + token.length + 1;

      selectionRef.current = {
        start: nextCursor,
        end: nextCursor
      };

      const normalizedMentionDraft = normalizeMentionDraft(
        nextValue,
        option.kind === "all"
          ? selectedMentions
          : selectedMentions.some(item => item.user_id === option.userId)
            ? selectedMentions
            : [
                ...selectedMentions,
                {
                  user_id: option.userId,
                  nickname: option.nickname
                }
              ],
        option.kind === "all" ? true : mentionAll
      );

      onInputChange(
        nextValue,
        normalizedMentionDraft.mentions,
        normalizedMentionDraft.mentionAll
      );
      setMentionQueryRange(null);
      setHighlightedMentionIndex(0);
      focusComposerTextarea(nextCursor, nextCursor);
    },
    [
      inputValue,
      mentionAll,
      mentionQueryRange,
      onInputChange,
      selectedMentions,
      selectionRef
    ]
  );

  return {
    applyMentionOption,
    handleInputChange,
    highlightedMentionIndex,
    isMentionMenuVisible,
    mentionOptions,
    setHighlightedMentionIndex,
    setMentionQueryRange,
    updateMentionQuery
  };
}
