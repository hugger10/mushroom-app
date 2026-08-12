import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  deleteConversation,
  disbandConversation,
  updateConversationState
} from "../../http/api";
import type { Conversation } from "../../types/chat";

type ApplyConversationUpdate = (
  clientConversationId: string,
  updater: (conversation: Conversation) => Conversation
) => void;

type UseChatConversationActionsOptions = {
  activeConversation: Conversation | undefined;
  activeConversationRef: RefObject<Conversation | undefined>;
  setActiveConversation: Dispatch<SetStateAction<Conversation | undefined>>;
  applyConversationUpdate: ApplyConversationUpdate;
  clearConversationNotification: (
    clientConversationId: string
  ) => Promise<void>;
  fetchConversations: () => Promise<Conversation[]>;
  reloadConversationMessages: (conversation: Conversation) => Promise<void>;
  setCurrentActiveConversation: (conversation?: Conversation) => void;
  syncConversationState: (serverConversationId?: string) => Promise<void>;
};

export function useChatConversationActions({
  activeConversation,
  activeConversationRef,
  setActiveConversation,
  applyConversationUpdate,
  clearConversationNotification,
  fetchConversations,
  reloadConversationMessages,
  setCurrentActiveConversation,
  syncConversationState
}: UseChatConversationActionsOptions) {
  const handleDeleteConversation = async (conversation: Conversation) => {
    // Server-first: record the per-user hidden_before_seq on the server before
    // touching local state, so the deletion is visible across all devices and
    // the server stops returning hidden history on future syncs.
    await deleteConversation({
      conversationId: conversation.server_conversation_id
    });
    void clearConversationNotification(conversation.client_conversation_id);
    try {
      await window.electronAPI.deleteConversationLocally(
        conversation.client_conversation_id
      );
    } catch (error) {
      // Server already raised hidden_before_seq for this user. If the local
      // soft-delete write fails, log and surface the error; the next sync
      // will fetch the server-side cutoff and prune local rows accordingly.
      console.error(
        "[deleteConversation] local soft-delete failed; will reconcile on next sync",
        error
      );
      throw error;
    }
    if (
      activeConversationRef.current?.client_conversation_id ===
      conversation.client_conversation_id
    ) {
      setCurrentActiveConversation(undefined);
    }
    await fetchConversations();
  };

  const handleClearConversation = async (conversation: Conversation) => {
    await window.electronAPI.clearConversationMessages(
      conversation.client_conversation_id
    );
    const refreshedConversations = await fetchConversations();
    if (
      activeConversationRef.current?.client_conversation_id ===
      conversation.client_conversation_id
    ) {
      const refreshedConversation =
        refreshedConversations.find(
          item =>
            item.client_conversation_id === conversation.client_conversation_id
        ) ?? conversation;
      await reloadConversationMessages(refreshedConversation);
    }
  };

  const handleDisbandGroupConversation = async () => {
    if (!activeConversation) return;

    const disbandConversationId = activeConversation.server_conversation_id;
    const localConversationId = activeConversation.client_conversation_id;
    await disbandConversation({
      conversationId: disbandConversationId
    });
    await window.electronAPI.deleteConversations([localConversationId]);
    if (
      activeConversationRef.current?.client_conversation_id ===
      localConversationId
    ) {
      setCurrentActiveConversation(undefined);
    }
  };

  const handleUpdateConversationState = async (
    conversation: Conversation,
    patch: {
      is_pinned?: number;
      is_muted?: number;
      is_archived?: number;
      draft?: string | null;
    }
  ) => {
    const previousConversation = {
      ...conversation
    };
    const wasActiveConversation =
      activeConversationRef.current?.client_conversation_id ===
      conversation.client_conversation_id;

    applyConversationUpdate(conversation.client_conversation_id, item => ({
      ...item,
      ...(patch.is_pinned === undefined ? {} : { is_pinned: patch.is_pinned }),
      ...(patch.is_muted === undefined ? {} : { is_muted: patch.is_muted }),
      ...(patch.is_archived === undefined
        ? {}
        : { is_archived: patch.is_archived }),
      ...(patch.draft === undefined ? {} : { draft: patch.draft })
    }));

    if (
      patch.is_archived &&
      activeConversationRef.current?.client_conversation_id ===
        conversation.client_conversation_id
    ) {
      activeConversationRef.current = undefined;
      setActiveConversation(undefined);
    }

    try {
      await window.electronAPI.updateConversationState({
        client_conversation_id: conversation.client_conversation_id,
        ...patch
      });

      await updateConversationState({
        conversationId: conversation.server_conversation_id,
        is_pinned: patch.is_pinned,
        is_muted: patch.is_muted,
        is_archived: patch.is_archived,
        draft: patch.draft
      });

      await syncConversationState(
        patch.is_archived ? conversation.server_conversation_id : undefined
      );
    } catch (error) {
      applyConversationUpdate(conversation.client_conversation_id, () => ({
        ...previousConversation
      }));
      await window.electronAPI.updateConversationState({
        client_conversation_id: previousConversation.client_conversation_id,
        is_pinned: previousConversation.is_pinned,
        is_muted: previousConversation.is_muted,
        is_archived: previousConversation.is_archived,
        draft: previousConversation.draft ?? ""
      });
      if (wasActiveConversation) {
        activeConversationRef.current = previousConversation;
        setActiveConversation(previousConversation);
      }
      throw error;
    }
  };

  const handleConversationDraftChange = async (
    conversation: Conversation,
    draft: string
  ) => {
    const nextDraft = draft || "";
    const previousDraft = conversation.draft ?? "";
    if (previousDraft === nextDraft) {
      return;
    }

    if (
      activeConversationRef.current?.client_conversation_id ===
      conversation.client_conversation_id
    ) {
      activeConversationRef.current = {
        ...activeConversationRef.current,
        draft: nextDraft
      };
    }
    applyConversationUpdate(conversation.client_conversation_id, item => ({
      ...item,
      draft: nextDraft
    }));

    try {
      await window.electronAPI.updateConversationState({
        client_conversation_id: conversation.client_conversation_id,
        draft: nextDraft
      });
    } catch (error) {
      applyConversationUpdate(conversation.client_conversation_id, item => ({
        ...item,
        draft: previousDraft
      }));
      await window.electronAPI.updateConversationState({
        client_conversation_id: conversation.client_conversation_id,
        draft: previousDraft
      });
      throw error;
    }
  };

  return {
    handleDeleteConversation,
    handleClearConversation,
    handleDisbandGroupConversation,
    handleUpdateConversationState,
    handleConversationDraftChange
  };
}
