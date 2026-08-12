import { useMemo, useState } from "react";
import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "../../avatars/UserAvatar";
import type { Conversation, Message } from "../../../types/chat";
import type { LoginUser } from "../../../types/user";
import { groupReactions } from "./messageListUtils";

interface ReactionDetailModalProps {
  message: Message | null;
  activeConversation: Conversation;
  loginUser: LoginUser;
  onClose: () => void;
}

/**
 * Modal listing who reacted to a message with which emoji. Driven by the parent
 * via a nullable `message` prop (modal is closed when message is null).
 */
export function ReactionDetailModal({
  message,
  activeConversation,
  loginUser,
  onClose
}: ReactionDetailModalProps) {
  const { t } = useTranslation();
  const groups = useMemo(
    () => groupReactions(message?.reactions, loginUser.userId),
    [message?.reactions, loginUser.userId]
  );
  const [activeEmoji, setActiveEmoji] = useState<string | "all">("all");
  if (!message) return null;
  const reactions = message.reactions ?? [];
  const displayed =
    activeEmoji === "all"
      ? reactions
      : reactions.filter(item => item.emoji === activeEmoji);

  const resolveName = (userId: number) => {
    if (Number(loginUser.userId) === userId) {
      return {
        name:
          loginUser.nickname ||
          loginUser.username ||
          t("display.unknownUser", { id: userId }),
        avatar: loginUser.avatar ?? null
      };
    }
    const member = (activeConversation.members ?? []).find(
      item => Number(item.user_id) === userId
    );
    if (member) {
      return {
        name: member.nickname || t("display.unknownUser", { id: userId }),
        avatar: member.avatar_url ?? null
      };
    }
    return { name: t("display.unknownUser", { id: userId }), avatar: null };
  };

  return (
    <Modal open footer={null} onCancel={onClose} width={420} destroyOnHidden>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 12
        }}
      >
        <button
          type="button"
          onClick={() => setActiveEmoji("all")}
          style={{
            padding: "4px 10px",
            borderRadius: 12,
            border:
              activeEmoji === "all"
                ? "1px solid #1677ff"
                : "1px solid transparent",
            background:
              activeEmoji === "all" ? "rgba(22,119,255,0.1)" : "transparent",
            cursor: "pointer"
          }}
        >
          {t("chatMessage.allReactions", { count: reactions.length })}
        </button>
        {groups.map(group => (
          <button
            key={group.emoji}
            type="button"
            onClick={() => setActiveEmoji(group.emoji)}
            style={{
              padding: "4px 10px",
              borderRadius: 12,
              border:
                activeEmoji === group.emoji
                  ? "1px solid #1677ff"
                  : "1px solid transparent",
              background:
                activeEmoji === group.emoji
                  ? "rgba(22,119,255,0.1)"
                  : "transparent",
              cursor: "pointer"
            }}
          >
            {group.emoji} {group.count}
          </button>
        ))}
      </div>
      <div style={{ maxHeight: 360, overflowY: "auto" }}>
        {displayed.map(item => {
          const meta = resolveName(Number(item.user_id));
          const isMine = Number(item.user_id) === Number(loginUser.userId);
          return (
            <div
              key={`${item.user_id}-${item.emoji}`}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 4px",
                gap: 12
              }}
            >
              <UserAvatar size={36} src={meta.avatar} name={meta.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>
                  {meta.name}
                  {isMine ? t("chatMessage.meSuffix") : ""}
                </div>
              </div>
              <div style={{ fontSize: 22 }}>{item.emoji}</div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
