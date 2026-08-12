import log from "@/utils/log";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from "react";
import {
  getCallPhaseFromMessage,
  shouldAutoDismissCallSessionForPhase
} from "@mushroom/shared";
import type { CallUiSession, Conversation } from "../../types/chat";
import { callSoundPlayer } from "../../utils/callSoundPlayer";
import {
  hasParticipantList,
  resolveCallConversationLabel,
  type CallSessionLifecycleMessage
} from "./callSession";

const callLog = log.scope("call");

type UseCallSessionStateOptions = {
  conversationsRef: RefObject<Conversation[]>;
};

export type CallSessionStateApi = {
  callSession: CallUiSession | null;
  callSessionRef: RefObject<CallUiSession | null>;
  setCallSession: React.Dispatch<React.SetStateAction<CallUiSession | null>>;
  getSession: () => CallUiSession | null;
  upsertCallSession: (
    direction: "incoming" | "outgoing",
    payload: CallSessionLifecycleMessage
  ) => void;
  clearCallDismissTimer: () => void;
  dismissCallSessionNow: () => void;
  registerOnDismiss: (handler: (() => void) | null) => void;
  resolveConversationLabel: (conversationId: string) => string;
};

/**
 * 负责会话 FSM、会话引用、自动消解定时器以及卸载清理。
 * 通过 registerOnDismiss 由顶层注入副作用（停止媒体、关闭 PC、断开房间），
 * 避免本 hook 反向依赖 transport 层。
 */
export function useCallSessionState({
  conversationsRef
}: UseCallSessionStateOptions): CallSessionStateApi {
  const [callSession, setCallSession] = useState<CallUiSession | null>(null);
  const callSessionRef = useRef<CallUiSession | null>(null);
  const callDismissTimerRef = useRef<number | null>(null);
  const onDismissRef = useRef<(() => void) | null>(null);
  const dismissCallSessionNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    callSessionRef.current = callSession;
  }, [callSession]);

  const getSession = useCallback(() => callSessionRef.current, []);

  const resolveConversationLabel = useCallback(
    (conversationId: string) => {
      return resolveCallConversationLabel(
        conversationsRef.current ?? [],
        conversationId
      );
    },
    [conversationsRef]
  );

  const clearCallDismissTimer = useCallback(() => {
    if (callDismissTimerRef.current !== null) {
      window.clearTimeout(callDismissTimerRef.current);
      callDismissTimerRef.current = null;
    }
  }, []);

  const upsertCallSession = useCallback(
    (
      direction: "incoming" | "outgoing",
      payload: CallSessionLifecycleMessage
    ) => {
      const nextPhase = getCallPhaseFromMessage(payload);
      setCallSession(current => {
        const isSameSession = current?.call_id === payload.call_id;
        const nextParticipants = hasParticipantList(payload)
          ? payload.participants
          : isSameSession && current
            ? current.participants
            : [];

        const nextSession: CallUiSession = {
          call_id: payload.call_id,
          conversation_id: payload.conversation_id,
          call_scope: payload.call_scope,
          media_type: payload.session.media_type,
          requested_media_type:
            isSameSession && current
              ? current.requested_media_type
              : payload.media_type,
          direction: isSameSession && current ? current.direction : direction,
          phase: nextPhase,
          conversation_label: resolveConversationLabel(payload.conversation_id),
          session: payload.session,
          local_audio_enabled:
            isSameSession && current ? current.local_audio_enabled : undefined,
          local_video_enabled:
            isSameSession && current ? current.local_video_enabled : undefined,
          local_participation_mode:
            isSameSession && current
              ? current.local_participation_mode
              : undefined,
          participants: nextParticipants
        };

        return nextSession;
      });
      if (nextPhase === "ringing" || nextPhase === "ongoing") {
        clearCallDismissTimer();
      }
    },
    [clearCallDismissTimer, resolveConversationLabel]
  );

  const dismissCallSessionNow = useCallback(() => {
    const currentSession = callSessionRef.current;
    callLog.info("Dismissing call session UI", {
      callId: currentSession?.call_id ?? null,
      phase: currentSession?.phase ?? null,
      direction: currentSession?.direction ?? null
    });
    clearCallDismissTimer();
    callSoundPlayer.stopLoop();
    void window.electronAPI?.clearIncomingCall?.(currentSession?.call_id);
    callSessionRef.current = null;
    // 调用顶层注入的清理逻辑（停止本地媒体、关 peer、断开房间等）
    onDismissRef.current?.();
    setCallSession(null);
  }, [clearCallDismissTimer]);

  useEffect(() => {
    dismissCallSessionNowRef.current = dismissCallSessionNow;
  }, [dismissCallSessionNow]);

  const registerOnDismiss = useCallback((handler: (() => void) | null) => {
    onDismissRef.current = handler;
  }, []);

  // 终态自动消解（沿用原有 setTimeout(..., 0) 节奏，避免 setState 同步触发）
  useEffect(() => {
    if (
      !callSession ||
      !shouldAutoDismissCallSessionForPhase(callSession.phase)
    ) {
      return;
    }

    callLog.info("Scheduling terminal call UI dismissal", {
      callId: callSession.call_id,
      phase: callSession.phase,
      direction: callSession.direction
    });
    clearCallDismissTimer();
    callDismissTimerRef.current = window.setTimeout(() => {
      callLog.info("Executing scheduled terminal call UI dismissal", {
        callId: callSession.call_id,
        phase: callSession.phase,
        direction: callSession.direction
      });
      dismissCallSessionNowRef.current?.();
    }, 0);

    return () => {
      clearCallDismissTimer();
    };
  }, [callSession, clearCallDismissTimer]);

  // 组件卸载：停止所有提示音 + 执行一次最终清理
  useEffect(() => {
    return () => {
      callSoundPlayer.stopAll();
      dismissCallSessionNowRef.current?.();
    };
  }, []);

  return {
    callSession,
    callSessionRef,
    setCallSession,
    getSession,
    upsertCallSession,
    clearCallDismissTimer,
    dismissCallSessionNow,
    registerOnDismiss,
    resolveConversationLabel
  };
}
