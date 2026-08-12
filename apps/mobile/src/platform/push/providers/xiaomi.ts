import { NativeModules, Platform } from "react-native";
import { XIAOMI_CAPABILITIES } from "../types";
import { normalizeStringValue, pushLog } from "../shared";

type XiaomiPushBridgeModule = {
  isAvailable?: () => Promise<boolean>;
  getConfiguration?: () => Promise<{
    appId?: string | null;
    appKey?: string | null;
    region?: string | null;
    sdkAvailable?: boolean;
  } | null>;
  registerPush?: () => Promise<void>;
  unregisterPush?: () => Promise<void>;
  getRegId?: () => Promise<string | null>;
  getAppRegion?: () => Promise<string | null>;
};

const REG_ID_POLL_ATTEMPTS = 10;
const REG_ID_POLL_INTERVAL_MS = 500;

/**
 * 小米 MiPush 的 regId 在 `registerPush` 后由 `XiaomiPushReceiver` 的
 * `onCommandResult` **异步**写入本地存储，注册后立刻 `getRegId()` 必然为空。
 * 这里轮询等待 regId 落盘（最长约 5s），拿到即返回；超时返回 null 由上层
 * fallback 到其它通道（FCM），避免红米/小米设备永远注册不到 xiaomi 通道。
 */
async function waitForRegId(
  bridge: XiaomiPushBridgeModule
): Promise<string | null> {
  for (let attempt = 0; attempt < REG_ID_POLL_ATTEMPTS; attempt += 1) {
    const regId = normalizeStringValue(await bridge.getRegId?.());
    if (regId) {
      return regId;
    }
    if (attempt < REG_ID_POLL_ATTEMPTS - 1) {
      await new Promise<void>(resolve => {
        setTimeout(() => resolve(), REG_ID_POLL_INTERVAL_MS);
      });
    }
  }
  pushLog.warn("xiaomi regId not available after polling window", {
    pollAttempts: REG_ID_POLL_ATTEMPTS
  });
  return null;
}

export function getXiaomiBridge(): XiaomiPushBridgeModule | null {
  const bridge = (
    NativeModules as { XiaomiPushBridge?: XiaomiPushBridgeModule }
  ).XiaomiPushBridge;
  return bridge ?? null;
}

export function isXiaomiFamilyDevice() {
  if (Platform.OS !== "android") {
    return false;
  }

  const constants = Platform.constants as
    | { Brand?: string; Manufacturer?: string }
    | undefined;
  const identity = `${constants?.Brand ?? ""} ${constants?.Manufacturer ?? ""}`
    .trim()
    .toLowerCase();
  return (
    identity.includes("xiaomi") ||
    identity.includes("redmi") ||
    identity.includes("poco")
  );
}

export async function getXiaomiRegistration() {
  if (!isXiaomiFamilyDevice()) {
    return null;
  }

  const bridge = getXiaomiBridge();
  const available = await bridge?.isAvailable?.();
  if (!bridge || available !== true) {
    return null;
  }

  const configuration = await bridge.getConfiguration?.();
  if (!configuration?.appId || !configuration?.appKey) {
    return null;
  }

  await bridge.registerPush?.();
  const regId = await waitForRegId(bridge);
  if (!regId) {
    return null;
  }
  const region =
    normalizeStringValue(await bridge.getAppRegion?.()) ??
    normalizeStringValue(configuration.region);

  return {
    provider: "xiaomi" as const,
    token: regId,
    appId: configuration.appId,
    region,
    capabilities: XIAOMI_CAPABILITIES
  };
}

export function deleteXiaomiToken(): Promise<unknown> | null {
  if (!isXiaomiFamilyDevice()) {
    return null;
  }
  const bridge = getXiaomiBridge();
  if (!bridge?.unregisterPush) {
    return null;
  }
  return Promise.resolve(bridge.unregisterPush()).catch(() => undefined);
}
