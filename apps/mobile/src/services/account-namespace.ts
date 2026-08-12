import { useEffect, useState } from "react";
import { deviceStorage } from "../data/storage";

/**
 * 单活跃账号命名空间。
 *
 * - 设备上同一时刻只有一个 "active uid"（或 null = 已登出 / anon）。
 * - uid = `auth.user.id` 转字符串（避免 number 与字符串路径混用）。
 * - 该值同时持久化到 `deviceStorage` 的 `active-user-id`，供冷启动恢复使用。
 * - 切换 uid 是受控操作：仅由 controller.bindUser / unbindUser 调用。
 *
 * 业务代码：
 * - 读取当前 uid 用 `accountNamespace.get()` 或 `useActiveUserId()`。
 * - 监听变化用 `accountNamespace.subscribe(fn)`。
 * - 禁止直接写 `active-user-id` key。
 */
export type UserId = string;

const ACTIVE_USER_ID_KEY = "active-user-id";

const listeners = new Set<(uid: UserId | null) => void>();

function readPersisted(): UserId | null {
  const value = deviceStorage.getString(ACTIVE_USER_ID_KEY);
  return value && value.length > 0 ? value : null;
}

let current: UserId | null = readPersisted();

export const accountNamespace = {
  get(): UserId | null {
    return current;
  },
  set(uid: UserId | null): void {
    if (current === uid) {
      return;
    }
    current = uid;
    if (uid) {
      deviceStorage.set(ACTIVE_USER_ID_KEY, uid);
    } else {
      deviceStorage.remove(ACTIVE_USER_ID_KEY);
    }
    for (const listener of listeners) {
      listener(uid);
    }
  },
  subscribe(listener: (uid: UserId | null) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};

/**
 * React hook：订阅当前活跃 uid，uid 变化会触发重渲染。
 * 配合 App 根节点 `<RootProviders key={uid ?? "anon"}>` 可实现账号切换时的强制 remount。
 */
export function useActiveUserId(): UserId | null {
  const [uid, setUid] = useState<UserId | null>(() => accountNamespace.get());
  useEffect(() => {
    return accountNamespace.subscribe(setUid);
  }, []);
  return uid;
}
