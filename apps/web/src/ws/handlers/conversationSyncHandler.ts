import type { ConversationSyncMessage } from "@mushroom/shared";
import {
  fetchRemoteConversations,
  fetchRemoteMessages
} from "../../sync/syncContext";

export async function handleConversationSyncMessage(
  message: ConversationSyncMessage
) {
  if (message.action === "remove") {
    const localConversation = await window.electronAPI
      .getConversationsByServerId(message.conversation_id)
      .catch(() => null);
    if (!localConversation?.client_conversation_id) {
      return;
    }

    await window.electronAPI.deleteConversations([
      localConversation.client_conversation_id
    ]);
    return;
  }

  const lastConversationsSync =
    (await window.electronAPI.getLastSyncTime("conversations")) ?? undefined;
  const syncResult = await fetchRemoteConversations(lastConversationsSync);
  await window.electronAPI.updateLastSyncTime(
    "conversations",
    syncResult.syncCursor
  );

  const targetConversationSync = syncResult.updatedConversations.filter(
    item => String(item.conversation_id) === String(message.conversation_id)
  );
  if (targetConversationSync.length > 0) {
    await fetchRemoteMessages(targetConversationSync);
  }
}
