import { Empty, List, Modal, Spin, Tabs } from "antd";
import {
  formatFileSize,
  getMessageSummaryText,
  isFileMessageContent
} from "@mushroom/shared";
import type { MessageFileContent } from "@mushroom/shared";
import { formatChatTimeUnified } from "../../utils/date";
import type { Message, SearchMessageResult } from "../../types/chat";
import { useAttachmentDisplayUrl } from "../../hooks/useAttachmentDisplayUrl";

interface ConversationMediaModalProps {
  open: boolean;
  activeTab: "images" | "files";
  mediaItems: { images: Message[]; files: Message[] };
  isLoading: boolean;
  onCancel: () => void;
  onTabChange: (tab: "images" | "files") => void;
  onOpenImagePreview: (images: Message[], index: number) => void;
  onJumpToFileMessage: (item: SearchMessageResult) => void;
}

export function ConversationMediaModal({
  open,
  activeTab,
  mediaItems,
  isLoading,
  onCancel,
  onTabChange,
  onOpenImagePreview,
  onJumpToFileMessage
}: ConversationMediaModalProps) {
  return (
    <Modal
      className="im-modal"
      title="Conversation media"
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
            label: `Images (${mediaItems.images.length})`,
            children: isLoading ? (
              <div style={{ padding: 24, textAlign: "center" }}>
                <Spin />
              </div>
            ) : mediaItems.images.length === 0 ? (
              <Empty description="No image messages in this conversation yet" />
            ) : (
              <div className="im-media-grid">
                {mediaItems.images.map((item, index) =>
                  isFileMessageContent(item.content) ? (
                    <button
                      className="im-media-tile"
                      key={item.client_message_id}
                      type="button"
                      onClick={() =>
                        onOpenImagePreview(mediaItems.images, index)
                      }
                    >
                      <ConversationMediaThumb content={item.content} />
                      <div
                        style={{
                          fontSize: 12,
                          color: "#666",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {item.content.name}
                      </div>
                    </button>
                  ) : null
                )}
              </div>
            )
          },
          {
            key: "files",
            label: `Files (${mediaItems.files.length})`,
            children: isLoading ? (
              <div style={{ padding: 24, textAlign: "center" }}>
                <Spin />
              </div>
            ) : mediaItems.files.length === 0 ? (
              <Empty description="No file messages in this conversation yet" />
            ) : (
              <List
                dataSource={mediaItems.files}
                renderItem={item => (
                  <List.Item
                    className="im-file-row"
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      onJumpToFileMessage(item as SearchMessageResult)
                    }
                  >
                    <List.Item.Meta
                      title={
                        isFileMessageContent(item.content)
                          ? item.content.name
                          : getMessageSummaryText(item.content)
                      }
                      description={
                        isFileMessageContent(item.content)
                          ? formatFileSize(item.content.size)
                          : formatChatTimeUnified(item.created_at)
                      }
                    />
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
 * 会话媒体网格的缩略图。优先使用服务端 preview/thumb URL，加载失败时
 * 调用 `refresh-urls` 自愈；最终仍失败保留原灰色背景（与移动端
 * `MediaCell` 行为一致）。
 */
function ConversationMediaThumb({ content }: { content: MessageFileContent }) {
  const { src, unavailable, onError } = useAttachmentDisplayUrl(content);
  if (unavailable || !src) {
    // 失败占位：留出空白让 .im-media-tile 自身的灰色背景显示。
    return <div aria-label={content.name} />;
  }
  return <img src={src} alt={content.name} onError={onError} />;
}
