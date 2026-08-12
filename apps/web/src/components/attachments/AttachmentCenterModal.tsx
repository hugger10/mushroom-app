import { Empty, List, Modal, Tabs, Tag } from "antd";
import { useTranslation } from "react-i18next";
import {
  formatFileSize,
  getMessageSummaryText,
  isFileMessageContent,
  isImageFileMessageContent
} from "@mushroom/shared";
import type { MessageFileContent } from "@mushroom/shared";
import { formatChatTimeUnified } from "../../utils/date";
import type { SearchMessageResult } from "../../types/chat";
import { getMessageDisplayName } from "../../utils/display";
import { useAttachmentDisplayUrl } from "../../hooks/useAttachmentDisplayUrl";

interface AttachmentCenterModalProps {
  open: boolean;
  loading: boolean;
  activeTab: "images" | "files";
  items: { images: SearchMessageResult[]; files: SearchMessageResult[] };
  onCancel: () => void;
  onTabChange: (tab: "images" | "files") => void;
  onOpenImage: (items: SearchMessageResult[], index: number) => void;
  onOpenMessage: (item: SearchMessageResult) => void;
}

export function AttachmentCenterModal({
  open,
  loading,
  activeTab,
  items,
  onCancel,
  onTabChange,
  onOpenImage,
  onOpenMessage
}: AttachmentCenterModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      className="im-modal"
      title={t("chatMedia.attachmentCenter")}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={880}
    >
      <Tabs
        activeKey={activeTab}
        onChange={key => onTabChange(key as "images" | "files")}
        items={[
          {
            key: "images",
            label: t("chatMedia.imagesCount", { count: items.images.length }),
            children:
              items.images.length === 0 ? (
                <Empty
                  description={
                    loading
                      ? t("chatMedia.loadingImages")
                      : t("chatMedia.noImagesOrVideos")
                  }
                />
              ) : (
                <div className="im-media-grid">
                  {items.images.map((item, index) =>
                    isFileMessageContent(item.content) &&
                    isImageFileMessageContent(item.content) ? (
                      <button
                        key={item.client_message_id}
                        className="im-media-tile"
                        type="button"
                        onClick={() => onOpenImage(items.images, index)}
                      >
                        <AttachmentCenterThumb content={item.content} />
                        <div
                          style={{
                            fontSize: 12,
                            color: "#666",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {(item.conversation_label ||
                            t("chatMedia.conversation")) +
                            " | " +
                            item.content.name}
                        </div>
                      </button>
                    ) : null
                  )}
                </div>
              )
          },
          {
            key: "files",
            label: t("chatMedia.filesCount", { count: items.files.length }),
            children:
              items.files.length === 0 ? (
                <Empty
                  description={
                    loading
                      ? t("chatMedia.loadingFiles")
                      : t("chatMedia.noFiles")
                  }
                />
              ) : (
                <List
                  dataSource={items.files}
                  renderItem={item => (
                    <List.Item
                      style={{ cursor: "pointer" }}
                      onClick={() => onOpenMessage(item)}
                    >
                      <List.Item.Meta
                        title={
                          isFileMessageContent(item.content)
                            ? item.content.name
                            : getMessageSummaryText(item.content)
                        }
                        description={
                          isFileMessageContent(item.content)
                            ? `${item.conversation_label || t("chatMedia.conversation")} | ${formatFileSize(item.content.size)} | ${formatChatTimeUnified(item.created_at)}`
                            : `${item.conversation_label || t("chatMedia.conversation")} | ${formatChatTimeUnified(item.created_at)}`
                        }
                      />
                      <Tag>
                        {getMessageDisplayName({
                          message: item,
                          defaultLabel: t("display.unknownMember")
                        })}
                      </Tag>
                    </List.Item>
                  )}
                />
              )
          }
        ]}
      />
    </Modal>
  );
}

/**
 * 附件中心网格的缩略图，逻辑与 `ConversationMediaThumb` 一致：
 * 预签名 URL 过期时通过 `refresh-urls` 自愈，失败回落为灰色背景。
 */
function AttachmentCenterThumb({ content }: { content: MessageFileContent }) {
  const { src, unavailable, onError } = useAttachmentDisplayUrl(content);
  if (unavailable || !src) {
    return <div aria-label={content.name} />;
  }
  return <img src={src} alt={content.name} onError={onError} />;
}
