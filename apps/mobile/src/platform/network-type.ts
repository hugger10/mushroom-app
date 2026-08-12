import { useEffect, useState } from "react";
import NetInfo, {
  type NetInfoState,
  type NetInfoStateType
} from "@react-native-community/netinfo";
import type { NetworkType } from "@mushroom/shared";

/**
 * 网络连接类型从 `@mushroom/shared` 复用：
 * - wifi: 当前为 Wi-Fi 连接
 * - cellular: 当前为蜂窝（移动数据）连接
 * - other: 已联网但既非 Wi-Fi 也非蜂窝（如以太网、未知）
 * - none: 未联网或网络不可达
 */
export type { NetworkType };

type Listener = (next: NetworkType) => void;

const listeners = new Set<Listener>();
let cachedType: NetworkType = "none";
let initialized = false;

function mapNetInfo(state: NetInfoState | null | undefined): NetworkType {
  if (!state) {
    return "none";
  }
  const isOnline =
    Boolean(state.isConnected) && state.isInternetReachable !== false;
  if (!isOnline) {
    return "none";
  }
  const type = state.type as NetInfoStateType;
  if (type === "wifi") {
    return "wifi";
  }
  if (type === "cellular") {
    return "cellular";
  }
  return "other";
}

function notify(next: NetworkType) {
  if (next === cachedType) {
    return;
  }
  cachedType = next;
  for (const listener of listeners) {
    listener(next);
  }
}

function ensureSubscribed() {
  if (initialized || !NetInfo?.addEventListener) {
    return;
  }
  initialized = true;
  // 初次拉取一次当前状态
  NetInfo.fetch()
    .then(state => notify(mapNetInfo(state)))
    .catch(() => undefined);
  NetInfo.addEventListener(state => notify(mapNetInfo(state)));
}

ensureSubscribed();

export function getCurrentNetworkType(): NetworkType {
  ensureSubscribed();
  return cachedType;
}

export function subscribeNetworkType(listener: Listener): () => void {
  ensureSubscribed();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNetworkType(): NetworkType {
  const [type, setType] = useState<NetworkType>(() => getCurrentNetworkType());
  useEffect(() => {
    return subscribeNetworkType(next => setType(next));
  }, []);
  return type;
}
