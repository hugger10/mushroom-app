import type { ApiResult, ConversationReadStateResponse } from "../types/api";

/**
 * 群已读高水位刷新 —— 双端共享逻辑。
 *
 * 背景：群聊（type === 2）在打开 / WS 重连时需要拉一次
 * `GET /conversation/:id/read-state`，把所有成员的 last_read_seq 高水位
 * 同步到本端，作为 group_read 实时事件的"冷启动基线 + 离线补齐"。
 *
 * 历史上 web 端写在 `apps/web/src/hooks/useChat.ts`、
 * app-core 写在 `packages/app-core/.../read-receipt-service.ts`，
 * 两份重复实现极易漂移。本工具把请求 + 归一化 entries 抽到 shared，
 * 平台层只需注入：
 *   1) `fetchReadState`：HTTP 客户端调用。
 *   2) `applyEntries`：把 entries 写入本平台的存储（web 走 Electron IPC
 *      `bulkApplyGroupRead`，app-core 走 repository.upsertGroupReadStates）。
 *
 * 仅对群聊调用；单聊（type === 1）由调用方过滤。
 */

export interface NormalizedReadEntry {
  user_id: number;
  last_read_seq: number;
}

export interface RefreshGroupReadStateOptions {
  serverConversationId: string;
  fetchReadState: (
    conversationId: string
  ) => Promise<ApiResult<ConversationReadStateResponse>>;
  applyEntries: (
    serverConversationId: string,
    entries: NormalizedReadEntry[]
  ) => Promise<void> | void;
  /**
   * 拉取失败时的兜底日志钩子；缺省走 console.warn，避免在共享层强耦合
   * 平台日志框架。
   */
  onError?: (err: unknown) => void;
}

export async function refreshGroupReadState(
  options: RefreshGroupReadStateOptions
): Promise<void> {
  const { serverConversationId, fetchReadState, applyEntries, onError } =
    options;
  const id = String(serverConversationId ?? "").trim();
  if (!id) return;
  try {
    const resp = await fetchReadState(id);
    const rawEntries = resp?.data?.entries ?? [];
    const entries: NormalizedReadEntry[] = rawEntries.map(item => ({
      user_id: Number(item.user_id),
      last_read_seq: Number(item.last_read_seq)
    }));
    if (entries.length === 0) {
      return;
    }
    await applyEntries(id, entries);
  } catch (err) {
    if (onError) {
      onError(err);
    } else {
      console.warn("[refreshGroupReadState] failed", {
        conversationId: id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}
