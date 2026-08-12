import { useCallback } from "react";
import type { MessageMention } from "@mushroom/shared";
import type { Message, SearchMessageResult } from "../../../types/chat";
import type { SearchFilter } from "./useMessageSearch";

interface UseChatWindowActionsOptions {
  inputValue: string;
  replyingTo: Message | null;
  selectedMentions: MessageMention[];
  mentionAll: boolean;
  onSendMessage: (
    text: string,
    replyTo?: Message | null,
    mentions?: MessageMention[],
    mentionAll?: boolean
  ) => void;
  onJumpToMessage: (target: {
    clientMessageId?: string;
    serverMessageId?: string;
    clientConversationId?: string;
  }) => Promise<string | null>;
  clearAfterSend: () => void;
  setPendingFocusMessageId: (messageId: string | null) => void;
  setIsSearchVisible: (visible: boolean) => void;
  setSearchResults: (results: SearchMessageResult[]) => void;
  setSearchKeyword: (keyword: string) => void;
  setSearchFilter: (filter: SearchFilter) => void;
}

export function useChatWindowActions({
  inputValue,
  replyingTo,
  selectedMentions,
  mentionAll,
  onSendMessage,
  onJumpToMessage,
  clearAfterSend,
  setPendingFocusMessageId,
  setIsSearchVisible,
  setSearchResults,
  setSearchKeyword,
  setSearchFilter
}: UseChatWindowActionsOptions) {
  const jumpToMessageAndHighlight = useCallback(
    async (target: {
      clientMessageId?: string;
      serverMessageId?: string;
      clientConversationId?: string;
    }) => {
      const targetMessageId = await onJumpToMessage(target);
      if (targetMessageId) {
        setPendingFocusMessageId(targetMessageId);
      }
      return targetMessageId;
    },
    [onJumpToMessage, setPendingFocusMessageId]
  );

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) {
      return;
    }

    onSendMessage(inputValue, replyingTo, selectedMentions, mentionAll);
    clearAfterSend();
  }, [
    clearAfterSend,
    inputValue,
    mentionAll,
    onSendMessage,
    replyingTo,
    selectedMentions
  ]);

  const openSearch = useCallback(() => {
    setIsSearchVisible(true);
    setSearchResults([]);
    setSearchKeyword("");
    setSearchFilter("all");
  }, [setSearchFilter, setIsSearchVisible, setSearchKeyword, setSearchResults]);

  return {
    jumpToMessageAndHighlight,
    handleSend,
    openSearch
  };
}
