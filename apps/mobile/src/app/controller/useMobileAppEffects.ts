import { useEffectEvent, useRef } from "react";
import { AppState } from "react-native";
import {
  mergePresenceEntriesByUserId,
  type ServerWsMessage,
  type UserPresenceSummary
} from "@mushroom/shared";
import {
  mobileAppController,
  mobileRealtimeClient,
  mobileServerApi,
  registerCurrentMobileDevice,
  updateMobilePushRegistration
} from "../../services/app-runtime";
import type {
  MobileNotificationPayload,
  MobilePushRegistration
} from "../../platform/notification-center";
import {
  applyConversationDisplayFallbacks,
  normalizeOnlineFlag
} from "../../utils/display";
import {
  useMobileConnectivityEffects,
  useMobileCallLifecycleEffects,
  useMobileRealtimeEffects,
  useMobileRuntimeEffects,
  useMobileUiStateEffects
} from "./effects";
import type { MobileAppState } from "./useMobileAppState";

export function useMobileAppEffects(params: {
  state: MobileAppState;
  refreshMeData: () => Promise<void>;
  handleRealtimeSocketMessage: (message: ServerWsMessage) => Promise<void>;
  acceptCallById: (callId: string) => Promise<void>;
  rejectOrEndCallById: (callId: string) => Promise<void>;
  rebuildCallSessionFromServer: (callId: string) => Promise<unknown> | unknown;
  silentRefreshAddressBookMatches: (options?: {
    isCancelled?: () => boolean;
  }) => Promise<void>;
}) {
  const {
    state,
    refreshMeData,
    handleRealtimeSocketMessage,
    acceptCallById,
    rejectOrEndCallById,
    rebuildCallSessionFromServer,
    silentRefreshAddressBookMatches
  } = params;
  const refreshMeDataEvent = useEffectEvent(refreshMeData);
  const handleRealtimeSocketMessageEvent = useEffectEvent(
    handleRealtimeSocketMessage
  );
  const acceptCallByIdEvent = useEffectEvent(acceptCallById);
  const rejectOrEndCallByIdEvent = useEffectEvent(rejectOrEndCallById);
  const rebuildCallSessionFromServerEvent = useEffectEvent(
    rebuildCallSessionFromServer
  );
  const silentRefreshAddressBookMatchesEvent = useEffectEvent(
    silentRefreshAddressBookMatches
  );
  const meDataLoadedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const networkOnlineRef = useRef(true);
  const presenceMapRef = useRef<Record<number, UserPresenceSummary>>({});
  const presenceLastActiveAtRef = useRef<Record<number, string>>({});
  const presenceRequestInFlightRef = useRef(new Set<string>());
  const listPresenceLastFetchAtRef = useRef<{
    key: string;
    at: number;
  } | null>(null);
  const flushOutgoingInFlightRef = useRef(false);
  const pendingSystemCallActionRef = useRef<{
    type: "answer" | "end";
    callId: string;
  } | null>(null);

  const mergePresenceEntriesEvent = useEffectEvent(
    (
      entries: Array<{
        user_id: number;
        is_online: boolean;
        active_device_count: number;
        last_active_at?: string;
        observed_at?: string;
      }>
    ) => {
      state.setUserPresenceByUserId(current => {
        const { nextPresenceByUserId, nextLastActiveAtByUserId } =
          mergePresenceEntriesByUserId(
            current,
            entries.map(item => ({
              user_id: Number(item.user_id),
              is_online: normalizeOnlineFlag(item.is_online),
              active_device_count: item.active_device_count,
              last_active_at: item.last_active_at,
              // 透传服务端观测时刻：参与单调性判定，避免乱序覆盖。
              observed_at: item.observed_at
            })),
            presenceLastActiveAtRef.current
          );
        presenceLastActiveAtRef.current = nextLastActiveAtByUserId;
        presenceMapRef.current = nextPresenceByUserId;
        return nextPresenceByUserId;
      });
    }
  );

  const requestPresenceEvent = useEffectEvent(async (userIds: number[]) => {
    if (!state.snapshot?.auth.accessToken || appStateRef.current !== "active") {
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
      .sort((a, b) => a - b)
      .join(",");
    if (presenceRequestInFlightRef.current.has(requestKey)) {
      return false;
    }

    presenceRequestInFlightRef.current.add(requestKey);
    try {
      const result = await mobileServerApi.getUsersPresence({
        user_ids: requestKey
      });
      mergePresenceEntriesEvent(result.data);
      return true;
    } catch {
      return false;
    } finally {
      presenceRequestInFlightRef.current.delete(requestKey);
    }
  });

  const refreshListPresenceEvent = useEffectEvent(
    async (
      userIds: number[] | "all-direct-peers",
      options?: { force?: boolean; dedupWindowMs?: number }
    ) => {
      if (
        !state.snapshot?.auth.accessToken ||
        appStateRef.current !== "active"
      ) {
        return;
      }

      const sourceIds =
        userIds === "all-direct-peers"
          ? (state.snapshot?.data.conversations ?? [])
              .filter(item => item.type === 1)
              .map(item => Number(item.peer_id || 0))
          : userIds;

      const normalizedUserIds = Array.from(
        new Set(
          sourceIds
            .map(value => Number(value))
            .filter(value => Number.isFinite(value) && value > 0)
        )
      ).sort((a, b) => a - b);
      if (normalizedUserIds.length === 0) {
        return;
      }

      // 30s 去重窗口：相同的 peer 集合在短时间内只请求一次，
      // 避免列表抖动 / 重连 / 多个 trigger 触发重复批量拉取。
      const requestKey = normalizedUserIds.join(",");
      const dedupWindowMs = options?.dedupWindowMs ?? 30_000;
      const now = Date.now();
      if (
        !options?.force &&
        listPresenceLastFetchAtRef.current &&
        listPresenceLastFetchAtRef.current.key === requestKey &&
        now - listPresenceLastFetchAtRef.current.at < dedupWindowMs
      ) {
        return;
      }
      listPresenceLastFetchAtRef.current = { key: requestKey, at: now };

      // 分批请求，避免单次 URL 过长
      const BATCH_SIZE = 50;
      for (
        let offset = 0;
        offset < normalizedUserIds.length;
        offset += BATCH_SIZE
      ) {
        const batch = normalizedUserIds.slice(offset, offset + BATCH_SIZE);
        await requestPresenceEvent(batch);
      }
    }
  );

  const refreshVisiblePresenceEvent = useEffectEvent(() => {
    if (!state.snapshot?.auth.accessToken) {
      return;
    }

    if (!state.activeConversation) {
      return;
    }

    const [normalizedActiveConversation] = applyConversationDisplayFallbacks({
      conversations: [state.activeConversation],
      contacts: state.friends,
      loginUser: state.snapshot.auth.user
    });
    const peerId =
      normalizedActiveConversation?.type === 1
        ? Number(normalizedActiveConversation.peer_id || 0)
        : 0;
    if (!Number.isFinite(peerId) || peerId <= 0) {
      return;
    }

    void requestPresenceEvent([peerId]);
  });

  const flushOutgoingQueueEvent = useEffectEvent(async () => {
    if (
      flushOutgoingInFlightRef.current ||
      !state.snapshot?.auth.accessToken ||
      state.realtimeStatus.status !== "connected"
    ) {
      return;
    }

    flushOutgoingInFlightRef.current = true;
    try {
      const candidates =
        await mobileAppController.listRetryableOutgoingMessages({
          limit: 50
        });

      for (const message of candidates) {
        try {
          await mobileAppController.markOutgoingMessageSending({
            clientConversationId: message.client_conversation_id,
            clientMessageId: message.client_message_id
          });
          const ack = await mobileRealtimeClient.sendChatMessage(message);
          await mobileAppController.confirmMessageAck(ack);
        } catch (error) {
          await mobileAppController.failMessageSend({
            clientConversationId: message.client_conversation_id,
            clientMessageId: message.client_message_id,
            errorMessage:
              error instanceof Error
                ? error.message
                : String(error ?? "Unknown outgoing delivery failure")
          });
        }
      }
    } finally {
      flushOutgoingInFlightRef.current = false;
    }
  });

  const openPayloadEvent = useEffectEvent(
    async (payload: MobileNotificationPayload) => {
      if (payload.callId) {
        // Rebuild the call session from authoritative server state. Shared with
        // the system-call answer/decline path so cold-open and CallKit/VoIP
        // answers converge on the same reconstruction logic.
        await rebuildCallSessionFromServerEvent(payload.callId);
      }

      if (payload.conversationId) {
        let nextSnapshot = state.snapshot;
        const matchedConversation = nextSnapshot?.data.conversations.find(
          item =>
            item.server_conversation_id === payload.conversationId ||
            item.client_conversation_id === payload.conversationId
        );

        if (!matchedConversation) {
          await mobileAppController.syncNow();
          nextSnapshot = await mobileAppController.snapshot();
        }

        const recoveredConversation = nextSnapshot?.data.conversations.find(
          item =>
            item.server_conversation_id === payload.conversationId ||
            item.client_conversation_id === payload.conversationId
        );

        if (recoveredConversation) {
          state.setActiveConversationId(
            recoveredConversation.client_conversation_id
          );
        }
      }

      const pendingAction = pendingSystemCallActionRef.current;
      if (
        pendingAction &&
        payload.callId &&
        pendingAction.callId === payload.callId
      ) {
        pendingSystemCallActionRef.current = null;
        if (pendingAction.type === "answer") {
          await acceptCallByIdEvent(payload.callId);
        } else {
          await rejectOrEndCallByIdEvent(payload.callId);
        }
      }
    }
  );

  const registerPushRegistrationEvent = useEffectEvent(
    async (registration: MobilePushRegistration) => {
      updateMobilePushRegistration({
        provider: registration.provider,
        token: registration.token,
        appId: registration.appId ?? null,
        region: registration.region ?? null,
        capabilities: registration.capabilities
      });
      if (!state.snapshot?.auth.accessToken) {
        return;
      }

      try {
        await registerCurrentMobileDevice();
      } catch {
        // The next auth/bootstrap cycle will retry current-device registration.
      }
    }
  );

  useMobileRuntimeEffects({
    state,
    pendingSystemCallActionRef,
    openPayloadEvent,
    registerPushRegistrationEvent,
    acceptCallByIdEvent,
    rejectOrEndCallByIdEvent,
    silentRefreshAddressBookMatches: silentRefreshAddressBookMatchesEvent
  });
  useMobileRealtimeEffects({
    state,
    presenceMapRef,
    presenceLastActiveAtRef,
    flushOutgoingQueueEvent,
    handleRealtimeSocketMessageEvent
  });
  useMobileConnectivityEffects({
    state,
    appStateRef,
    networkOnlineRef,
    presenceMapRef,
    presenceLastActiveAtRef,
    requestPresenceEvent,
    refreshVisiblePresenceEvent,
    refreshListPresenceEvent,
    flushOutgoingQueueEvent
  });
  useMobileUiStateEffects({
    state,
    meDataLoadedRef,
    refreshMeDataEvent
  });
  useMobileCallLifecycleEffects({ state });
}
