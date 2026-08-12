import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from "react";
import {
  mergePresenceEntriesByUserId,
  PRESENCE_DIRECT_CHAT_STALE_MS,
  shouldRefreshPresence,
  type UserPresenceSummary
} from "@mushroom/shared";
import { getUsersPresence } from "../../http/api";
import type { Conversation } from "../../types/chat";
import type { LoginUser } from "../../types/user";

type PresenceEntry = {
  user_id: number;
  is_online: boolean;
  active_device_count: number;
  last_active_at?: string;
  /**
   * 服务端观测时刻 ISO；用于 mergePresenceEntriesByUserId 的单调性判定，
   * 避免 HTTP 与 WS 乱序到达时旧值覆盖新值。可选以兼容老服务端。
   */
  observed_at?: string;
};

type UseChatPresenceOptions = {
  loginUser: LoginUser | null;
  activeConversationRef: RefObject<Conversation | undefined>;
};

export function useChatPresence({
  loginUser,
  activeConversationRef
}: UseChatPresenceOptions) {
  const [userPresenceByUserId, setUserPresenceByUserId] = useState<
    Record<number, UserPresenceSummary>
  >({});
  const userPresenceByUserIdRef = useRef<Record<number, UserPresenceSummary>>(
    {}
  );
  const presenceLastActiveAtRef = useRef<Record<number, string>>({});
  const directPresenceFetchedAtRef = useRef<Record<number, number>>({});
  const presenceRequestInFlightRef = useRef(new Set<string>());

  useEffect(() => {
    userPresenceByUserIdRef.current = userPresenceByUserId;
  }, [userPresenceByUserId]);

  useEffect(() => {
    if (loginUser) {
      return;
    }

    userPresenceByUserIdRef.current = {};
    presenceLastActiveAtRef.current = {};
    directPresenceFetchedAtRef.current = {};
    setUserPresenceByUserId({});
  }, [loginUser]);

  const mergePresenceEntries = useCallback((entries: PresenceEntry[]) => {
    setUserPresenceByUserId(current => {
      const { nextPresenceByUserId, nextLastActiveAtByUserId } =
        mergePresenceEntriesByUserId(
          current,
          entries,
          presenceLastActiveAtRef.current
        );
      presenceLastActiveAtRef.current = nextLastActiveAtByUserId;
      userPresenceByUserIdRef.current = nextPresenceByUserId;
      return nextPresenceByUserId;
    });
  }, []);

  const requestPresence = useCallback(
    async (userIds: number[]) => {
      if (!loginUser || document.visibilityState !== "visible") {
        return false;
      }

      const normalizedUserIds = Array.from(
        new Set(
          userIds
            .map(value => Number(value))
            .filter(value => Number.isFinite(value) && value > 0)
        )
      );
      if (normalizedUserIds.length === 0) {
        return false;
      }

      const requestKey = normalizedUserIds
        .slice()
        .sort((left, right) => left - right)
        .join(",");
      if (presenceRequestInFlightRef.current.has(requestKey)) {
        return false;
      }

      presenceRequestInFlightRef.current.add(requestKey);
      try {
        const result = await getUsersPresence({
          user_ids: requestKey
        });
        mergePresenceEntries(
          result.data.map(item => ({
            user_id: Number(item.user_id),
            is_online: Boolean(item.is_online),
            active_device_count: Number(item.active_device_count || 0),
            last_active_at: item.last_active_at,
            observed_at: item.observed_at
          }))
        );
        return true;
      } catch {
        return false;
      } finally {
        presenceRequestInFlightRef.current.delete(requestKey);
      }
    },
    [loginUser, mergePresenceEntries]
  );

  const refreshActivePeerPresence = useCallback(
    (options?: { force?: boolean }) => {
      const currentConversation = activeConversationRef.current;
      const peerId =
        currentConversation?.type === 1
          ? Number(currentConversation.peer_id || 0)
          : 0;
      if (!Number.isFinite(peerId) || peerId <= 0) {
        return;
      }

      // P1 兜底：当外部传入 force=true（典型场景：进入会话），无视 stale 阈值
      // 强制刷新一次 peer presence，避免 WS 推送链路漏推（单向联系人 / 跨节点延迟 / 重连前丢消息）
      // 导致顶部头像下方的在线状态长时间停留在过期值。
      const force = options?.force === true;
      const now = Date.now();
      const shouldFetch =
        force ||
        !userPresenceByUserIdRef.current[peerId] ||
        shouldRefreshPresence(
          directPresenceFetchedAtRef.current[peerId] || 0,
          now,
          PRESENCE_DIRECT_CHAT_STALE_MS
        );

      if (!shouldFetch) {
        return;
      }

      void requestPresence([peerId]).then(requested => {
        if (requested) {
          directPresenceFetchedAtRef.current = {
            ...directPresenceFetchedAtRef.current,
            [peerId]: Date.now()
          };
        }
      });
    },
    [activeConversationRef, requestPresence]
  );

  const resetDirectPresenceFetchCache = useCallback(() => {
    directPresenceFetchedAtRef.current = {};
  }, []);

  return {
    userPresenceByUserId,
    mergePresenceEntries,
    refreshActivePeerPresence,
    resetDirectPresenceFetchCache
  };
}
