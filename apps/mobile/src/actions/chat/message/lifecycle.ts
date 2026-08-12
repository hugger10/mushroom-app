import type { Message } from "@mushroom/shared";
import { mobileAppController } from "../../../services/app-runtime";
import type { MobileAppState } from "../../../app/controller/useMobileAppState";
import { i18n } from "../../../i18n";

export function createLifecycleActions(state: MobileAppState) {
  // 防止同一条消息的撤回操作被并发触发（例如用户连击 / 快速重复点击菜单）。
  // 与服务端 client_request_id 幂等机制配合，UI 侧先拦截重复点击
  const recallInFlight = new Set<string>();

  function canRecallMessage(message: Message | null) {
    if (!message || !state.snapshot?.auth.user) {
      return false;
    }

    return (
      Number(message.sender_id) === Number(state.snapshot.auth.user.userId) &&
      Boolean(message.server_message_id) &&
      Number(message.is_recalled || 0) === 0
    );
  }

  async function handleToggleFavorite(message: Message) {
    if (!state.activeConversation) {
      return;
    }

    await mobileAppController.toggleFavoriteMessage({
      clientConversationId: state.activeConversation.client_conversation_id,
      clientMessageId: message.client_message_id
    });
    state.setSelectedMessageId(null);
  }

  async function handleTogglePin(message: Message) {
    if (!state.activeConversation) {
      return;
    }

    await mobileAppController.togglePinMessage({
      clientConversationId: state.activeConversation.client_conversation_id,
      clientMessageId: message.client_message_id
    });

    // 强制刷新置顶列表：窗口外的置顶消息被取消置顶时 activeMessages 不变，
    // 签名判断会跳过，必须显式触发重查（见 useMobileUiStateEffects）。
    state.bumpPinnedRefresh();
    state.setSelectedMessageId(null);
  }

  async function handleRecall(message: Message) {
    if (!state.activeConversation) {
      return;
    }
    const key = message.client_message_id;
    if (!key) return;
    if (recallInFlight.has(key)) return;
    recallInFlight.add(key);
    try {
      await mobileAppController.recallMessage({
        clientConversationId: state.activeConversation.client_conversation_id,
        clientMessageId: message.client_message_id
      });
      state.setSelectedMessageId(null);
      state.setStatus(i18n.t("systemMessage.messageRecalled"));
    } finally {
      recallInFlight.delete(key);
    }
  }

  async function handleToggleReaction(message: Message, emoji: string | null) {
    if (!state.activeConversation) {
      return;
    }
    if (Number(message.is_recalled || 0) > 0) {
      return;
    }

    try {
      await mobileAppController.toggleMessageReaction({
        clientConversationId: state.activeConversation.client_conversation_id,
        clientMessageId: message.client_message_id,
        emoji
      });
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : i18n.t("errorMessage.fallback");
      state.setStatus(messageText);
    }
  }

  return {
    canRecallMessage,
    handleToggleFavorite,
    handleTogglePin,
    handleRecall,
    handleToggleReaction
  };
}
