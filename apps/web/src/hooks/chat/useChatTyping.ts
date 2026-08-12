import { useCallback, useEffect, useRef, useState } from "react";
import type { AnyWsMessage } from "@mushroom/shared";
import { applyTypingSignal, type TypingMap } from "../../utils/typing";
import type { LoginUser } from "../../types/user";

const TYPING_IDLE_TIMEOUT_MS = 6000;

export function useChatTyping(loginUser: LoginUser | null) {
  const [typingByConversationId, setTypingByConversationId] =
    useState<TypingMap>({});
  // Per-(conversation, sender) idle timers to auto-clear stale typers when
  // the explicit `active:false` frame is dropped on the wire.
  const typingTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (loginUser) {
      return;
    }

    Object.values(typingTimersRef.current).forEach(timer => {
      window.clearTimeout(timer);
    });
    typingTimersRef.current = {};
    setTypingByConversationId({});
  }, [loginUser]);

  useEffect(() => {
    return () => {
      Object.values(typingTimersRef.current).forEach(timer => {
        window.clearTimeout(timer);
      });
      typingTimersRef.current = {};
    };
  }, []);

  const handleTypingMessage = useCallback((payload: AnyWsMessage) => {
    if (payload.messageClassify !== "typing") {
      return false;
    }

    const conversationId = String(payload.conversation_id || "");
    const senderUserId = Number(payload.sender_user_id || 0);
    if (!conversationId || !senderUserId) {
      return true;
    }

    const timerKey = `${conversationId}:${senderUserId}`;
    const existingTimer = typingTimersRef.current[timerKey];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      delete typingTimersRef.current[timerKey];
    }

    if (payload.active) {
      typingTimersRef.current[timerKey] = window.setTimeout(() => {
        setTypingByConversationId(current =>
          applyTypingSignal(current, {
            conversation_id: conversationId,
            sender_user_id: senderUserId,
            active: false,
            activity: payload.activity
          })
        );
        delete typingTimersRef.current[timerKey];
      }, TYPING_IDLE_TIMEOUT_MS);
    }

    setTypingByConversationId(current => applyTypingSignal(current, payload));
    return true;
  }, []);

  return {
    typingByConversationId,
    handleTypingMessage
  };
}
