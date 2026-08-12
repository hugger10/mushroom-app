import { Button, Spin } from "antd";
import { DownOutlined, SyncOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

interface LoadingHistoryHeaderProps {
  visible: boolean;
}

/** Sticky spinner shown at the top while older history is being fetched. */
export function LoadingHistoryHeader({ visible }: LoadingHistoryHeaderProps) {
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px",
        borderRadius: "8px",
        margin: "6px 0",
        gap: "8px",
        fontSize: "14px",
        color: "#666",
        position: "sticky",
        top: 8,
        zIndex: 100,
        background: "rgba(255,255,255,0.9)"
      }}
    >
      <Spin
        indicator={<SyncOutlined style={{ fontSize: 16 }} spin />}
        size="small"
      />
      <span>{t("chat.loadingHistory")}</span>
    </div>
  );
}

interface NoMoreHistoryFooterProps {
  visible: boolean;
}

/** Hint shown above the message list once all history has been loaded. */
export function NoMoreHistoryFooter({ visible }: NoMoreHistoryFooterProps) {
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <div
      style={{
        textAlign: "center",
        color: "#999",
        fontSize: 12,
        margin: "12px 0"
      }}
    >
      {t("chat.noMoreHistory")}
    </div>
  );
}

interface FloatingActionsProps {
  showMentionReminder: boolean;
  onMentionReminderClick?: () => void;
  showScrollToBottom: boolean;
  onScrollToBottom: () => void;
}

/**
 * Floating buttons stacked at the bottom-right of the message list: the
 * "@me" reminder (jumps to unread mention) and the "scroll to bottom" circle.
 */
export function FloatingActions({
  showMentionReminder,
  onMentionReminderClick,
  showScrollToBottom,
  onScrollToBottom
}: FloatingActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="im-message-floating-actions">
      {showMentionReminder ? (
        <Button
          className="im-mention-reminder-button"
          danger
          onClick={onMentionReminderClick}
        >
          {t("chat.mentionMe")}
        </Button>
      ) : null}
      {showScrollToBottom ? (
        <Button
          className="im-scroll-bottom-button"
          shape="circle"
          icon={<DownOutlined />}
          onClick={onScrollToBottom}
        />
      ) : null}
    </div>
  );
}
