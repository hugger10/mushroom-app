import { useCallback, useEffect, useRef } from "react";
import type { TypingMessage } from "@mushroom/shared";
import { getWSClient } from "../../../ws";
import type { Conversation } from "../../../types/chat";
import type { WsUiState } from "../../../ws/WSClient";
import type { TypingActivity } from "./types";

interface UseTypingSignalOptions {
  activeConversation: Conversation;
  currentUserId: number;
  wsUiState: WsUiState;
}

export function useTypingSignal({
  activeConversation,
  currentUserId,
  wsUiState
}: UseTypingSignalOptions) {
  const typingStopTimerRef = useRef<number | null>(null);
  const lastTypingSignalRef = useRef<{
    conversationId: string | null;
    active: boolean;
    activity: TypingActivity;
    sentAt: number;
  }>({
    conversationId: null,
    active: false,
    activity: "text",
    sentAt: 0
  });

  const clearTypingStopTimer = useCallback(() => {
    if (typingStopTimerRef.current != null) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
  }, []);

  const sendTypingSignal = useCallback(
    async (active: boolean, activity: TypingActivity = "text") => {
      const conversationId = activeConversation.server_conversation_id;
      if (!conversationId || wsUiState.status !== "connected") {
        return;
      }

      const now = Date.now();
      const lastSignal = lastTypingSignalRef.current;
      if (
        lastSignal.conversationId === conversationId &&
        lastSignal.active === active &&
        lastSignal.activity === activity &&
        (active === false || now - lastSignal.sentAt < 1500)
      ) {
        return;
      }

      lastTypingSignalRef.current = {
        conversationId,
        active,
        activity,
        sentAt: now
      };

      try {
        const client = await getWSClient();
        await client.sendMessage<TypingMessage>({
          messageClassify: "typing",
          conversation_id: conversationId,
          sender_user_id: currentUserId,
          active,
          activity,
          timestamp: new Date(now).toISOString()
        });
      } catch (error) {
        console.warn("Failed to send typing signal", error);
      }
    },
    [activeConversation.server_conversation_id, currentUserId, wsUiState.status]
  );

  const stopTypingSignal = useCallback(
    (activity: TypingActivity = "text") => {
      clearTypingStopTimer();
      void sendTypingSignal(false, activity);
    },
    [clearTypingStopTimer, sendTypingSignal]
  );

  const syncTypingState = useCallback(
    (nextValue: string) => {
      if (nextValue.trim().length > 0) {
        void sendTypingSignal(true);
        clearTypingStopTimer();
        typingStopTimerRef.current = window.setTimeout(() => {
          void sendTypingSignal(false);
        }, 2200);
        return;
      }

      stopTypingSignal();
    },
    [clearTypingStopTimer, sendTypingSignal, stopTypingSignal]
  );

  useEffect(() => {
    return () => {
      clearTypingStopTimer();
      void sendTypingSignal(false);
    };
  }, [clearTypingStopTimer, sendTypingSignal]);

  return {
    sendTypingSignal,
    stopTypingSignal,
    syncTypingState
  };
}
