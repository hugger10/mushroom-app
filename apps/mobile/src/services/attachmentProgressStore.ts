import { useSyncExternalStore } from "react";

/**
 * 内存级附件上传进度 store（不持久化、不通过网络传输）。
 *
 * 设计目标 — 与 `apps/web/src/hooks/attachmentProgressStore.ts` 对齐：
 * - 上传进度可能每 100ms 一次，写 SQLite/MMKV 会引发明显写放大；
 *   仅在 0/100/失败这三个关键节点把状态落库（由 message-actions 处理），
 *   中间过程的视觉进度通过该 store 同步给 MessageBubble。
 * - 单例：附件以 client_message_id 为 key，互不影响。
 * - 订阅基于 useSyncExternalStore，React 18 并发安全（RN 0.69+ 已内置）。
 */

type Listener = () => void;

const progressMap = new Map<string, number>();
const listenersByKey = new Map<string, Set<Listener>>();

function emit(clientMessageId: string): void {
  const set = listenersByKey.get(clientMessageId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    listener();
  }
}

export function setAttachmentProgress(
  clientMessageId: string,
  percent: number
): void {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  if (progressMap.get(clientMessageId) === clamped) return;
  progressMap.set(clientMessageId, clamped);
  emit(clientMessageId);
}

export function clearAttachmentProgress(clientMessageId: string): void {
  if (!progressMap.has(clientMessageId)) return;
  progressMap.delete(clientMessageId);
  emit(clientMessageId);
}

export function getAttachmentProgress(
  clientMessageId: string
): number | undefined {
  return progressMap.get(clientMessageId);
}

export function useAttachmentProgress(
  clientMessageId: string | undefined
): number | undefined {
  return useSyncExternalStore(
    subscribe => {
      if (!clientMessageId) return () => {};
      let set = listenersByKey.get(clientMessageId);
      if (!set) {
        set = new Set();
        listenersByKey.set(clientMessageId, set);
      }
      set.add(subscribe);
      return () => {
        const s = listenersByKey.get(clientMessageId);
        if (!s) return;
        s.delete(subscribe);
        if (s.size === 0) listenersByKey.delete(clientMessageId);
      };
    },
    () => (clientMessageId ? progressMap.get(clientMessageId) : undefined),
    () => undefined
  );
}
