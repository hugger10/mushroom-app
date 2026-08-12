/**
 * Web 端统一的「附件展示 URL 解析 + 自愈」Hook。
 *
 * 解决问题：聊天气泡（`VisualMediaMessages`）已经在 URL 过期时自愈，但
 * 会话媒体弹窗（`ConversationMediaModal`）/ 附件中心弹窗
 * （`AttachmentCenterModal`）的网格直接渲染 `<img src={content.url}>`，
 * 预签名 URL 过期后会一直显示破图（在某些主题下表现为灰色背景）。
 *
 * 本 hook 把原本散落在 `VisualMediaMessages.tsx` 里的 self-heal 逻辑
 * 抽出复用，确保气泡、弹窗、附件中心三处行为一致：
 *   1. URL 优先级用 `pickAttachmentDisplayUri` 统一：
 *        localCacheUri > refreshed.preview_url > content.preview_url
 *        > refreshed.thumb_url > content.thumb_url
 *        > refreshed.url > content.url
 *      其中 `refreshed` 来自 `refreshedAttachmentCache` 进程内内存缓存，
 *      由 `refreshAttachmentUrlsAndPersist` 成功后写入；纯 web 环境
 *      （无 Electron SQLite）也能用上刷新的新 URL。
 *   2. `<img onError>` → `onError()`：每个 uploadId 只触发一次
 *      `refreshAttachmentUrlsAndPersist`（dedupe，防止网格里同一附件
 *      多 cell 触发风暴）。
 *   3. 刷新成功后 `setBust` 触发 re-render，hook 重新从内存缓存读取
 *      新 URL；cache-bust query 作为兜底（防止新 URL 与旧 URL 字面
 *      相同时浏览器仍用磁盘缓存）。
 *   4. 仍然失败 → `unavailable = true`，UI 决定降级表现。
 */

import { useEffect, useRef, useState } from "react";
import type { MessageFileContent } from "@mushroom/shared";
import { pickAttachmentDisplayUri } from "@mushroom/shared";
import { refreshAttachmentUrlsAndPersist } from "../http/refreshAttachmentUrls";
import { getRefreshedAttachmentWeb } from "../http/refreshedAttachmentCache";

export interface UseAttachmentDisplayUrlResult {
  /** 当前应绑定到 `<img src>` / `<video src>` 的 URL，已做 cache-bust。 */
  src: string;
  /** 经过一次自愈仍失败 → UI 应渲染降级占位。 */
  unavailable: boolean;
  /** 绑定到 `<img onError>` / `<video onError>`。 */
  onError: () => void;
}

function withCacheBust(url: string, bust: number) {
  if (!bust || !url) return url;
  if (
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("file:")
  ) {
    return url;
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}__r=${bust}`;
}

export function useAttachmentDisplayUrl(
  content:
    | Pick<
        MessageFileContent,
        "url" | "thumb_url" | "preview_url" | "upload_id"
      >
    | null
    | undefined,
  options?: {
    /** Electron 本地缓存返回的 file:// URL；不传则只用服务端 URL。 */
    localCacheUrl?: string | null;
    enabled?: boolean;
  }
): UseAttachmentDisplayUrlResult {
  const enabled = options?.enabled !== false;
  const localCacheUrl = options?.localCacheUrl ?? null;
  const uploadId = content?.upload_id;

  const [bust, setBust] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const triedRef = useRef(false);

  // 内容变化时重置「不可用」与重试标记。
  useEffect(() => {
    triedRef.current = false;
    setUnavailable(false);
    setBust(0);
  }, [content?.url, content?.thumb_url, content?.preview_url, localCacheUrl]);

  const baseUrl =
    pickAttachmentDisplayUri(
      content ?? { url: "" },
      uploadId ? getRefreshedAttachmentWeb(uploadId) : null,
      localCacheUrl
    ) ?? "";

  const onError = () => {
    if (!enabled || !uploadId) {
      setUnavailable(true);
      return;
    }
    if (triedRef.current) {
      setUnavailable(true);
      return;
    }
    triedRef.current = true;
    void refreshAttachmentUrlsAndPersist([uploadId])
      .then(result => {
        const info = result[uploadId];
        if (info === undefined) {
          // 刷新没拿到该 uploadId 的新 URL（服务端返回空 / 失败）。
          // 仍然 bump 一次让 <img> 重试，浏览器再次 onError 时 triedRef
          // 已为 true → 标记 unavailable。
          setBust(b => b + 1);
          return;
        }
        // 新 URL 已写入 refreshedAttachmentCache，setBust 触发 re-render
        // 时 baseUrl 会从缓存读取到新值；cache-bust 兜底防止字面相同时
        // 浏览器仍用磁盘缓存。
        setBust(b => b + 1);
        setUnavailable(false);
      })
      .catch(() => {
        setUnavailable(true);
      });
  };

  return {
    src: withCacheBust(baseUrl, bust),
    unavailable,
    onError
  };
}
