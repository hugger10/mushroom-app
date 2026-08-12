import { useMemo } from "react";
import { parseGroupConversationSettings } from "@mushroom/shared";
import type { GroupConversationSettings } from "@mushroom/shared";
import {
  useAccountState,
  useAppShellState,
  useCallState,
  useChatInteractionState,
  useGroupState,
  useOverlayState
} from "./state";

export function useMobileAppState() {
  const app = useAppShellState();
  const chat = useChatInteractionState();
  const overlays = useOverlayState();
  const account = useAccountState();
  const group = useGroupState();
  const call = useCallState();

  const isAuthenticated = Boolean(app.snapshot?.auth.accessToken);
  const conversations = app.snapshot?.data.conversations ?? [];
  const contacts = app.snapshot?.data.contacts ?? [];
  const availableContacts = useMemo(
    () => contacts.filter(item => !item.is_blocked),
    [contacts]
  );
  const blockedContacts = useMemo(
    () => contacts.filter(item => item.is_blocked),
    [contacts]
  );
  const activeConversation =
    conversations.find(
      item => item.client_conversation_id === chat.activeConversationId
    ) ?? null;
  const activeMessages =
    (activeConversation &&
      app.snapshot?.data.messagesByConversation[
        activeConversation.client_conversation_id
      ]) ||
    [];
  const selectedMessage =
    activeMessages.find(
      item => item.client_message_id === chat.selectedMessageId
    ) ?? null;
  const replyTarget =
    activeMessages.find(
      item => item.client_message_id === chat.replyTargetId
    ) ?? null;
  const groupSettings: GroupConversationSettings = useMemo(
    () => parseGroupConversationSettings(activeConversation?.settings),
    [activeConversation?.settings]
  );
  const currentGroupMember = useMemo(
    () =>
      activeConversation?.members?.find(
        item => Number(item.user_id) === Number(app.snapshot?.auth.user?.userId)
      ) ?? null,
    [activeConversation?.members, app.snapshot?.auth.user?.userId]
  );
  const candidateAddFriends = useMemo(() => {
    const existingMemberIds = new Set(
      (activeConversation?.members ?? []).map(item => Number(item.user_id))
    );
    return availableContacts.filter(
      contact => !existingMemberIds.has(Number(contact.user_id))
    );
  }, [activeConversation?.members, availableContacts]);
  const existingGroupMemberIds = useMemo(
    () =>
      new Set(
        (activeConversation?.members ?? []).map(item => Number(item.user_id))
      ),
    [activeConversation?.members]
  );

  return {
    ...app,
    ...chat,
    ...overlays,
    ...account,
    ...group,
    ...call,
    isAuthenticated,
    conversations,
    friends: contacts,
    contacts,
    availableContacts,
    blockedContacts,
    activeConversation,
    activeMessages,
    selectedMessage,
    replyTarget,
    groupSettings,
    currentGroupMember,
    candidateAddFriends,
    existingGroupMemberIds
  };
}

export type MobileAppState = ReturnType<typeof useMobileAppState>;
