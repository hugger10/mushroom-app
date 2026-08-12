import { Button, Empty, List, Modal, Tabs } from "antd";
import { useTranslation } from "react-i18next";
import { getMessageSummaryText } from "@mushroom/shared";
import type { Message } from "../../types/chat";
import { formatChatTimeUnified } from "../../utils/date";
import { getMessageDisplayName } from "../../utils/display";

interface MessageCollectionsModalProps {
  open: boolean;
  activeTab: "pinned" | "favorited";
  pinnedMessages: Message[];
  favoritedMessages: Message[];
  loading: boolean;
  onCancel: () => void;
  onTabChange: (tab: "pinned" | "favorited") => void;
  onJumpToMessage: (message: Message) => void;
}

function MessageCollectionList({
  items,
  emptyText,
  onJumpToMessage
}: {
  items: Message[];
  emptyText: string;
  onJumpToMessage: (message: Message) => void;
}) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return <Empty description={emptyText} />;
  }

  return (
    <List
      dataSource={items}
      renderItem={item => (
        <List.Item
          actions={[
            <Button
              key="jump"
              size="small"
              onClick={() => onJumpToMessage(item)}
            >
              {t("chatMedia.jump")}
            </Button>
          ]}
        >
          <List.Item.Meta
            title={getMessageDisplayName({
              message: item,
              defaultLabel: t("display.unknownMember")
            })}
            description={
              <>
                <div style={{ marginBottom: 4, wordBreak: "break-word" }}>
                  {getMessageSummaryText(item.content)}
                </div>
                <div style={{ fontSize: 12, color: "#999" }}>
                  {formatChatTimeUnified(item.created_at)}
                </div>
              </>
            }
          />
        </List.Item>
      )}
    />
  );
}

export function MessageCollectionsModal({
  open,
  activeTab,
  pinnedMessages,
  favoritedMessages,
  loading,
  onCancel,
  onTabChange,
  onJumpToMessage
}: MessageCollectionsModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      className="im-modal"
      title={t("chatMedia.savedMessages")}
      open={open}
      onCancel={onCancel}
      footer={null}
    >
      <Tabs
        activeKey={activeTab}
        onChange={key => onTabChange(key as "pinned" | "favorited")}
        items={[
          {
            key: "pinned",
            label: t("chatMedia.pinnedCount", { count: pinnedMessages.length }),
            children: loading ? (
              <div style={{ padding: 24, textAlign: "center" }}>
                {t("chatMedia.loading")}
              </div>
            ) : (
              <MessageCollectionList
                items={pinnedMessages}
                emptyText={t("chatMedia.noPinnedMessages")}
                onJumpToMessage={onJumpToMessage}
              />
            )
          },
          {
            key: "favorited",
            label: t("chatMedia.favoritesCount", {
              count: favoritedMessages.length
            }),
            children: loading ? (
              <div style={{ padding: 24, textAlign: "center" }}>
                {t("chatMedia.loading")}
              </div>
            ) : (
              <MessageCollectionList
                items={favoritedMessages}
                emptyText={t("chatMedia.noFavoriteMessages")}
                onJumpToMessage={onJumpToMessage}
              />
            )
          }
        ]}
      />
    </Modal>
  );
}
