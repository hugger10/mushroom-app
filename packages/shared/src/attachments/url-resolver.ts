/**
 * 跨端附件 URL 解析的「纯逻辑」助手（无 React / RN 依赖）。
 *
 * 服务端为图片/视频缩略图返回的是预签名 URL（详见
 * `packages/shared/src/types/ws.ts` 注释），客户端持久化到本地数据库后
 * 会过期。各端在加载失败时通过 `POST /file/attachment/refresh-urls`
 * 获取新签名 URL 写入内存缓存（mobile：`refresh-attachment-urls.ts`；
 * web：`refreshAttachmentUrls.ts`），再次渲染时就需要把
 * 「持久化中的旧 URL」与「内存中的新 URL」按优先级合并。
 *
 * 本模块只提供这一套合并/选择逻辑，给 mobile `MediaCell` /
 * `MessageBubble`、web `ConversationMediaModal` /
 * `AttachmentCenterModal` / `VisualMediaMessages` 共用，避免实现漂移。
 */

import type { MessageFileContent } from "../types/models";

/**
 * 内存中已刷新的附件 URL 信息（mobile 与 web 的实现都返回这一结构）。
 */
export interface RefreshedAttachmentUrls {
  url?: string;
  thumb_url?: string;
  preview_url?: string;
  thumb_status?: "none" | "pending" | "ready" | "failed";
}

function pickNonEmpty(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

/**
 * 选择「缩略 / 预览图」URL：
 *   refreshed.preview_url > content.preview_url
 *   > refreshed.thumb_url > content.thumb_url
 *
 * 不会回退到原图 URL —— 调用方如果需要原图回退，请自行串联
 * `pickAttachmentFullUrl`。
 */
export function pickAttachmentPreviewUrl(
  content: Pick<MessageFileContent, "thumb_url" | "preview_url">,
  refreshed?: RefreshedAttachmentUrls | null
): string | null {
  return pickNonEmpty(
    refreshed?.preview_url,
    content.preview_url,
    refreshed?.thumb_url,
    content.thumb_url
  );
}

/**
 * 选择「视频封面」URL：
 *   封面附件（thumbnail_upload_id）刚刷新的原图 URL
 *   > content.thumb_url > content.preview_url
 *
 * 背景：服务端不为视频生成封面（thumb_status='none'），视频封面是发送方
 * 上传的独立 image attachment（content.thumbnail_upload_id），其 object_name
 * 即封面原图，content.thumb_url 存的就是它的预签名 URL。按主视频 upload_id
 * 刷新拿不到封面 URL，因此刷新封面附件后要在此优先取用；封面附件也按
 * image 处理，thumbRefreshed.url 即封面原图。
 */
export function pickVideoCoverUrl(
  content: Pick<MessageFileContent, "thumb_url" | "preview_url">,
  thumbRefreshed?: RefreshedAttachmentUrls | null
): string | null {
  return pickNonEmpty(
    thumbRefreshed?.url,
    content.thumb_url,
    content.preview_url
  );
}

/**
 * 选择「原图 / 原文件」URL：refreshed.url > content.url。
 */
export function pickAttachmentFullUrl(
  content: Pick<MessageFileContent, "url">,
  refreshed?: RefreshedAttachmentUrls | null
): string | null {
  return pickNonEmpty(refreshed?.url, content.url);
}

/**
 * 通用展示 URL：本地缓存 file:// URI > 本地预览路径 > 缩略/预览 > 原图。
 *
 * 用于「优先就近、再回退到服务端 URL」的渲染场景。本地缓存参数留空
 * 则跳过该层。
 *
 * `local_preview_uri` 由移动端附件上传后在 content 中保留（patchAttachmentUploaded
 * 不再删除该字段），确保上传完成后 `<Image>` 直接从本地文件渲染，避免从服务器
 * 重新下载导致的灰色骨架闪烁。
 */
export function pickAttachmentDisplayUri(
  content: Pick<
    MessageFileContent,
    "url" | "thumb_url" | "preview_url" | "local_preview_uri"
  >,
  refreshed?: RefreshedAttachmentUrls | null,
  localCacheUri?: string | null
): string | null {
  return pickNonEmpty(
    localCacheUri,
    content.local_preview_uri,
    pickAttachmentPreviewUrl(content, refreshed),
    pickAttachmentFullUrl(content, refreshed)
  );
}
