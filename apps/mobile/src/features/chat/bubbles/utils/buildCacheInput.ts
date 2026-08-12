import type { Message, MessageFileContent } from "@mushroom/shared";
import type { MobileMediaCacheCategory } from "../../../../platform/media-cache";

/**
 * 构造 `media-cache` 模块所需的缓存键 / 元数据。
 *
 * 设计目标：在 MessageBubble 的多个缓存 effect 之间复用同一份键构造逻辑，
 * 避免分散在组件内部时被意外改写为不一致的形状（例如某分支漏传 `mimeType`
 * 会导致缓存 key hash 偏移，进而退化为重复下载）。
 */
export function buildCacheInput(args: {
  username: string;
  message: Message;
  content: MessageFileContent;
  category: MobileMediaCacheCategory;
}) {
  const { username, message, content, category } = args;
  return {
    username,
    remoteUrl: content.url,
    category,
    messageId: message.server_message_id || message.client_message_id,
    uploadId: content.upload_id,
    originalName: content.name,
    mimeType: content.mime_type,
    size: content.size
  };
}
