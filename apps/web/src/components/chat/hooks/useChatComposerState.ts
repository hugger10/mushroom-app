import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeMentionDraft, type MessageMention } from "@mushroom/shared";
import type { Conversation, Message } from "../../../types/chat";

interface UseChatComposerStateOptions {
  activeConversation: Conversation | null;
  activeConversationId?: string;
  onDraftChange: (conversation: Conversation, draft: string) => Promise<void>;
  onScrollToBottom: () => void;
}

export function useChatComposerState({
  activeConversation,
  activeConversationId,
  onDraftChange,
  onScrollToBottom
}: UseChatComposerStateOptions) {
  const [inputValue, setInputValue] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<MessageMention[]>(
    []
  );
  const [mentionAll, setMentionAll] = useState(false);
  const inputValueRef = useRef("");
  const previousConversationRef = useRef<Conversation | null>(null);
  const initializedConversationIdRef = useRef<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetComposerState = useCallback(
    (draft = "") => {
      setReplyingTo(null);
      setInputValue(draft);
      setSelectedMentions([]);
      setMentionAll(false);
      onScrollToBottom();
    },
    [onScrollToBottom]
  );

  const clearAfterSend = useCallback(() => {
    if (activeConversation) {
      void onDraftChange(activeConversation, "");
    }
    inputValueRef.current = "";
    setInputValue("");
    setReplyingTo(null);
    setSelectedMentions([]);
    setMentionAll(false);
    window.setTimeout(() => {
      onScrollToBottom();
    }, 50);
  }, [activeConversation, onDraftChange, onScrollToBottom]);

  const handleInputChange = useCallback(
    (
      nextValue: string,
      nextMentions: MessageMention[],
      nextMentionAll: boolean
    ) => {
      setInputValue(nextValue);
      setSelectedMentions(nextMentions);
      setMentionAll(nextMentionAll);
    },
    []
  );

  const handlePickMention = useCallback(
    (mention: MessageMention) => {
      const token = `@${mention.nickname}`;
      const nextValue = inputValue.includes(token)
        ? inputValue
        : `${inputValue}${inputValue.endsWith(" ") || inputValue.length === 0 ? "" : " "}${token} `;
      const nextMentions = selectedMentions.some(
        item => item.user_id === mention.user_id
      )
        ? selectedMentions
        : [...selectedMentions, mention];
      const normalized = normalizeMentionDraft(
        nextValue,
        nextMentions,
        mentionAll
      );
      setInputValue(nextValue);
      setSelectedMentions(normalized.mentions);
      setMentionAll(normalized.mentionAll);
    },
    [inputValue, mentionAll, selectedMentions]
  );

  const handlePickMentionAll = useCallback(() => {
    const token = "@all";
    const nextValue = inputValue.includes(token)
      ? inputValue
      : `${inputValue}${inputValue.endsWith(" ") || inputValue.length === 0 ? "" : " "}${token} `;
    setInputValue(nextValue);
    setMentionAll(true);
  }, [inputValue]);

  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  useEffect(() => {
    if (!activeConversationId) {
      initializedConversationIdRef.current = undefined;
      setReplyingTo(null);
      setInputValue("");
      setSelectedMentions([]);
      setMentionAll(false);
      return;
    }

    if (initializedConversationIdRef.current === activeConversationId) {
      return;
    }

    initializedConversationIdRef.current = activeConversationId;
    resetComposerState(activeConversation?.draft || "");
  }, [activeConversation?.draft, activeConversationId, resetComposerState]);

  useEffect(() => {
    if (!activeConversation) {
      return;
    }

    const conversationSnapshot = activeConversation;
    const timer = window.setTimeout(() => {
      void onDraftChange(conversationSnapshot, inputValueRef.current);
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeConversation, inputValue, onDraftChange]);

  useEffect(() => {
    const previousConversation = previousConversationRef.current;
    if (
      previousConversation &&
      previousConversation.client_conversation_id !== activeConversationId
    ) {
      void onDraftChange(previousConversation, inputValueRef.current);
    }

    previousConversationRef.current = activeConversation ?? null;
  }, [activeConversation, activeConversationId, onDraftChange]);

  return {
    inputValue,
    replyingTo,
    selectedMentions,
    mentionAll,
    fileInputRef,
    setInputValue,
    setReplyingTo,
    setSelectedMentions,
    setMentionAll,
    handleInputChange,
    handlePickMention,
    handlePickMentionAll,
    clearAfterSend
  };
}
