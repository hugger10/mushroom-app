import { createMMKV, type MMKV } from "react-native-mmkv";
import type { KeyValueStorage } from "@mushroom/app-core";

/**
 * 设备级 MMKV：跨账号继承。
 * 仅用于设备/UI 偏好（device-id、主题、语言、通知偏好、自动下载策略等）
 * 以及 P4 完成多账号绑定切换前的过渡期 auth / sync-checkpoints 落地。
 *
 * 强约束：业务代码禁止直接 `new MMKV()`；只能通过本文件导出的
 * `deviceStorage` / `getUserStorage(uid)` / `wrapAsKeyValueStorage()` 取得句柄。
 */
export const deviceStorage: MMKV = createMMKV({
  id: "mushroom-mobile"
});

const userStorageCache = new Map<string, MMKV>();

/**
 * 账号级 MMKV：每个 uid 一个独立物理实例，物理隔离。
 * 实例缓存按 uid 复用；首次调用即创建。
 *
 * 内部存储 short key（如 `auth`、`sync-checkpoints`、
 * `pending-notification-open`、`pending-system-call-action`），不再使用
 * 形如 `mushroom.mobile.*` 的全名 key —— 命名空间已由 MMKV id 保证。
 */
export function getUserStorage(uid: string): MMKV {
  if (!uid) {
    throw new Error("getUserStorage(uid): uid must be a non-empty string");
  }
  const cached = userStorageCache.get(uid);
  if (cached) {
    return cached;
  }
  const next = createMMKV({ id: `mushroom-mobile.user.${uid}` });
  userStorageCache.set(uid, next);
  return next;
}

/**
 * 测试 / unbindUser 流程使用：清出对某 uid 的内存缓存句柄。
 *
 * 默认仅清理 JS 端的句柄缓存（不动磁盘）。当 `options.clearDisk` 为 true
 * 时，会在丢弃缓存前先对该 uid 的物理 MMKV 实例调用 `clearAll()`，把磁盘
 * 上 `mushroom-mobile.user.<uid>` 内所有 key 抹掉。
 *
 * 强约束：本函数永远只动 `getUserStorage(uid)` 这一个物理实例，**绝不**
 * 触碰 `deviceStorage`（device-id / theme / language / pushPrefs 等设备
 * 偏好必须跨账号保留）。
 */
export function dropUserStorageCache(
  uid: string,
  options?: { clearDisk?: boolean }
): void {
  if (options?.clearDisk) {
    try {
      // 命中缓存就直接复用，避免 wipe 阶段为了清盘而临时再开一份句柄。
      const handle = userStorageCache.get(uid) ?? getUserStorage(uid);
      handle.clearAll();
    } catch {
      // best effort —— 实例不可用时 fall through 到丢句柄
    }
  }
  userStorageCache.delete(uid);
}

/**
 * 适配 `@mushroom/app-core` 的 KeyValueStorage 异步接口。
 * MMKV 同步 API 包装成同步返回的 Promise-like 值（接口允许 sync 或 async）。
 */
export function wrapAsKeyValueStorage(mmkv: MMKV): KeyValueStorage {
  return {
    getItem(key: string) {
      const value = mmkv.getString(key);
      return value ?? null;
    },
    setItem(key: string, value: string) {
      mmkv.set(key, value);
    },
    removeItem(key: string) {
      mmkv.remove(key);
    }
  };
}
