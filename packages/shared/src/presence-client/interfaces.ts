/**
 * Adapter interfaces for `PresenceSubscriber`.
 *
 * 各端（mobile / web / electron）通过实现这两个接口把自己的 realtime client 与 presence store
 * 接入共享层，从而复用同一套订阅 / diff / 重订阅逻辑。
 */

import type {
  ClientWsMessage,
  PresenceChangedMessage,
  PresenceSnapshotMessage,
  PresenceSubscribeMessage,
  PresenceUnsubscribeMessage,
  ServerWsMessage
} from "../types/ws";

export type PresenceSubscriptionScope = "conversation" | "list" | "profile";

/**
 * Realtime client 适配器：仅暴露 PresenceSubscriber 真正需要的 4 个能力。
 * - `send`: 透传 presence.subscribe / presence.unsubscribe 等帧；
 * - `onMessage`: 监听服务端推送（PresenceChanged / PresenceSnapshot）；
 * - `onReconnected`: WS 重连后重新订阅当前活跃集合（关键：服务端订阅集可能因 device TTL 已过期）。
 * - `isConnected`: 当前是否已连接。未连接时缓冲订阅请求，待 onReconnected 时再下发。
 */
export interface PresenceRealtimeAdapter {
  send: (message: ClientWsMessage) => void;
  onMessage: (listener: (message: ServerWsMessage) => void) => () => void;
  onReconnected: (listener: () => void) => () => void;
  isConnected: () => boolean;
}

/**
 * Presence 状态写入适配器（可选）。
 *
 * 共享层只负责调用：传入则在收到 presence / presence.snapshot 时回调；
 * 不传则由各端的现有 realtime message listener 自行处理 presence 帧。
 *
 * 当前 mobile / web 都已有完整的 presence 入站合并逻辑（mergePresenceEntriesByUserId），
 * 因此此处通常传 undefined。保留接口是为未来在共享层统一 store 提供扩展点。
 */
export interface PresenceStoreAdapter {
  applyChanged: (message: PresenceChangedMessage) => void;
  applySnapshot: (message: PresenceSnapshotMessage) => void;
}

export type PresenceSubscribeFrame = PresenceSubscribeMessage;
export type PresenceUnsubscribeFrame = PresenceUnsubscribeMessage;
