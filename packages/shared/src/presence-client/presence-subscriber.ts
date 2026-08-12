import type {
  PresenceRealtimeAdapter,
  PresenceStoreAdapter,
  PresenceSubscriptionScope
} from "./interfaces";

/**
 * 客户端按需订阅核心。所有平台共享同一份订阅状态机：
 *
 *   - `syncConversation(peerId | null)`  在某个一对一会话详情上的订阅（最多 1 个 peer）。
 *   - `syncList(peerIds)`                列表 / 联系人页可见 peer 集合（差异下发）。
 *   - `syncProfile(peerId | null)`       打开 peer profile 弹层 / 资料页时的临时订阅。
 *
 * 内部维护"按 scope 分桶"的订阅集合，外部一次 `sync*` 调用会自动 diff 出
 * 需要新增的 subscribe 与可下线的 unsubscribe，并通过 RealtimeAdapter 下发。
 *
 * WS 重连时（onReconnected）会**完整重发当前活跃订阅**，
 * 因为服务端的订阅集合按 deviceId 维度并带 TTL，重连后必须重新建立。
 */
export class PresenceSubscriber {
  private readonly scopeMap: Record<PresenceSubscriptionScope, Set<number>> = {
    conversation: new Set(),
    list: new Set(),
    profile: new Set()
  };
  private active = new Set<number>();
  private disposers: Array<() => void> = [];
  private disposed = false;
  // Parameter properties (`constructor(private readonly realtime: ...)`)
  // emit TS-only runtime code that violates `erasableSyntaxOnly`, which is
  // required for Node 22 `--experimental-strip-types` consumers (the
  // mobile test runner and any future server-side script that imports
  // shared/*.ts directly). Keep the fields as plain declarations and
  // assign in the constructor body.
  private readonly realtime: PresenceRealtimeAdapter;
  private readonly store?: PresenceStoreAdapter;

  constructor(realtime: PresenceRealtimeAdapter, store?: PresenceStoreAdapter) {
    this.realtime = realtime;
    this.store = store;
    // 入站消息：分发到 store（若提供）
    this.disposers.push(
      this.realtime.onMessage(message => {
        if (!this.store) return;
        if (message.messageClassify === "presence") {
          this.store.applyChanged(message);
        } else if (message.messageClassify === "presence.snapshot") {
          this.store.applySnapshot(message);
        }
      })
    );

    // 重连：完整重发活跃订阅
    this.disposers.push(
      this.realtime.onReconnected(() => {
        if (this.disposed) return;
        const activeIds = Array.from(this.active);
        if (activeIds.length > 0) {
          this.sendSubscribe(activeIds, "list");
        }
      })
    );
  }

  /** 设置当前会话详情订阅。传 null 表示清空。 */
  syncConversation(peerId: number | null | undefined) {
    const next = new Set<number>();
    if (peerId && Number.isFinite(peerId) && peerId > 0) {
      next.add(Number(peerId));
    }
    this.applyScope("conversation", next);
  }

  /** 设置列表 / 可见会话订阅。传 [] 表示清空。 */
  syncList(peerIds: Iterable<number> | null | undefined) {
    const next = new Set<number>();
    if (peerIds) {
      for (const id of peerIds) {
        const numeric = Number(id);
        if (Number.isFinite(numeric) && numeric > 0) {
          next.add(numeric);
        }
      }
    }
    this.applyScope("list", next);
  }

  /** 设置 profile 弹层 / 详情订阅。传 null 表示清空。 */
  syncProfile(peerId: number | null | undefined) {
    const next = new Set<number>();
    if (peerId && Number.isFinite(peerId) && peerId > 0) {
      next.add(Number(peerId));
    }
    this.applyScope("profile", next);
  }

  /**
   * 清空当前活跃订阅、不解绑 adapter 监听。
   *
   * 用于「账号切换 / logout 但 subscriber 单例继续存活」场景：
   * mobile / web 端的 PresenceSubscriber 是模块级单例，realtime client
   * 通过 Proxy 在登录态切换后指向新的 socket。如果调用 `dispose()` 会
   * 把构造时注册的 onMessage / onReconnected listener 也一并解绑，
   * 下次登录后再也收不到 presence 帧。reset() 只发 unsubscribe 帧 +
   * 清空内部 scope/active 集合，但保留 disposers，下次直接复用即可。
   */
  reset() {
    if (this.disposed) return;
    const allIds = Array.from(this.active);
    if (allIds.length > 0 && this.realtime.isConnected()) {
      try {
        this.realtime.send({
          messageClassify: "presence.unsubscribe",
          user_ids: allIds,
          scope: "list"
        });
      } catch {
        // ignore: 连接可能已断，重连后服务端 TTL 会自然清理
      }
    }
    this.active.clear();
    for (const scope of Object.keys(
      this.scopeMap
    ) as PresenceSubscriptionScope[]) {
      this.scopeMap[scope].clear();
    }
  }

  /** 释放资源。client 登出 / 卸载时调用。 */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const allIds = Array.from(this.active);
    if (allIds.length > 0 && this.realtime.isConnected()) {
      this.realtime.send({
        messageClassify: "presence.unsubscribe",
        user_ids: allIds,
        scope: "list"
      });
    }
    this.active.clear();
    for (const scope of Object.keys(
      this.scopeMap
    ) as PresenceSubscriptionScope[]) {
      this.scopeMap[scope].clear();
    }
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose();
      } catch {
        // ignore
      }
    }
  }

  private applyScope(scope: PresenceSubscriptionScope, next: Set<number>) {
    if (this.disposed) return;
    this.scopeMap[scope] = next;
    this.recomputeActive(scope);
  }

  /**
   * 重新汇总所有 scope 的并集，与当前 active 做 diff，下发增量。
   */
  private recomputeActive(triggeredScope: PresenceSubscriptionScope) {
    const merged = new Set<number>();
    for (const scope of Object.keys(
      this.scopeMap
    ) as PresenceSubscriptionScope[]) {
      for (const id of this.scopeMap[scope]) {
        merged.add(id);
      }
    }

    const toAdd: number[] = [];
    const toRemove: number[] = [];
    for (const id of merged) {
      if (!this.active.has(id)) {
        toAdd.push(id);
      }
    }
    for (const id of this.active) {
      if (!merged.has(id)) {
        toRemove.push(id);
      }
    }

    this.active = merged;

    if (toAdd.length > 0) {
      this.sendSubscribe(toAdd, triggeredScope);
    }
    if (toRemove.length > 0) {
      this.sendUnsubscribe(toRemove, triggeredScope);
    }
  }

  private sendSubscribe(ids: number[], scope: PresenceSubscriptionScope) {
    if (!this.realtime.isConnected()) {
      // 未连接：active 已记录，重连时会完整重发。
      return;
    }
    this.realtime.send({
      messageClassify: "presence.subscribe",
      user_ids: ids,
      scope
    });
  }

  private sendUnsubscribe(ids: number[], scope: PresenceSubscriptionScope) {
    if (!this.realtime.isConnected()) {
      return;
    }
    this.realtime.send({
      messageClassify: "presence.unsubscribe",
      user_ids: ids,
      scope
    });
  }
}
