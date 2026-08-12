import type { ReactNode } from "react";
import {
  ClearOutlined,
  EllipsisOutlined,
  PhoneOutlined,
  SearchOutlined,
  VideoCameraOutlined
} from "@ant-design/icons";
import { Button, Dropdown, Modal, type MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import type { Conversation } from "../../types/chat";
import type { WsUiState } from "../../ws/WSClient";

interface ChatHeaderProps {
  activeConversation: Conversation;
  isStatusOnline?: boolean;
  showStatusDot?: boolean;
  subtitle?: string | null;
  peerProfileTrigger?: ReactNode;
  wsUiState: WsUiState;
  onOpenSearch: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onClearMessages: () => void;
}

export function ChatHeader({
  activeConversation,
  isStatusOnline = false,
  showStatusDot = false,
  subtitle,
  peerProfileTrigger,
  wsUiState,
  onOpenSearch,
  onStartAudioCall,
  onStartVideoCall,
  onClearMessages
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const conversationTitle =
    activeConversation.type === 2
      ? `${activeConversation.display_name || activeConversation.name} (${activeConversation.members?.length ?? 0})`
      : activeConversation.display_name || activeConversation.name;

  const moreMenuItems: MenuProps["items"] = [
    {
      key: "search",
      icon: <SearchOutlined />,
      label: t("chat.searchConversation"),
      onClick: () => onOpenSearch()
    },
    { type: "divider" },
    {
      key: "clear",
      icon: <ClearOutlined />,
      label: t("conversationList.clearMessages"),
      danger: true,
      onClick: () =>
        Modal.confirm({
          title: t("conversationList.clearTitle"),
          content: t("conversationList.clearDescription"),
          okText: t("conversationList.clearConfirm"),
          okButtonProps: { danger: true },
          cancelText: t("common.cancel"),
          onOk: () => onClearMessages()
        })
    }
  ];

  return (
    <div className="im-chat-header">
      <div className="im-chat-header-main">
        {peerProfileTrigger}

        <div style={{ minWidth: 0 }}>
          <div className="im-chat-title">{conversationTitle}</div>
          {subtitle || activeConversation.type === 2 ? (
            <div className="im-chat-presence">
              {showStatusDot ? (
                <span
                  className={`im-chat-presence-dot ${isStatusOnline ? "im-chat-presence-dot-online" : "im-chat-presence-dot-offline"}`}
                />
              ) : null}
              <div
                className={`im-chat-subtitle ${isStatusOnline ? "im-chat-subtitle-online" : ""}`}
                style={{
                  maxWidth: 420,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {subtitle || "\u00A0"}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="im-chat-action-group">
        <Button
          className="im-chat-secondary-button im-chat-search-button"
          icon={<VideoCameraOutlined />}
          onClick={onStartVideoCall}
          disabled={wsUiState.status !== "connected"}
          aria-label={t("chat.videoCall")}
          title={t("chat.videoCall")}
        />
        <Button
          className="im-chat-secondary-button im-chat-search-button"
          icon={<PhoneOutlined />}
          onClick={onStartAudioCall}
          disabled={wsUiState.status !== "connected"}
          aria-label={t("chat.audioCall")}
          title={t("chat.audioCall")}
        />
        <Dropdown
          menu={{ items: moreMenuItems }}
          trigger={["click"]}
          placement="bottomRight"
          classNames={{ root: "im-chat-header-more-dropdown" }}
        >
          <Button
            className="im-chat-secondary-button im-chat-search-button"
            icon={<EllipsisOutlined />}
            aria-label={t("chat.moreActions")}
            title={t("chat.moreActions")}
          />
        </Dropdown>
      </div>
    </div>
  );
}
