import { getMessageSummaryText } from "@mushroom/shared";
import { useCallback, useEffect, type RefObject } from "react";
import type { Conversation, Message } from "../types/chat";
import type { LoginUser } from "../types/user";
import {
  getConversationLabel,
  getNotificationSenderLabel
} from "./useChatHelpers";

type UseChatNotificationsOptions = {
  loginUser: LoginUser | null;
  conversationsRef: RefObject<Conversation[]>;
  notifiedMessageIdsRef: RefObject<Set<string>>;
  notificationPermissionRequestedRef: RefObject<boolean>;
  fetchConversations: () => Promise<Conversation[]>;
  openConversationRef: RefObject<
    ((conversation: Conversation) => Promise<void>) | null
  >;
};

export function useChatNotifications({
  loginUser,
  conversationsRef,
  notifiedMessageIdsRef,
  notificationPermissionRequestedRef,
  fetchConversations,
  openConversationRef
}: UseChatNotificationsOptions) {
  const getElectronAPI = useCallback(() => {
    return window.electronAPI as Partial<typeof window.electronAPI> | undefined;
  }, []);

  const ensureNotificationPermission = useCallback(async () => {
    if (getElectronAPI()?.notifyIncomingMessage) {
      return true;
    }

    if (!("Notification" in window)) {
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (
      Notification.permission !== "default" ||
      notificationPermissionRequestedRef.current
    ) {
      return false;
    }

    notificationPermissionRequestedRef.current = true;
    try {
      return (await Notification.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }, [getElectronAPI, notificationPermissionRequestedRef]);

  useEffect(() => {
    if (!loginUser) {
      return;
    }

    const electronAPI = getElectronAPI();
    if (!electronAPI?.onDesktopNotificationAction) {
      return;
    }

    return electronAPI.onDesktopNotificationAction(payload => {
      if (payload.action !== "open") {
        return;
      }

      const handleOpenFromDesktopNotification = async () => {
        if (payload.type === "conversation" && payload.clientConversationId) {
          let nextConversation =
            conversationsRef.current.find(
              item =>
                item.client_conversation_id === payload.clientConversationId
            ) ?? null;

          if (!nextConversation) {
            const refreshed = await fetchConversations();
            nextConversation =
              refreshed.find(
                item =>
                  item.client_conversation_id === payload.clientConversationId
              ) ?? null;
          }

          if (nextConversation) {
            await openConversationRef.current?.(nextConversation);
          }
          return;
        }

        if (payload.type === "call") {
          const targetConversationId = payload.conversationId;
          if (!targetConversationId) {
            return;
          }

          let nextConversation =
            conversationsRef.current.find(
              item =>
                String(item.server_conversation_id) ===
                  String(targetConversationId) ||
                item.client_conversation_id === targetConversationId
            ) ?? null;

          if (!nextConversation) {
            const refreshed = await fetchConversations();
            nextConversation =
              refreshed.find(
                item =>
                  String(item.server_conversation_id) ===
                    String(targetConversationId) ||
                  item.client_conversation_id === targetConversationId
              ) ?? null;
          }

          if (nextConversation) {
            await openConversationRef.current?.(nextConversation);
          }
        }
      };

      void handleOpenFromDesktopNotification();
    });
  }, [
    conversationsRef,
    fetchConversations,
    getElectronAPI,
    loginUser,
    openConversationRef
  ]);

  const showIncomingNotification = useCallback(
    async (message: Message, isMentioned: boolean) => {
      if (!loginUser) {
        return;
      }

      const conversation = conversationsRef.current.find(
        item => item.client_conversation_id === message.client_conversation_id
      );

      if (Number(conversation?.is_muted || 0) === 1 && !isMentioned) {
        return;
      }

      const alreadyNotified = notifiedMessageIdsRef.current.has(
        message.client_message_id
      );
      if (alreadyNotified || !(await ensureNotificationPermission())) {
        return;
      }

      notifiedMessageIdsRef.current.add(message.client_message_id);
      if (notifiedMessageIdsRef.current.size > 200) {
        const oldest = notifiedMessageIdsRef.current.values().next().value;
        if (oldest) {
          notifiedMessageIdsRef.current.delete(oldest);
        }
      }

      const conversationLabel = getConversationLabel(conversation);
      const senderLabel = getNotificationSenderLabel(
        message,
        conversation,
        loginUser
      );
      const summaryText = getMessageSummaryText(message.content);
      // call_record 为系统自动插入的通话记录消息，没有真实的发送者，
      // 无需在通知中显示 senderLabel，避免出现 "Unknown member: " 前缀。
      const isCallRecord =
        typeof message.content === "object" &&
        message.content !== null &&
        (message.content.kind as string) === "call_record";
      const title = isMentioned
        ? `@ mention in ${conversationLabel}`
        : conversation?.type === 2
          ? conversationLabel
          : senderLabel;
      const body =
        conversation?.type === 2 && !isCallRecord
          ? `${senderLabel}: ${summaryText}`
          : summaryText;
      const electronAPI = getElectronAPI();
      if (electronAPI?.notifyIncomingMessage) {
        await electronAPI.notifyIncomingMessage({
          clientConversationId: message.client_conversation_id,
          title,
          body,
          silent: false
        });
        return;
      }

      const notification = new Notification(title, {
        body,
        tag: `message-${message.client_message_id}`
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      window.setTimeout(() => {
        notification.close();
      }, 8000);
    },
    [
      conversationsRef,
      ensureNotificationPermission,
      getElectronAPI,
      loginUser,
      notifiedMessageIdsRef
    ]
  );

  const clearConversationNotification = useCallback(
    async (clientConversationId?: string) => {
      const electronAPI = getElectronAPI();
      if (
        !clientConversationId ||
        !electronAPI?.clearConversationNotifications
      ) {
        return;
      }

      await electronAPI.clearConversationNotifications(clientConversationId);
    },
    [getElectronAPI]
  );

  return {
    ensureNotificationPermission,
    showIncomingNotification,
    clearConversationNotification
  };
}
