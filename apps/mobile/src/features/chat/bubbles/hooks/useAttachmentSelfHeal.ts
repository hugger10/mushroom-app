import { useCallback, useEffect, useRef, useState } from "react";
import {
  refreshAttachmentUrlsAndCache,
  subscribeToAttachmentRefresh
} from "../../../../services/refresh-attachment-urls";

/**
 * 附件 URL 过期自愈。
 *
 * 行为：
 * - 订阅 `subscribeToAttachmentRefresh`，当全局缓存中的新签名 URL 到位时
 *   触发组件 force re-render，使消费 `getRefreshedAttachment` 的子节点拿到
 *   新 URL。
 * - 暴露 `triggerAttachmentSelfHeal(uploadId)`：在图片/视频 `onError` 中
 *   调用一次（同一 uploadId 仅触发一次），异步拉取新签名 URL。
 *
 * 注意：本 hook 不持久化重试状态；卸载后再挂载会再次允许重试一次。
 */
export function useAttachmentSelfHeal() {
  // 仅作为 trigger，让订阅回调能强制重渲染。
  const [, forceRefreshTick] = useState(0);
  const triedSelfHealRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return subscribeToAttachmentRefresh(() => {
      forceRefreshTick(tick => tick + 1);
    });
  }, []);

  const triggerAttachmentSelfHeal = useCallback(
    (
      uploadId: string | undefined | null,
      messageId?: string | undefined | null
    ) => {
      if (!uploadId) return;
      if (triedSelfHealRef.current.has(uploadId)) return;
      triedSelfHealRef.current.add(uploadId);
      void refreshAttachmentUrlsAndCache(
        [uploadId],
        messageId ? { messageIds: { [uploadId]: messageId } } : undefined
      );
    },
    []
  );

  return { triggerAttachmentSelfHeal };
}
