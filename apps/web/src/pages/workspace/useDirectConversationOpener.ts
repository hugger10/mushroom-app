import { useCallback } from "react";
import { message } from "antd";
import { createDirectConversation } from "../../http/api";
import {
  fetchRemoteConversations,
  fetchRemoteMessages
} from "../../sync/syncContext";
import type { Conversation } from "../../types/chat";
import { getReadableErrorMessage } from "../../utils/errorMessage";
import { i18n } from "../../i18n";

interface UseDirectConversationOpenerOptions {
  conversations: Conversation[];
  handleConversationSelect: (conversation: Conversation) => void;
}

/**
 * Encapsulates the "open or create direct conversation" flow:
 * memory lookup -> local DB lookup -> remote create + sync.
 */
export function useDirectConversationOpener({
  conversations,
  handleConversationSelect
}: UseDirectConversationOpenerOptions) {
  const openDirectConversation = useCallback(
    async (userId: number): Promise<Conversation | null> => {
      const existingConversation = conversations.find(
        conversation =>
          conversation.type === 1 &&
          Number(conversation.peer_id) === Number(userId)
      );

      if (existingConversation) {
        handleConversationSelect(existingConversation);
        return existingConversation;
      }

      if (!window.electronAPI) {
        return null;
      }

      const localConversations =
        await window.electronAPI.getConversations(true);
      const localDirectConversation =
        localConversations.find(
          conversation =>
            conversation.type === 1 &&
            Number(conversation.peer_id) === Number(userId)
        ) ?? null;

      if (localDirectConversation) {
        handleConversationSelect(localDirectConversation);
        return localDirectConversation;
      }

      try {
        const { data } = await createDirectConversation({
          target_user_id: userId
        });
        const lastConversationsSync =
          (await window.electronAPI.getLastSyncTime("conversations")) ??
          undefined;
        const conversationSyncResult = await fetchRemoteConversations(
          lastConversationsSync
        );
        await window.electronAPI.updateLastSyncTime(
          "conversations",
          conversationSyncResult.syncCursor
        );
        await fetchRemoteMessages(conversationSyncResult.updatedConversations);
        const syncedConversations =
          await window.electronAPI.getConversations(true);
        const createdConversation =
          syncedConversations.find(
            conversation =>
              String(conversation.server_conversation_id) === String(data.id)
          ) ?? null;
        if (createdConversation) {
          handleConversationSelect(createdConversation);
        }
        return createdConversation;
      } catch (error) {
        message.error(
          getReadableErrorMessage(
            error,
            i18n.t("startConversation.openChatFailed")
          )
        );
        return null;
      }
    },
    [conversations, handleConversationSelect]
  );

  return { openDirectConversation };
}
