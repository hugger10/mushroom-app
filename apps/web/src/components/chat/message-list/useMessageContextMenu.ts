import { useCallback } from "react";
import { App as AntdApp } from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import { isFileMessageContent } from "@mushroom/shared";
import type { Conversation, Message } from "../../../types/chat";
import type { LoginUser } from "../../../types/user";
import { saveMediaAs } from "./messageListUtils";

interface UseMessageContextMenuParams {
  activeConversation: Conversation;
  loginUser: LoginUser;
  onReply: (message: Message) => void;
  onRecallMessage: (message: Message) => void;
  onForwardMessage?: (message: Message) => void;
  onEnterSelectionMode?: (clientMessageId: string) => void;
  onViewGroupReadReceipts?: (message: Message) => void;
  /**
   * 删除一条"失败的本地附件草稿"（仅 type=2 / status=-1 / 无 server_message_id）。
   * 无二次确认，对齐 WhatsApp 的"长按 → 删除"行为。
   */
  onDeleteFailedMessage?: (message: Message) => void;
}

/**
 * Build the right-click menu items for a chat message. Returns a
 * `getMenuItems(message)` callable; consumers pass it to <Dropdown menu.items>.
 * Returns `[]` for system / recalled / unsynced messages, signalling the row
 * should not render a context menu at all.
 */
export function useMessageContextMenu({
  activeConversation,
  loginUser,
  onReply,
  onRecallMessage,
  onForwardMessage,
  onEnterSelectionMode,
  onViewGroupReadReceipts,
  onDeleteFailedMessage
}: UseMessageContextMenuParams) {
  const { t } = useTranslation();
  const { message: messageApi } = AntdApp.useApp();

  const handleSaveMediaAs = useCallback(
    async (msg: Message) => {
      const result = await saveMediaAs(msg);
      switch (result.kind) {
        case "saved":
          messageApi.success(t("chat.saveAsSuccess"));
          break;
        case "unsupported":
          messageApi.error(t("chat.saveAsUnsupported"));
          break;
        case "error":
          messageApi.error(t("chat.saveAsFailed"));
          break;
        case "canceled":
        default:
          break;
      }
    },
    [messageApi, t]
  );

  const getMenuItems = useCallback(
    (msg: Message): MenuProps["items"] => {
      // 失败的本地附件草稿（未上链，仅 type=2）：只展示一个"删除"项，
      // 不允许引用 / 转发 / 多选 / 查看已读（这些都需要 server_message_id）。
      // 对齐 WhatsApp / Telegram 的"失败消息长按 → 只能删除"语义。
      const isFailedLocalAttachment =
        msg.status === -1 &&
        !msg.server_message_id &&
        msg.type === 2 &&
        !msg.is_recalled;
      if (isFailedLocalAttachment) {
        if (!onDeleteFailedMessage) return [];
        return [
          {
            key: "delete-failed",
            danger: true,
            label: t("chat.delete", "删除"),
            onClick: () => onDeleteFailedMessage(msg)
          }
        ];
      }

      if (!msg.server_message_id || msg.is_recalled) {
        return [];
      }

      const items: NonNullable<MenuProps["items"]> = [
        {
          key: "quote",
          label: t("chat.reply"),
          onClick: () => onReply(msg)
        }
      ];

      if (msg.sender_id === loginUser.userId) {
        items.push({
          key: "recall",
          label: t("chat.recall"),
          onClick: () => onRecallMessage(msg)
        });
      }

      if (isFileMessageContent(msg.content)) {
        items.push({
          key: "save-as",
          label: t("chat.saveAs"),
          onClick: () => {
            void handleSaveMediaAs(msg);
          }
        });
      }

      items.push({
        key: "forward",
        label: t("chatMessage.forward"),
        onClick: () => onForwardMessage?.(msg)
      });

      items.push({
        key: "multi-select",
        label: t("chatMessage.multiSelect"),
        onClick: () => onEnterSelectionMode?.(msg.client_message_id)
      });

      // Group + own message: expose "view read receipts".
      if (
        activeConversation.type !== 1 &&
        msg.sender_id === loginUser.userId &&
        onViewGroupReadReceipts
      ) {
        items.push({
          key: "view-read",
          label: t("chat.viewReadReceipts", "查看已读"),
          onClick: () => onViewGroupReadReceipts(msg)
        });
      }

      return items;
    },
    [
      activeConversation.type,
      handleSaveMediaAs,
      loginUser.userId,
      onDeleteFailedMessage,
      onEnterSelectionMode,
      onForwardMessage,
      onRecallMessage,
      onReply,
      onViewGroupReadReceipts,
      t
    ]
  );

  return getMenuItems;
}
