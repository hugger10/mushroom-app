import { useCallback, useEffect, useRef, useState } from "react";
import log from "@/utils/log";
import {
  getNextMentionUnreadCount,
  getNextUnreadCount,
  hasMatchingMessage,
  isMentioningUser,
  refreshGroupReadState
} from "@mushroom/shared";
import type { AnyWsMessage } from "@mushroom/shared";
import type { CallMediaType, Conversation, Message } from "../types/chat";
import type { LoginUser } from "../types/user";
import type { ContactListItem } from "../types/user";
import type { WsUiState } from "../ws/WSClient";
import { getWSClient } from "../ws/index";
import {
  applyConversationDisplayFallbacks,
  applyConversationsPatch,
  applyMessagesPatch,
  deriveConversationSyncProgress,
  getConversationReadTargetSequence,
  getConversationSyncState,
  isActiveConversationViewportShowingLatestMessage,
  isAppWindowVisible,
  mergeMessageLists
} from "./useChatHelpers";
import { getConversationReadState } from "../http/api";
import { useChatCallSession } from "./useChatCallSession";
import { useMainCallRelay } from "./call/useMainCallRelay";
import { useChatNotifications } from "./useChatNotifications";
import { useChatOutgoing } from "./useChatOutgoing";
import { useChatSync } from "./useChatSync";
import { useChatConversationActions } from "./chat/useChatConversationActions";
import { useChatTitle } from "./chat/useChatTitle";
import { useChatTyping } from "./chat/useChatTyping";
import { useChatGroupActions } from "./chat/useChatGroupActions";
import { useChatMessageHistory } from "./chat/useChatMessageHistory";
import { useChatMessageActions } from "./chat/useChatMessageActions";
import { useChatPresence } from "./chat/useChatPresence";
import { webPresenceSubscriber } from "../services/presence-subscriber";

const AUTO_RETRY_LIMIT = 3;
const OUTGOING_RETRY_POLL_MS = 5000;
const FOREGROUND_SYNC_DEBOUNCE_MS = 10_000;
// 进入会话后等待 800ms 再触发服务端 read 同步：用户在窗口期内快速切走则取消，
// 用于避免"翻找会话"导致的 read HTTP 风暴。
const OPEN_CONVERSATION_READ_DWELL_MS = 800;
const APP_TITLE = "Mushroom IM";

export function useChat(loginUser: LoginUser | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation>();
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
  // 群已读高水位（仅当前活动会话保留，其他会话懒加载）：
  // Record<serverConversationId, Record<readerUserId, lastReadSeq>>。
  // renderer 热状态，由 Electron main 的本地缓存 + IPC 增量推送维护。
  const [groupReadStateByConversation, setGroupReadStateByConversation] =
    useState<Record<string, Record<number, number>>>({});
  const [wsUiState, setWsUiState] = useState<WsUiState>({
    status: "connecting",
    attempt: 0,
    maxAttempts: 5
  });
  const activeConversationRef = useRef<Conversation | undefined>(undefined);
  const wsUiStateRef = useRef<WsUiState>({
    status: "connecting",
    attempt: 0,
    maxAttempts: 5
  });
  const conversationsRef = useRef<Conversation[]>([]);
  const messagesRef = useRef<Record<string, Message[]>>({});
  const retryingOutgoingRef = useRef(false);
  const sendingOutgoingIdsRef = useRef(new Set<string>());
  const fetchingConversationsRef = useRef<Promise<Conversation[]> | null>(null);
  const queuedConversationRefreshRef = useRef(false);
  const bootstrappingChatSessionRef = useRef<Promise<void> | null>(null);
  const gapRepairInFlightRef = useRef<Promise<void> | null>(null);
  // 进入会话的 read 同步停留窗口：按 clientConversationId 取消上一次的待发任务。
  const pendingReadDwellRef = useRef<Map<string, number>>(new Map());
  const foregroundSyncInFlightRef = useRef<Promise<void> | null>(null);
  const lastForegroundSyncAtRef = useRef(0);
  const notifiedMessageIdsRef = useRef(new Set<string>());
  const notificationPermissionRequestedRef = useRef(false);
  const openConversationRef = useRef<
    ((conversation: Conversation) => Promise<void>) | null
  >(null);
  const foregroundReadSyncInFlightRef = useRef(false);

  const {
    userPresenceByUserId,
    mergePresenceEntries,
    refreshActivePeerPresence,
    resetDirectPresenceFetchCache
  } = useChatPresence({
    loginUser,
    activeConversationRef
  });
  const { typingByConversationId, handleTypingMessage } =
    useChatTyping(loginUser);

  const {
    setCurrentActiveConversation,
    applyConversationUpdate,
    reloadConversationMessages,
    fetchConversations,
    repairConversationGaps,
    syncConversationState,
    bootstrapChatSession,
    syncConversationRead,
    syncActiveConversationReadIfVisible
  } = useChatSync({
    loginUser,
    activeConversationRef,
    conversationsRef,
    fetchingConversationsRef,
    queuedConversationRefreshRef,
    bootstrappingChatSessionRef,
    gapRepairInFlightRef,
    foregroundReadSyncInFlightRef,
    setConversations,
    setActiveConversation,
    setMessages,
    setHasMore
  });

  const {
    ensureNotificationPermission,
    showIncomingNotification,
    clearConversationNotification
  } = useChatNotifications({
    loginUser,
    conversationsRef,
    notifiedMessageIdsRef,
    notificationPermissionRequestedRef,
    fetchConversations,
    openConversationRef
  });

  const {
    resendOutgoingMessages,
    runStartupRecovery,
    sendExistingMessage,
    handleSendMessage,
    handleSendFileMessage,
    handleRetryMessage,
    handleReselectAttachment,
    handleDeleteFailedMessage
  } = useChatOutgoing({
    loginUser,
    activeConversationRef,
    wsUiStateRef,
    sendingOutgoingIdsRef,
    retryingOutgoingRef,
    autoRetryLimit: AUTO_RETRY_LIMIT,
    applyConversationUpdate
  });

  const {
    callSession,
    localCallStream,
    remoteCallStream,
    groupParticipantMedia,
    groupLocalSpeaking,
    handleCallWsMessage,
    handleStartAudioCall: handleStartAudioCallLocal,
    handleStartVideoCall: handleStartVideoCallLocal,
    handleAcceptCall,
    handleRejectCall,
    handleEndCall,
    handleToggleLocalMedia,
    dismissCallSession
  } = useChatCallSession({
    loginUser,
    conversationsRef,
    wsUiStateRef
  });

  // 独立通话窗模式（Electron 且 preload 暴露 openCallWindow）：主窗只做
  // WS↔IPC 中转，通话媒体/UI 在独立通话窗运行（见
  // docs/architecture/realtime-call.md §12）。Web 浏览器端 openCallWindow
  // 不存在，relay 关闭，沿用主窗内 in-window 通话栈，行为不变。
  const callWindowMode = Boolean(window.electronAPI?.openCallWindow);
  const { relayInboundCallFrame, startCallViaWindow } = useMainCallRelay({
    enabled: callWindowMode
  });

  // Group-call member picker: starting an audio/video call from a group chat
  // opens a member picker (mirrors WhatsApp/WeChat) so the caller chooses whom
  // to invite instead of paging the entire (potentially huge) group. Direct
  // chats bypass the picker and call the peer immediately.
  const [callMemberPickerOpen, setCallMemberPickerOpen] = useState(false);
  const [callMemberPickerMediaType, setCallMemberPickerMediaType] = useState<
    1 | 2
  >(1);
  const [callMemberPickerConversationId, setCallMemberPickerConversationId] =
    useState<string | null>(null);

  const openCallMemberPicker = useCallback(
    (conversation: Conversation, mediaType: 1 | 2) => {
      if (conversation.type !== 2) {
        return false;
      }
      setCallMemberPickerMediaType(mediaType);
      setCallMemberPickerConversationId(conversation.client_conversation_id);
      setCallMemberPickerOpen(true);
      return true;
    },
    []
  );

  const closeCallMemberPicker = useCallback(() => {
    setCallMemberPickerOpen(false);
    setCallMemberPickerConversationId(null);
  }, []);

  // Resolve the picker's target conversation; falls back to the active one.
  const callMemberPickerConversation = callMemberPickerConversationId
    ? conversations.find(
        conversation =>
          conversation.client_conversation_id ===
            callMemberPickerConversationId ||
          conversation.server_conversation_id === callMemberPickerConversationId
      )
    : undefined;

  // 发起呼叫：群聊先弹成员选择器；通话窗模式转交通话窗执行；否则走本地
  // 通话栈（不变）。选中成员经 targetUserIds 传给下游。
  const startCallWithTargets = useCallback(
    async (
      conversation: Conversation,
      mediaType: CallMediaType,
      targetUserIds?: number[]
    ) => {
      if (
        callWindowMode &&
        startCallViaWindow(
          conversation.client_conversation_id,
          mediaType,
          targetUserIds
        )
      ) {
        return;
      }
      if (mediaType === 2) {
        await handleStartVideoCallLocal(conversation, { targetUserIds });
      } else {
        await handleStartAudioCallLocal(conversation, { targetUserIds });
      }
    },
    [
      callWindowMode,
      startCallViaWindow,
      handleStartAudioCallLocal,
      handleStartVideoCallLocal
    ]
  );

  const handleStartAudioCall = useCallback(
    async (conversation: Conversation) => {
      if (openCallMemberPicker(conversation, 1)) {
        return;
      }
      await startCallWithTargets(conversation, 1);
    },
    [openCallMemberPicker, startCallWithTargets]
  );
  const handleStartVideoCall = useCallback(
    async (conversation: Conversation) => {
      if (openCallMemberPicker(conversation, 2)) {
        return;
      }
      await startCallWithTargets(conversation, 2);
    },
    [openCallMemberPicker, startCallWithTargets]
  );

  const handlePickerStartCall = useCallback(
    (targetUserIds: number[]) => {
      if (!callMemberPickerConversation) {
        return;
      }
      void startCallWithTargets(
        callMemberPickerConversation,
        callMemberPickerMediaType,
        targetUserIds
      );
    },
    [
      callMemberPickerConversation,
      callMemberPickerMediaType,
      startCallWithTargets
    ]
  );

  const {
    handleRecallMessage,
    handleForwardMessage,
    handleBatchForwardOneByOne,
    handleBatchForwardMerged,
    handleSendTextToConversation,
    handleToggleFavoriteMessage,
    handleTogglePinMessage,
    handleLoadMessageCollections
  } = useChatMessageActions({
    loginUser,
    activeConversation,
    conversations,
    sendExistingMessage
  });

  const {
    handleAddGroupMembers,
    handleRemoveGroupMember,
    handleUpdateGroupMemberRole,
    handleLeaveGroupConversation,
    handleTransferGroupOwner,
    handleUpdateGroupProfile,
    handleUpdateGroupAnnouncement,
    handleUpdateGroupSettings,
    handleUpdateGroupMemberMute
  } = useChatGroupActions({
    activeConversation,
    syncConversationState
  });

  useEffect(() => {
    wsUiStateRef.current = wsUiState;
  }, [wsUiState]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useChatTitle({
    appTitle: APP_TITLE,
    activeConversation,
    conversations
  });

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  // 卸载时清理 open-conversation read 停留定时器，避免泄漏。
  useEffect(() => {
    const pendingTimers = pendingReadDwellRef.current;
    return () => {
      for (const timerId of pendingTimers.values()) {
        window.clearTimeout(timerId);
      }
      pendingTimers.clear();
    };
  }, []);

  useEffect(() => {
    if (!loginUser) return;

    (async () => {
      await bootstrapChatSession();
      void ensureNotificationPermission();
      // 启动恢复：把所有 status:1（发送中但进程已重启）归位为 -1，并 sweep
      // outbox 中孤儿文件。必须在打开 WS 之前完成，避免 status:1 旧消息被
      // 当做"正在发送"误判。
      await runStartupRecovery();
      await getWSClient();
    })();

    let removeConnectedHandler: (() => void) | undefined;
    let removeMessageHandler: (() => void) | undefined;
    let removeStatusHandler: (() => void) | undefined;
    const retryTimer = window.setInterval(() => {
      void resendOutgoingMessages();
    }, OUTGOING_RETRY_POLL_MS);
    const refreshAfterReconnect = async () => {
      const localConversations = await fetchConversations();
      refreshActivePeerPresence();
      const currentConversation = activeConversationRef.current;
      if (!currentConversation) {
        return;
      }

      const refreshedConversation = localConversations.find(
        item =>
          item.client_conversation_id ===
            currentConversation.client_conversation_id ||
          String(item.server_conversation_id) ===
            String(currentConversation.server_conversation_id)
      );

      if (!refreshedConversation) {
        // The conversation no longer exists locally (e.g. cleared while we
        // were offline). Drop the active selection so downstream effects do
        // not keep rendering a header / message list for a conversation
        // that is no longer in the sidebar.
        setCurrentActiveConversation(undefined);
        return;
      }

      // Update the active conversation reference in-place but DO NOT call
      // `reloadConversationMessages` here — the message-sync IPC payloads
      // emitted during the in-flight `runSyncOrchestrator` already patched
      // the message list. Forcing a reload here would replace the message
      // array reference and re-trigger the scroll-to-bottom effect, which
      // is the original cause of the post-reconnect viewport jitter.
      if (refreshedConversation !== currentConversation) {
        setCurrentActiveConversation(refreshedConversation);
      }
    };
    const handleWsMessage = (payload: AnyWsMessage) => {
      if (!loginUser) {
        return;
      }

      if (payload.messageClassify === "presence") {
        mergePresenceEntries([
          {
            user_id: Number(payload.user_id),
            is_online: Boolean(payload.is_online),
            active_device_count: Number(payload.active_device_count || 0),
            last_active_at: payload.last_active_at,
            observed_at: payload.observed_at
          }
        ]);
        return;
      }

      if (payload.messageClassify === "presence.snapshot") {
        // P2 服务端在 subscribe 后立即回推一次 snapshot，复用 presence 的合并路径
        if (Array.isArray(payload.entries) && payload.entries.length > 0) {
          mergePresenceEntries(
            payload.entries.map(entry => ({
              user_id: Number(entry.user_id),
              is_online: Boolean(entry.is_online),
              active_device_count: Number(entry.active_device_count || 0),
              last_active_at: entry.last_active_at,
              observed_at: entry.observed_at
            }))
          );
        }
        return;
      }

      if (handleTypingMessage(payload)) {
        return;
      }

      // 通话窗模式：把通话信令转发到独立通话窗，主窗不本地消费。
      if (callWindowMode) {
        if (relayInboundCallFrame(payload)) {
          return;
        }
      } else if (handleCallWsMessage(payload)) {
        return;
      }
    };
    let disposed = false;
    void getWSClient().then(ws => {
      if (disposed) {
        return;
      }

      ws.addStatusHandler(setWsUiState);
      ws.addMessageHandler(handleWsMessage);
      ws.addConnectedHandler(resendOutgoingMessages);
      ws.addConnectedHandler(refreshAfterReconnect);
      void resendOutgoingMessages();
      removeConnectedHandler = () => {
        ws.removeConnectedHandler(resendOutgoingMessages);
        ws.removeConnectedHandler(refreshAfterReconnect);
      };
      removeMessageHandler = () => {
        ws.removeMessageHandler(handleWsMessage);
      };
      removeStatusHandler = () => {
        ws.removeStatusHandler(setWsUiState);
      };
    });

    const unsubscribeMsgAddedEvent = window.electronAPI.onMessageAdded(
      async (message: Message) => {
        const isActiveConversation =
          activeConversationRef.current?.client_conversation_id ===
          message.client_conversation_id;
        const isIncoming = message.sender_id !== loginUser.userId;
        const isMentioned =
          isIncoming && isMentioningUser(message.content, loginUser.userId);
        const currentConversation = conversationsRef.current.find(
          conversation =>
            conversation.client_conversation_id ===
            message.client_conversation_id
        );
        const existingMessages =
          messagesRef.current[message.client_conversation_id] || [];
        const isDuplicateMessage = hasMatchingMessage(
          existingMessages,
          message
        );
        const nextLocalMessages = mergeMessageLists(existingMessages, [
          message
        ]);
        const nextConversationProgress = currentConversation
          ? deriveConversationSyncProgress(
              currentConversation,
              nextLocalMessages,
              Number(message.sequence || 0)
            )
          : null;
        const activeConversationProgress =
          isActiveConversation && activeConversationRef.current
            ? deriveConversationSyncProgress(
                activeConversationRef.current,
                nextLocalMessages,
                Number(message.sequence || 0)
              )
            : null;
        const shouldAutoRead =
          isIncoming &&
          isActiveConversation &&
          isAppWindowVisible() &&
          isActiveConversationViewportShowingLatestMessage() &&
          !!activeConversationProgress &&
          Number(message.sequence || 0) > 0 &&
          activeConversationProgress.last_sync_sequence >=
            Number(message.sequence || 0) &&
          activeConversationProgress.sync_gap_detected === 0;
        const shouldNotify =
          isIncoming && (!isActiveConversation || !isAppWindowVisible());
        let readResult: {
          read_seq: number;
          unread_count: number;
        } | null = null;

        if (shouldAutoRead) {
          const activeConv = activeConversationRef.current;
          if (activeConv && activeConversationProgress) {
            readResult = await syncConversationRead(
              {
                ...activeConv,
                ...activeConversationProgress
              },
              activeConversationProgress.last_sync_sequence
            );
            if (readResult) {
              activeConversationRef.current = {
                ...activeConv,
                ...activeConversationProgress,
                last_read_sequence: readResult.read_seq,
                unread_count: readResult.unread_count,
                mention_unread_count:
                  readResult.unread_count === 0
                    ? 0
                    : activeConv.mention_unread_count
              };
            }
          }
        }

        setMessages(prev => ({
          ...prev,
          [message.client_conversation_id]: mergeMessageLists(
            prev[message.client_conversation_id] || [],
            [message]
          )
        }));

        applyConversationUpdate(message.client_conversation_id, conv => {
          const nextProgress = deriveConversationSyncProgress(
            conv,
            nextLocalMessages,
            Number(message.sequence || 0)
          );
          const nextReadSequence = shouldAutoRead
            ? Math.max(
                Number(readResult?.read_seq || 0),
                Number(conv.last_read_sequence || 0)
              )
            : !isIncoming
              ? Math.max(
                  Number(conv.last_read_sequence || 0),
                  Number(nextProgress.last_sync_sequence || 0)
                )
              : Number(conv.last_read_sequence || 0);
          return {
            ...conv,
            last_message_content: message.content,
            last_message_time: message.created_at,
            last_message_send_id: message.sender_id,
            is_archived: 0,
            draft: isIncoming ? conv.draft : "",
            ...nextProgress,
            last_read_sequence: nextReadSequence,
            unread_count: getNextUnreadCount({
              currentUnreadCount: conv.unread_count,
              isIncoming,
              shouldMarkRead: shouldAutoRead,
              isDuplicate: isDuplicateMessage
            }),
            mention_unread_count: getNextMentionUnreadCount({
              currentMentionUnreadCount: conv.mention_unread_count,
              isIncoming,
              shouldMarkRead: shouldAutoRead,
              isDuplicate: isDuplicateMessage,
              mentionMe: isMentioned
            })
          };
        });

        if (shouldNotify) {
          void showIncomingNotification(message, isMentioned);
        }

        if (shouldAutoRead || isActiveConversation) {
          void clearConversationNotification(message.client_conversation_id);
        }

        if (nextConversationProgress?.sync_gap_detected) {
          void repairConversationGaps({
            clientConversationId: message.client_conversation_id,
            limit: 1
          });
        }
      }
    );

    const unsubscribeMsgUpdatedEvent = window.electronAPI.onMessageUpdated(
      (msg: Message) => {
        setMessages(prev => ({
          ...prev,
          [msg.client_conversation_id]: mergeMessageLists(
            prev[msg.client_conversation_id] || [],
            [msg]
          )
        }));

        const nextLocalMessages = mergeMessageLists(
          messagesRef.current[msg.client_conversation_id] || [],
          [msg]
        );
        const currentConversation = conversationsRef.current.find(
          conversation =>
            conversation.client_conversation_id === msg.client_conversation_id
        );
        const nextConversationProgress = currentConversation
          ? deriveConversationSyncProgress(
              currentConversation,
              nextLocalMessages,
              Number(msg.sequence || 0)
            )
          : null;

        applyConversationUpdate(msg.client_conversation_id, conv => {
          const { lastServerSequence } = getConversationSyncState(conv);
          const nextProgress = deriveConversationSyncProgress(
            conv,
            nextLocalMessages,
            Number(msg.sequence || 0)
          );

          return {
            ...conv,
            ...(Number(msg.sequence || 0) >= lastServerSequence
              ? {
                  last_message_content: msg.content,
                  last_message_time: msg.updated_at || msg.created_at,
                  last_message_send_id: msg.sender_id
                }
              : {}),
            ...nextProgress,
            last_read_sequence:
              msg.sender_id === loginUser.userId
                ? Math.max(
                    Number(conv.last_read_sequence || 0),
                    Number(nextProgress.last_sync_sequence || 0)
                  )
                : conv.last_read_sequence
          };
        });

        if (nextConversationProgress?.sync_gap_detected) {
          void repairConversationGaps({
            clientConversationId: msg.client_conversation_id,
            limit: 1
          });
        }
      }
    );

    const handleContactSync = () => {
      void fetchConversations();
    };
    window.addEventListener("im:contacts-sync", handleContactSync);
    // ---- 群已读高水位订阅（main → renderer 增量推送） ----
    const unsubscribeGroupReadEvent = window.electronAPI.onGroupReadUpdate?.(
      payload => {
        if (!payload?.serverConversationId) return;
        const convId = String(payload.serverConversationId);
        setGroupReadStateByConversation(prev => {
          const bucket = { ...(prev[convId] ?? {}) };
          let changed = false;
          if (Array.isArray(payload.bulk)) {
            for (const item of payload.bulk) {
              const readerId = Number(item.readerUserId);
              const seq = Number(item.lastReadSeq);
              if (readerId <= 0 || seq <= 0) continue;
              if (seq > (bucket[readerId] ?? 0)) {
                bucket[readerId] = seq;
                changed = true;
              }
            }
          } else {
            const readerId = Number(payload.readerUserId ?? 0);
            const seq = Number(payload.lastReadSeq ?? 0);
            if (readerId > 0 && seq > 0 && seq > (bucket[readerId] ?? 0)) {
              bucket[readerId] = seq;
              changed = true;
            }
          }
          if (!changed) return prev;
          return { ...prev, [convId]: bucket };
        });
      }
    );
    // 整页 reload 后 renderer 的 React state 被清空，但 main 进程缓存仍存活。
    // 启动时一次性回灌全部会话的群已读高水位，使未点开的群会话也能立即恢复
    // 双勾，无需等用户点开触发服务端 read-state 拉取。合并逻辑与上方增量推送
    // 一致（单调推进，只升不降）；web/mobile 无 electronAPI 时可选链降级为 no-op。
    void window.electronAPI
      .getAllGroupReadStates?.()
      .then(snapshot => {
        if (disposed || !snapshot) return;
        setGroupReadStateByConversation(prev => {
          let touched = false;
          const next = { ...prev };
          for (const [convId, bucket] of Object.entries(snapshot)) {
            const merged = { ...(next[convId] ?? {}) };
            let changed = false;
            for (const [readerIdRaw, seqRaw] of Object.entries(bucket)) {
              const readerId = Number(readerIdRaw);
              const seq = Number(seqRaw);
              if (readerId <= 0 || seq <= 0) continue;
              if (seq > (merged[readerId] ?? 0)) {
                merged[readerId] = seq;
                changed = true;
              }
            }
            if (changed) {
              next[convId] = merged;
              touched = true;
            }
          }
          return touched ? next : prev;
        });
      })
      .catch(err => {
        log.warn("[useChat] seed group read-state on startup failed", err);
      });
    const unsubscribeConvSyncEvent = window.electronAPI.onConversationSync(
      payload => {
        // Legacy path: no payload → caller cannot tell us what changed, so
        // refresh the entire list. This branch is preserved for backward
        // compatibility with older preload builds during a single release
        // window and should be removed once all clients ship the diff
        // payload.
        if (!payload) {
          log.debug(
            "conversation-sync received without payload; falling back to full refresh"
          );
          void fetchConversations();
          return;
        }

        if (
          payload.allConversationsAffected ||
          (payload.removedClientConversationIds?.length ?? 0) > 0
        ) {
          void fetchConversations();
          return;
        }

        const affectedIds = payload.affectedClientConversationIds ?? [];
        if (affectedIds.length === 0) {
          // Pure side-effect emit (e.g. analytics tag) — nothing to do.
          return;
        }

        // Targeted: re-read just the affected conversations from disk and
        // patch them into state without disturbing the active message
        // viewport. Re-run the display fallback so that local contact remark
        // overrides are applied consistently with the full-refresh path.
        void (async () => {
          try {
            const [fresh, localContacts] = await Promise.all([
              window.electronAPI.getConversations(true),
              window.electronAPI
                .getContacts()
                .catch(() => [] as ContactListItem[])
            ]);
            const freshById = new Map(
              fresh.map(item => [item.client_conversation_id, item])
            );
            const rawUpdates = affectedIds
              .map(id => freshById.get(id))
              .filter((item): item is Conversation => Boolean(item));
            if (rawUpdates.length === 0) {
              return;
            }
            const updates = applyConversationDisplayFallbacks(
              rawUpdates,
              localContacts,
              loginUser
            );
            const updatesById = new Map(
              updates.map(item => [item.client_conversation_id, item])
            );
            setConversations(prev => applyConversationsPatch(prev, updates));
            setActiveConversation(prev => {
              if (!prev) return prev;
              const refreshed = updatesById.get(prev.client_conversation_id);
              if (!refreshed) return prev;
              activeConversationRef.current = refreshed;
              return refreshed;
            });
          } catch (err) {
            log.warn(
              "conversation-sync targeted refresh failed; UI may be stale",
              err
            );
          }
        })();
      }
    );
    const unsubscribeMsgSyncEvent = window.electronAPI.onMessageSync(
      payload => {
        // Legacy path: no payload → fall back to the original "reload active
        // conversation from disk" behaviour. This is what causes the visible
        // scroll jitter post-sync, so we only keep it for one release window.
        if (!payload) {
          log.debug(
            "message-sync received without payload; falling back to full reload"
          );
          void fetchConversations()
            .then(convs => {
              const current = activeConversationRef.current;
              if (!current) {
                return;
              }
              const refreshed = convs.find(
                item =>
                  item.client_conversation_id === current.client_conversation_id
              );
              if (refreshed) {
                void reloadConversationMessages(refreshed);
              }
            })
            .catch(err => {
              log.warn("legacy message-sync fallback fetch failed", err);
            });
          return;
        }

        if (payload.affectsMultipleConversations) {
          // Bulk handlers (e.g. message-state sync) cannot give us per-row diffs
          // for individual conversations. Refresh the conversation metadata so
          // unread counts/sequences are correct, but never touch the active
          // message viewport — there is nothing actionable to splice in.
          void fetchConversations();
          return;
        }

        const conversationId = payload.clientConversationId;
        if (!conversationId) {
          return;
        }

        // Always patch in-memory messages first so the renderer reflects the
        // new state without unmounting message rows. We rely on
        // `applyMessagesPatch` returning the previous reference when nothing
        // actually changed to avoid re-triggering the message-list scroll
        // effect.
        setMessages(prev => applyMessagesPatch(prev, payload));

        // Then re-read just this conversation's metadata so unread/preview
        // stay coherent with the message rows we just inserted.
        void window.electronAPI
          .getConversations(true)
          .then(allConversations => {
            const refreshed = allConversations.find(
              item => item.client_conversation_id === conversationId
            );
            if (!refreshed) {
              return;
            }
            setConversations(prev =>
              applyConversationsPatch(prev, [refreshed])
            );
            setActiveConversation(prev => {
              if (!prev || prev.client_conversation_id !== conversationId) {
                return prev;
              }
              activeConversationRef.current = refreshed;
              return refreshed;
            });
          })
          .catch(err => {
            log.warn(
              "message-sync metadata refresh failed; conversation list may be stale",
              err
            );
          });
      }
    );

    return () => {
      disposed = true;
      unsubscribeMsgAddedEvent();
      unsubscribeConvSyncEvent();
      unsubscribeGroupReadEvent?.();
      unsubscribeMsgSyncEvent();
      unsubscribeMsgUpdatedEvent();
      removeConnectedHandler?.();
      removeMessageHandler?.();
      removeStatusHandler?.();
      window.removeEventListener("im:contacts-sync", handleContactSync);
      window.clearInterval(retryTimer);
    };
  }, [
    applyConversationUpdate,
    bootstrapChatSession,
    ensureNotificationPermission,
    fetchConversations,
    callWindowMode,
    relayInboundCallFrame,
    handleCallWsMessage,
    handleTypingMessage,
    loginUser,
    mergePresenceEntries,
    refreshActivePeerPresence,
    resendOutgoingMessages,
    runStartupRecovery,
    reloadConversationMessages,
    repairConversationGaps,
    setCurrentActiveConversation,
    showIncomingNotification,
    clearConversationNotification,
    syncActiveConversationReadIfVisible,
    syncConversationRead,
    syncConversationState
  ]);

  useEffect(() => {
    if (!loginUser) {
      return;
    }

    const recoverForegroundState = async () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      const now = Date.now();
      if (foregroundSyncInFlightRef.current) {
        return foregroundSyncInFlightRef.current;
      }
      if (now - lastForegroundSyncAtRef.current < FOREGROUND_SYNC_DEBOUNCE_MS) {
        return;
      }

      lastForegroundSyncAtRef.current = now;
      const recoveryPromise = (async () => {
        resetDirectPresenceFetchCache();
        refreshActivePeerPresence();

        if (wsUiStateRef.current.status !== "connected") {
          const ws = await getWSClient();
          ws.retryConnection();
        }

        // Avoid `syncConversationState(activeServerConversationId)` here:
        // it would call `reloadConversationMessages` on the active
        // conversation and reset the message list reference, re-triggering
        // the scroll-to-bottom effect every time the window gains focus.
        // The WS reconnect + IPC payload pipeline already keeps both the
        // conversation list and the active message viewport in sync.
        //
        // We DO still trigger gap-repair on the active conversation: it
        // only runs backfill jobs when `local_conversations` already has
        // `sync_gap_detected = 1` / `needs_backfill = 1`, so it is a no-op
        // unless we are actually missing history. This protects users who
        // focus the window after a long offline period before the WS
        // orchestrator has had a chance to flag gaps.
        const activeConversation = activeConversationRef.current;
        if (activeConversation?.client_conversation_id) {
          await repairConversationGaps({
            clientConversationId: activeConversation.client_conversation_id,
            limit: 1
          }).catch(err => {
            log.warn("foreground gap-repair failed", err);
          });
        }

        await syncActiveConversationReadIfVisible();
      })().finally(() => {
        foregroundSyncInFlightRef.current = null;
      });

      foregroundSyncInFlightRef.current = recoveryPromise;
      return recoveryPromise;
    };

    const handleVisibilityRecovery = () => {
      void recoverForegroundState();
    };

    window.addEventListener("focus", handleVisibilityRecovery);
    document.addEventListener("visibilitychange", handleVisibilityRecovery);

    return () => {
      window.removeEventListener("focus", handleVisibilityRecovery);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityRecovery
      );
    };
  }, [
    loginUser,
    refreshActivePeerPresence,
    repairConversationGaps,
    resetDirectPresenceFetchCache,
    syncActiveConversationReadIfVisible
  ]);

  useEffect(() => {
    if (!loginUser) {
      foregroundSyncInFlightRef.current = null;
      lastForegroundSyncAtRef.current = 0;
    }
  }, [loginUser]);

  useEffect(() => {
    if (!loginUser || !activeConversation) {
      return;
    }

    // 进入会话时的 presence 刷新策略：
    //   - WS 已连：服务端会在我们对该 peer 发起 presence.subscribe 后立刻回推一次
    //     `presence.snapshot`（见 web-presence-subscriber 与 server `handlePresenceSubscribe`），
    //     这是权威且最新的状态；此处再发一次 HTTP /presence-batch 反而会引入"HTTP(stale=false)
    //     先到、WS snapshot(true) 后到"或反向的乱序覆盖（mergePresenceSummary 已加 observed_at
    //     单调性保护，但避免无谓的额外请求仍是更干净的方案），故跳过。
    //   - WS 未连（断线、首次握手未完成）：才走 HTTP 兜底，避免空白 header。
    //
    // 同时下线"5min 轻量轮询兜底"——P2 引入按需订阅 + 服务端 transition 主动推送后已无必要，
    // 保留只会增加无意义流量并放大乱序窗口。
    if (wsUiStateRef.current.status !== "connected") {
      refreshActivePeerPresence({ force: true });
    }
  }, [activeConversation, loginUser, refreshActivePeerPresence]);

  // P2 按需订阅：会话列表中所有 1-on-1 peer 纳入 list scope 订阅
  useEffect(() => {
    if (!loginUser) {
      webPresenceSubscriber.syncList([]);
      return;
    }

    const peerIds = new Set<number>();
    for (const conversation of conversations) {
      if (conversation.type !== 1) continue;
      const peerId = Number(conversation.peer_id || 0);
      if (Number.isFinite(peerId) && peerId > 0) {
        peerIds.add(peerId);
      }
    }
    webPresenceSubscriber.syncList(peerIds);

    // 故意不在 cleanup 里清空 list scope：deps 中含 conversations，
    // 每次列表变化都会触发 cleanup，再调 syncList(peerIds)。若 cleanup 先
    // syncList([])，共享层 applyScope 的差量 diff 就会退化为全量 unsub→sub。
    // 登出/loginUser 失效已由上方分支显式清空。
  }, [loginUser, conversations]);

  // P2 按需订阅：进入会话详情即声明对该 peer 的兴趣
  useEffect(() => {
    if (!loginUser || !activeConversation || activeConversation.type !== 1) {
      webPresenceSubscriber.syncConversation(null);
      return;
    }

    const peerId = Number(activeConversation.peer_id || 0);
    if (!Number.isFinite(peerId) || peerId <= 0) {
      webPresenceSubscriber.syncConversation(null);
      return;
    }

    webPresenceSubscriber.syncConversation(peerId);

    return () => {
      webPresenceSubscriber.syncConversation(null);
    };
  }, [loginUser, activeConversation]);

  useEffect(() => {
    if (!loginUser || !activeConversation) {
      return;
    }

    const handleScrollReadRecovery = () => {
      if (isActiveConversationViewportShowingLatestMessage()) {
        void syncActiveConversationReadIfVisible();
      }
    };

    const container = document.querySelector<HTMLElement>(".im-message-scroll");
    if (!container) {
      return;
    }

    container.addEventListener("scroll", handleScrollReadRecovery, {
      passive: true
    });

    return () => {
      container.removeEventListener("scroll", handleScrollReadRecovery);
    };
  }, [activeConversation, loginUser, syncActiveConversationReadIfVisible]);

  useEffect(() => {
    if (!loginUser) {
      return;
    }

    // Event-driven gap repair. We no longer poll every 15s.
    // The actual triggers live elsewhere:
    //   - WS reconnect: `WSClient.handleConnected` runs the sync
    //     orchestrator, which flips `sync_gap_detected` when needed.
    //   - WS push for a new message: `onMessageAdded` / `onMessageUpdated`
    //     above flip `sync_gap_detected` and immediately call
    //     `repairConversationGaps`.
    //   - Opening a conversation: `openConversation` repairs on entry.
    //   - Scroll-to-top: `loadMoreMessages` fetches older history.
    //
    // This effect adds two safety nets:
    //   1. A 60s fallback tick that drains any backfill jobs that were
    //      enqueued but never serviced (e.g. failed network call, app
    //      went offline mid-repair).
    //   2. A "visible again" trigger so we recover quickly after the
    //      tab was hidden or the OS suspended us.
    const FALLBACK_INTERVAL_MS = 60_000;

    const runGapRepair = () => {
      if (wsUiStateRef.current.status !== "connected") {
        return;
      }
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      void repairConversationGaps();
    };

    runGapRepair();
    const fallbackTimer = window.setInterval(
      runGapRepair,
      FALLBACK_INTERVAL_MS
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runGapRepair();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(fallbackTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loginUser, repairConversationGaps]);

  const openConversation = useCallback(
    async (conversation: Conversation) => {
      void clearConversationNotification(conversation.client_conversation_id);
      let targetConversation = conversation;
      if (Number(conversation.sync_gap_detected || 0) === 1) {
        await repairConversationGaps({
          clientConversationId: conversation.client_conversation_id,
          limit: 1,
          refreshLocalConversations: true
        });
        const refreshedConversations = await fetchConversations();
        targetConversation =
          refreshedConversations.find(
            item =>
              item.client_conversation_id ===
              conversation.client_conversation_id
          ) ?? conversation;
      }
      setCurrentActiveConversation(targetConversation);

      // 群会话：进入时拉一次服务端 read-state 作为冷启动基线，
      // 增量更新由 WS group_read → main IPC bulkApply → group-read-update 推送维持。
      // 与 packages/app-core/.../read-receipt-service.ts 共享 refreshGroupReadState
      // 实现，避免双端重复维护请求 + 归一化逻辑。
      if (
        Number(targetConversation.type) !== 1 &&
        targetConversation.server_conversation_id
      ) {
        const serverConvId = String(targetConversation.server_conversation_id);
        void refreshGroupReadState({
          serverConversationId: serverConvId,
          fetchReadState: id => getConversationReadState(id),
          applyEntries: async (id, entries) => {
            await window.electronAPI.bulkApplyGroupRead?.({
              serverConversationId: id,
              entries
            });
          },
          onError: err => {
            log.warn(
              "[useChat] refresh group read-state failed",
              serverConvId,
              err
            );
          }
        });
      }

      // P0: 取消其他会话尚未触发的 read 停留任务，仅保留当前会话的调度。
      for (const [
        pendingClientConversationId,
        timerId
      ] of pendingReadDwellRef.current.entries()) {
        if (
          pendingClientConversationId !==
          targetConversation.client_conversation_id
        ) {
          window.clearTimeout(timerId);
          pendingReadDwellRef.current.delete(pendingClientConversationId);
        }
      }

      const targetReadSequence =
        getConversationReadTargetSequence(targetConversation);
      const knownReadSequence = Number(
        targetConversation.last_read_sequence || 0
      );
      const shouldScheduleRead =
        targetReadSequence > 0 && targetReadSequence > knownReadSequence;

      if (shouldScheduleRead) {
        // 取消同一会话的上一次待发任务（用户在窗口内再次点击同会话视为重置计时）。
        const existingTimer = pendingReadDwellRef.current.get(
          targetConversation.client_conversation_id
        );
        if (existingTimer !== undefined) {
          window.clearTimeout(existingTimer);
        }
        const timerId = window.setTimeout(() => {
          pendingReadDwellRef.current.delete(
            targetConversation.client_conversation_id
          );
          // 只有当用户仍停留在该会话时才发送 read，避免快速切走还触发。
          const currentActive = activeConversationRef.current;
          if (
            !currentActive ||
            currentActive.client_conversation_id !==
              targetConversation.client_conversation_id
          ) {
            return;
          }
          void (async () => {
            const readResult = await syncConversationRead(
              targetConversation,
              targetReadSequence
            );
            if (readResult) {
              applyConversationUpdate(
                targetConversation.client_conversation_id,
                conv => ({
                  ...conv,
                  unread_count: readResult.unread_count,
                  mention_unread_count:
                    readResult.unread_count === 0
                      ? 0
                      : conv.mention_unread_count,
                  last_read_sequence: Math.max(
                    Number(conv.last_read_sequence || 0),
                    Number(readResult.read_seq || 0)
                  )
                })
              );
            }
          })();
        }, OPEN_CONVERSATION_READ_DWELL_MS);
        pendingReadDwellRef.current.set(
          targetConversation.client_conversation_id,
          timerId
        );
      }

      await reloadConversationMessages(targetConversation);
    },
    [
      applyConversationUpdate,
      clearConversationNotification,
      fetchConversations,
      reloadConversationMessages,
      repairConversationGaps,
      setCurrentActiveConversation,
      syncConversationRead
    ]
  );
  openConversationRef.current = openConversation;

  const handleConversationSelect = useCallback(
    async (conversation: Conversation) => {
      await openConversation(conversation);
    },
    [openConversation]
  );

  const {
    loadMoreMessages,
    handleSearchMessages,
    handleJumpToMessage,
    handleLoadConversationMedia
  } = useChatMessageHistory({
    activeConversation,
    activeConversationRef,
    conversations,
    conversationsRef,
    messages,
    isLoadingMore,
    setIsLoadingMore,
    setHasMore,
    setMessages,
    openConversation
  });

  const {
    handleDeleteConversation,
    handleClearConversation,
    handleDisbandGroupConversation,
    handleUpdateConversationState,
    handleConversationDraftChange
  } = useChatConversationActions({
    activeConversation,
    activeConversationRef,
    setActiveConversation,
    applyConversationUpdate,
    clearConversationNotification,
    fetchConversations,
    reloadConversationMessages,
    setCurrentActiveConversation,
    syncConversationState
  });

  const handleRetryConnection = async () => {
    const ws = await getWSClient();
    ws.retryConnection();
  };

  return {
    conversations,
    activeConversation,
    userPresenceByUserId,
    typingByConversationId,
    groupReadStateByConversation,
    loadMoreMessages,
    messages,
    handleConversationSelect,
    handleJumpToMessage,
    handleLoadConversationMedia,
    handleSearchMessages,
    handleSendFileMessage,
    handleSendMessage,
    handleStartAudioCall,
    handleStartVideoCall,
    handleRecallMessage,
    handleRetryMessage,
    handleReselectAttachment,
    handleDeleteFailedMessage,
    handleForwardMessage,
    handleBatchForwardOneByOne,
    handleBatchForwardMerged,
    handleSendTextToConversation,
    handleToggleFavoriteMessage,
    handleTogglePinMessage,
    handleLoadMessageCollections,
    handleAddGroupMembers,
    handleRemoveGroupMember,
    handleUpdateGroupMemberRole,
    handleLeaveGroupConversation,
    handleTransferGroupOwner,
    handleUpdateGroupProfile,
    handleUpdateGroupAnnouncement,
    handleUpdateGroupSettings,
    handleUpdateGroupMemberMute,
    handleDeleteConversation,
    handleClearConversation,
    handleDisbandGroupConversation,
    handleUpdateConversationState,
    handleConversationDraftChange,
    handleRetryConnection,
    handleAcceptCall,
    handleRejectCall,
    handleEndCall,
    handleToggleLocalMedia,
    dismissCallSession,
    isLoadingMore,
    hasMore,
    wsUiState,
    callSession,
    localCallStream,
    remoteCallStream,
    groupParticipantMedia,
    groupLocalSpeaking,
    // Exposed so the GroupManageModal can issue a single best-effort
    // fallback sync after a successful save. The per-handler proactive
    // syncs were removed to prevent request floods; this covers the WS
    // reconnect gap between HTTP response and the conversation.sync
    // outbox event reaching the actor.
    syncConversationState,
    // Group-call member picker wiring (Home.tsx renders the modal).
    callMemberPickerOpen,
    callMemberPickerMediaType,
    callMemberPickerConversation,
    closeCallMemberPicker,
    handlePickerStartCall
  };
}
