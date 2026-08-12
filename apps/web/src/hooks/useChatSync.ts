import {
  useCallback,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from "react";
import log from "@/utils/log";
import type { Conversation, Message } from "../types/chat";
import type { ContactListItem, LoginUser } from "../types/user";
import {
  fetchConversationTailMessages,
  fetchRemoteContacts,
  fetchRemoteMessages
} from "../sync/syncContext";
import { runSyncOrchestrator } from "../sync/orchestrator";
import { markConversationRead as markConversationReadRequest } from "../http/api";
import {
  applyConversationDisplayFallbacks,
  getConversationReadTargetSequence,
  isActiveConversationViewportShowingLatestMessage,
  isAppWindowVisible
} from "./useChatHelpers";
import { sortMessagesForTimeline } from "../utils/messageTimeline";
import { areConversationRenderFieldsEqual } from "./messagePatch";

/**
 * Combine a freshly fetched conversation list with the previous renderer
 * state so that unchanged conversations keep their previous identity. This
 * lets `React.memo` consumers (sidebar items, headers) and `useEffect`
 * dependency arrays bail out when nothing they care about actually
 * changed, eliminating spurious re-renders and message-list scroll
 * resets when sync completes.
 */
function mergeFetchedConversations(
  previous: Conversation[],
  next: Conversation[]
): Conversation[] {
  if (previous.length === 0) {
    return next;
  }
  const previousMap = new Map(
    previous.map(conversation => [
      conversation.client_conversation_id,
      conversation
    ])
  );
  let dirty = previous.length !== next.length;
  const merged = next.map(conversation => {
    const prevConversation = previousMap.get(
      conversation.client_conversation_id
    );
    if (!prevConversation) {
      dirty = true;
      return conversation;
    }
    if (areConversationsRenderEqual(prevConversation, conversation)) {
      return prevConversation;
    }
    dirty = true;
    return conversation;
  });

  if (!dirty) {
    // Even ordering matched — verify and bail out.
    let orderMatches = true;
    for (let index = 0; index < previous.length; index += 1) {
      if (
        previous[index].client_conversation_id !==
        next[index].client_conversation_id
      ) {
        orderMatches = false;
        break;
      }
    }
    if (orderMatches) {
      return previous;
    }
  }
  return merged;
}

function areConversationsRenderEqual(a: Conversation, b: Conversation) {
  return areConversationRenderFieldsEqual(a, b);
}

type UseChatSyncOptions = {
  loginUser: LoginUser | null;
  activeConversationRef: RefObject<Conversation | undefined>;
  conversationsRef: RefObject<Conversation[]>;
  fetchingConversationsRef: RefObject<Promise<Conversation[]> | null>;
  queuedConversationRefreshRef: RefObject<boolean>;
  bootstrappingChatSessionRef: RefObject<Promise<void> | null>;
  gapRepairInFlightRef: RefObject<Promise<void> | null>;
  foregroundReadSyncInFlightRef: RefObject<boolean>;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setActiveConversation: Dispatch<SetStateAction<Conversation | undefined>>;
  setMessages: Dispatch<SetStateAction<Record<string, Message[]>>>;
  setHasMore: Dispatch<SetStateAction<Record<string, boolean>>>;
};

export function useChatSync({
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
}: UseChatSyncOptions) {
  const setCurrentActiveConversation = useCallback(
    (conversation: Conversation | undefined) => {
      activeConversationRef.current = conversation;
      setActiveConversation(conversation);
    },
    [activeConversationRef, setActiveConversation]
  );

  const applyConversationUpdate = useCallback(
    (
      clientConversationId: string,
      updater: (conversation: Conversation) => Conversation
    ) => {
      setConversations(prev =>
        prev.map(conversation =>
          conversation.client_conversation_id === clientConversationId
            ? updater(conversation)
            : conversation
        )
      );

      setActiveConversation(prev => {
        if (!prev || prev.client_conversation_id !== clientConversationId) {
          return prev;
        }
        const nextConversation = updater(prev);
        activeConversationRef.current = nextConversation;
        return nextConversation;
      });
    },
    [activeConversationRef, setActiveConversation, setConversations]
  );

  const reloadConversationMessages = useCallback(
    async (conversation: Conversation) => {
      let data = await window.electronAPI.getMessages(
        conversation.client_conversation_id,
        50,
        undefined
      );
      const syncAnchor = Math.max(
        Number(conversation.last_sync_sequence || 0),
        Number(conversation.tail_loaded_to_seq || 0),
        Number(conversation.local_hidden_before_seq || 0)
      );
      if (
        data.length === 0 &&
        Number(conversation.server_conversation_id || 0) > 0 &&
        Number(conversation.last_server_sequence || 0) > syncAnchor
      ) {
        await fetchConversationTailMessages(
          String(conversation.server_conversation_id),
          conversation.client_conversation_id
        );
        data = await window.electronAPI.getMessages(
          conversation.client_conversation_id,
          50,
          undefined
        );
      }
      setMessages(prev => ({
        ...prev,
        [conversation.client_conversation_id]: sortMessagesForTimeline(data)
      }));
      setHasMore(prev => ({
        ...prev,
        [conversation.client_conversation_id]:
          data.length === 50 || Number(conversation.history_complete || 0) === 0
      }));
      // 仅当本地仍可能存在未拉取的更老历史时，才允许触发上拉加载：
      //   - data 满 50 条：本地必然还有更老历史可读；
      //   - 否则要求 history_complete === 0 AND
      //       tail_loaded_from_seq 不与 local_hidden_before_seq 严格相邻
      //     （即真正存在「清空 cutoff -> tail 起点」之间的 seq 缺口）。
      // 这样在「清空聊天 + 后续到达的新消息存在 seq 缺口」场景下，
      // 不会因 history_complete=0 就误判 hasMore=true 而触发幻影 loading。
      const tailFrom = Number(conversation.tail_loaded_from_seq || 0);
      const hiddenFloor = Number(conversation.local_hidden_before_seq || 0);
      const historyComplete = Number(conversation.history_complete || 0);
      const hasUpstreamGap =
        historyComplete === 0 && (tailFrom === 0 || tailFrom > hiddenFloor + 1);
      setHasMore(prev => ({
        ...prev,
        [conversation.client_conversation_id]:
          data.length === 50 || hasUpstreamGap
      }));
    },
    [setHasMore, setMessages]
  );

  const fetchConversations = useCallback(async () => {
    if (fetchingConversationsRef.current) {
      queuedConversationRefreshRef.current = true;
      return fetchingConversationsRef.current;
    }

    const refreshPromise = (async () => {
      try {
        const [rawConversations, initialContacts] = await Promise.all([
          window.electronAPI.getConversations(true),
          window.electronAPI.getContacts().catch(() => [] as ContactListItem[])
        ]);
        let localContacts = initialContacts;
        if (
          localContacts.length === 0 &&
          rawConversations.some(conversation => conversation.type === 1)
        ) {
          const nextContactsSync = await fetchRemoteContacts().catch(
            () => null
          );
          if (nextContactsSync) {
            await window.electronAPI.updateLastSyncTime(
              "contacts",
              nextContactsSync
            );
            localContacts = await window.electronAPI
              .getContacts()
              .catch(() => [] as ContactListItem[]);
          }
        }
        const convs = applyConversationDisplayFallbacks(
          rawConversations,
          localContacts,
          loginUser
        );
        log.debug(`Fetched conversations: count=${convs.length}`);
        setConversations(prev => mergeFetchedConversations(prev, convs));
        setActiveConversation(prev => {
          if (!prev) {
            return prev;
          }
          const nextConversation = convs.find(
            item => item.client_conversation_id === prev.client_conversation_id
          );
          activeConversationRef.current = nextConversation;
          return nextConversation;
        });
        return convs;
      } finally {
        fetchingConversationsRef.current = null;
        if (queuedConversationRefreshRef.current) {
          queuedConversationRefreshRef.current = false;
          void fetchConversations();
        }
      }
    })();

    fetchingConversationsRef.current = refreshPromise;
    return refreshPromise;
  }, [
    activeConversationRef,
    fetchingConversationsRef,
    loginUser,
    queuedConversationRefreshRef,
    setActiveConversation,
    setConversations
  ]);

  const repairConversationGaps = useCallback(
    async (options?: {
      clientConversationId?: string;
      limit?: number;
      refreshLocalConversations?: boolean;
    }) => {
      if (gapRepairInFlightRef.current) {
        await gapRepairInFlightRef.current;
        if (!options?.clientConversationId) {
          return;
        }
      }

      const repairPromise = (async () => {
        const targetConversationId = options?.clientConversationId;
        const backfillJobs = await window.electronAPI.getBackfillJobs(
          Math.max((options?.limit ?? 5) * 3, 10)
        );
        const now = Date.now();
        const dueBackfillJobs = backfillJobs.filter(
          job =>
            !job.not_before_at || new Date(job.not_before_at).getTime() <= now
        );

        if (dueBackfillJobs.length === 0) {
          return;
        }

        const allConversations =
          await window.electronAPI.getConversations(true);
        const conversationsById = new Map(
          allConversations.map(conversation => [
            conversation.client_conversation_id,
            conversation
          ])
        );
        const repairCandidates = dueBackfillJobs
          .map(job => ({
            job,
            conversation: conversationsById.get(job.client_conversation_id)
          }))
          .filter(
            (
              item
            ): item is {
              job: Awaited<
                ReturnType<typeof window.electronAPI.getBackfillJobs>
              >[number];
              conversation: Conversation;
            } => {
              const conversation = item.conversation;
              return (
                conversation !== undefined &&
                Number(conversation.server_conversation_id || 0) > 0 &&
                Number(conversation.needs_backfill || 0) === 1
              );
            }
          )
          .sort((left, right) => {
            const leftPriority =
              left.conversation.client_conversation_id === targetConversationId
                ? 1
                : 0;
            const rightPriority =
              right.conversation.client_conversation_id === targetConversationId
                ? 1
                : 0;
            if (leftPriority !== rightPriority) {
              return rightPriority - leftPriority;
            }
            if (left.job.priority !== right.job.priority) {
              return right.job.priority - left.job.priority;
            }
            const unreadDiff =
              Number(right.conversation.unread_count || 0) -
              Number(left.conversation.unread_count || 0);
            if (unreadDiff !== 0) {
              return unreadDiff;
            }
            return (
              new Date(right.conversation.last_message_time).getTime() -
              new Date(left.conversation.last_message_time).getTime()
            );
          });

        const selectedJobs = repairCandidates.slice(0, options?.limit ?? 5);
        if (selectedJobs.length === 0) {
          return;
        }

        const syncTasks = selectedJobs
          .filter(item => item.job.job_kind !== "history")
          .map(item => {
            const conversation = item.conversation;
            const syncAnchor = Math.max(
              Number(conversation.last_sync_sequence || 0),
              Number(conversation.tail_loaded_to_seq || 0)
            );

            return {
              conversation_id: String(conversation.server_conversation_id),
              client_conversation_id: conversation.client_conversation_id,
              last_sequence: syncAnchor,
              server_sequence: Number(
                conversation.last_server_sequence ??
                  conversation.last_sync_sequence ??
                  0
              ),
              sync_mode:
                item.job.job_kind === "tail" ||
                (Number(conversation.tail_loaded_to_seq || 0) <= 0 &&
                  Number(conversation.last_sync_sequence || 0) <= 0)
                  ? ("tail" as const)
                  : ("delta" as const)
            };
          });

        if (syncTasks.length > 0) {
          await fetchRemoteMessages(syncTasks);
        }

        const refreshedConversations =
          await window.electronAPI.getConversations(true);
        const refreshedConversationMap = new Map(
          refreshedConversations.map(conversation => [
            conversation.client_conversation_id,
            conversation
          ])
        );

        for (const item of selectedJobs) {
          const conversation =
            refreshedConversationMap.get(
              item.conversation.client_conversation_id
            ) ?? item.conversation;
          if (
            Number(conversation.last_server_sequence || 0) <=
              Math.max(
                Number(conversation.last_sync_sequence || 0),
                Number(conversation.tail_loaded_to_seq || 0)
              ) &&
            Number(conversation.history_complete || 0) === 0 &&
            Number(conversation.tail_loaded_from_seq || 0) > 1
          ) {
            await fetchConversationTailMessages(
              String(conversation.server_conversation_id),
              conversation.client_conversation_id,
              {
                beforeSequence: Number(conversation.tail_loaded_from_seq || 0)
              }
            );
          }
        }

        if (options?.refreshLocalConversations) {
          await fetchConversations();
        }
      })().finally(() => {
        gapRepairInFlightRef.current = null;
      });

      gapRepairInFlightRef.current = repairPromise;
      return repairPromise;
    },
    [fetchConversations, gapRepairInFlightRef]
  );

  const syncConversationState = useCallback(
    async (targetConversationId?: string) => {
      await runSyncOrchestrator();
      const localConversations = await fetchConversations();
      if (targetConversationId) {
        let targetConversation = localConversations.find(
          item =>
            String(item.server_conversation_id) === String(targetConversationId)
        );
        if (
          targetConversation &&
          Number(targetConversation.sync_gap_detected)
        ) {
          await repairConversationGaps({
            clientConversationId: targetConversation.client_conversation_id,
            limit: 1,
            refreshLocalConversations: true
          });
          const refreshedConversations = await fetchConversations();
          targetConversation =
            refreshedConversations.find(
              item =>
                String(item.server_conversation_id) ===
                String(targetConversationId)
            ) ?? targetConversation;
        }
        if (targetConversation) {
          setCurrentActiveConversation(targetConversation);
          await reloadConversationMessages(targetConversation);
        } else {
          setCurrentActiveConversation(undefined);
        }
      } else if (activeConversationRef.current) {
        const refreshed = localConversations.find(
          item =>
            item.client_conversation_id ===
            activeConversationRef.current?.client_conversation_id
        );
        if (refreshed) {
          setCurrentActiveConversation(refreshed);
          await reloadConversationMessages(refreshed);
        } else {
          setCurrentActiveConversation(undefined);
        }
      }
    },
    [
      activeConversationRef,
      fetchConversations,
      reloadConversationMessages,
      repairConversationGaps,
      setCurrentActiveConversation
    ]
  );

  const bootstrapChatSession = useCallback(async () => {
    if (bootstrappingChatSessionRef.current) {
      return bootstrappingChatSessionRef.current;
    }

    const bootstrapPromise = (async () => {
      // 仅获取会话列表，不再自动恢复上一个活跃会话
      // 用户需手动从会话列表中选择要打开的会话
      await fetchConversations();
    })();

    bootstrappingChatSessionRef.current = bootstrapPromise;
    try {
      await bootstrapPromise;
    } finally {
      bootstrappingChatSessionRef.current = null;
    }
  }, [bootstrappingChatSessionRef, fetchConversations]);

  // Per-conversation in-flight dedup: 同一会话短时间并发或重复的 read 请求合并为
  // 同一个 in-flight Promise，避免向服务端反复发送等效的 read。
  const inFlightReadRef = useRef<
    Map<
      string,
      {
        readSequence: number;
        promise: Promise<
          Awaited<ReturnType<typeof markConversationReadRequest>>["data"] | null
        >;
      }
    >
  >(new Map());

  const syncConversationRead = useCallback(
    async (conversation: Conversation, readSequenceHint?: number) => {
      const clientConversationId = conversation.client_conversation_id;
      const requestedReadSequence = Math.max(
        Number(readSequenceHint ?? 0),
        Number(conversation.last_read_sequence ?? 0)
      );

      // 客户端去重：当前会话的 last_read_sequence 已经覆盖目标序号 → 跳过 HTTP。
      // 仍然执行本地 markConversationRead 以保证本地 SQLite 与角标同步。
      const localKnownReadSequence = Number(
        conversation.last_read_sequence ?? 0
      );
      if (
        requestedReadSequence > 0 &&
        requestedReadSequence <= localKnownReadSequence
      ) {
        await window.electronAPI.markConversationRead(clientConversationId);
        return null;
      }

      // In-flight 合并：同一会话已有等效或更新的 read 在飞行，复用其 Promise。
      const existing = inFlightReadRef.current.get(clientConversationId);
      if (existing && requestedReadSequence <= existing.readSequence) {
        return existing.promise;
      }

      // 关键：先同步占位写入 in-flight 表，再启动异步请求。否则两次并发调用
      // 会同时通过上方的 in-flight 检查，各自发出一次等效的 HTTP read 请求
      // （表现为相同 conversationId/readSequence、不同 client_request_id 的重复请求）。
      const entry: {
        readSequence: number;
        promise: Promise<
          Awaited<ReturnType<typeof markConversationReadRequest>>["data"] | null
        >;
      } = {
        readSequence: requestedReadSequence,
        // 占位，下面立刻被真实 promise 覆盖；用于保持引用一致以便 finally 校验。
        promise: undefined as unknown as Promise<
          Awaited<ReturnType<typeof markConversationReadRequest>>["data"] | null
        >
      };
      inFlightReadRef.current.set(clientConversationId, entry);

      const runRequest = async () => {
        const localReadResult =
          await window.electronAPI.markConversationRead(clientConversationId);
        const readSequence = Math.max(
          requestedReadSequence,
          Number(localReadResult?.readSequence ?? 0)
        );
        try {
          const { data } = await markConversationReadRequest({
            conversationId: conversation.server_conversation_id,
            readSequence
          });
          await window.electronAPI.applyConversationRead({
            serverConversationId: conversation.server_conversation_id,
            readSequence: data.read_seq,
            unreadCount: data.unread_count,
            updatedAt: data.updated_at
          });
          return data;
        } catch (error) {
          log.warn(
            "Failed to sync conversation read to server, local-only read applied",
            error
          );
          return null;
        }
      };

      entry.promise = runRequest().finally(() => {
        const current = inFlightReadRef.current.get(clientConversationId);
        if (current === entry) {
          inFlightReadRef.current.delete(clientConversationId);
        }
      });
      return entry.promise;
    },
    []
  );

  const syncActiveConversationReadIfVisible = useCallback(async () => {
    if (
      !loginUser ||
      foregroundReadSyncInFlightRef.current ||
      !isAppWindowVisible() ||
      !isActiveConversationViewportShowingLatestMessage()
    ) {
      return;
    }

    const activeConv = activeConversationRef.current;
    if (!activeConv) {
      return;
    }

    const latestConversation =
      conversationsRef.current.find(
        item =>
          item.client_conversation_id === activeConv.client_conversation_id
      ) ?? activeConv;

    const latestSyncSequence =
      getConversationReadTargetSequence(latestConversation);
    const latestReadSequence = Number(
      latestConversation.last_read_sequence || 0
    );
    const unreadCount = Number(latestConversation.unread_count || 0);
    const mentionUnreadCount = Number(
      latestConversation.mention_unread_count || 0
    );

    if (
      unreadCount <= 0 &&
      mentionUnreadCount <= 0 &&
      latestSyncSequence <= latestReadSequence
    ) {
      return;
    }

    foregroundReadSyncInFlightRef.current = true;
    try {
      const readResult = await syncConversationRead(
        latestConversation,
        latestSyncSequence
      );
      if (readResult) {
        applyConversationUpdate(
          latestConversation.client_conversation_id,
          conversation => ({
            ...conversation,
            unread_count: readResult.unread_count,
            mention_unread_count:
              readResult.unread_count === 0
                ? 0
                : conversation.mention_unread_count,
            last_read_sequence: Math.max(
              Number(conversation.last_read_sequence || 0),
              Number(readResult.read_seq || 0)
            )
          })
        );
      }
    } finally {
      foregroundReadSyncInFlightRef.current = false;
    }
  }, [
    activeConversationRef,
    applyConversationUpdate,
    conversationsRef,
    foregroundReadSyncInFlightRef,
    loginUser,
    syncConversationRead
  ]);

  return {
    setCurrentActiveConversation,
    applyConversationUpdate,
    reloadConversationMessages,
    fetchConversations,
    repairConversationGaps,
    syncConversationState,
    bootstrapChatSession,
    syncConversationRead,
    syncActiveConversationReadIfVisible
  };
}
