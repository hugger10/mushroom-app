import { Platform } from "react-native";
import Config from "react-native-config";
import DeviceInfo from "react-native-device-info";
import {
  buildDeviceName,
  buildVendorLabel,
  createDeviceId
} from "@mushroom/app-core";
import { deviceStorage } from "../../data/storage";
import { resolveMobileWebSocketUrl } from "../realtime";
import { isAndroidEmulator } from "../../utils/platform";
import log from "../../utils/log";

const runtimeLog = log.scope("runtime");

const DEVICE_ID_KEY = "mushroom.mobile.device-id";

/**
 * Resolve the API base URL with the following priority:
 * 1. API_BASE_URL from react-native-config (.env) — overrides everything
 * 2. Dev-mode fallback based on platform:
 *    - Android emulator  → http://10.0.2.2:9100  (maps to host loopback)
 *    - Android real device → http://127.0.0.1:9100 (requires adb reverse) adb reverse tcp:9100 tcp:9100
 *    - iOS (simulator or real) → http://127.0.0.1:9100
 * 3. Production fallback → https://mushroom.top
 */
function resolveApiBaseUrl(): string {
  const envUrl = Config.API_BASE_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim().length > 0) {
    runtimeLog.info("using API_BASE_URL from env", { url: envUrl });
    return envUrl.trim().replace(/\/+$/, "");
  }

  if (__DEV__) {
    if (Platform.OS === "android" && isAndroidEmulator()) {
      return "http://10.0.2.2:9100";
    }
    return "http://127.0.0.1:9100";
  }

  return "https://mesh.outland.top";
}

function getDefaultApiBaseUrl(): string {
  return resolveApiBaseUrl();
}

function getOrCreateDeviceId(): string {
  const existing = deviceStorage.getString(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const next = createDeviceId();
  deviceStorage.set(DEVICE_ID_KEY, next);
  runtimeLog.info("device id generated", { deviceId: next });
  return next;
}

export const mobileDeviceId = getOrCreateDeviceId();
export const mobileApiBaseUrl = getDefaultApiBaseUrl();
export const mobileWsUrl = resolveMobileWebSocketUrl(mobileApiBaseUrl);

export const mobileDeviceInfo = {
  deviceId: mobileDeviceId,
  deviceType: 3,
  deviceName: `${Platform.OS} / RN Mobile`,
  appVersion: undefined as string | undefined,
  pushProvider: null as "jpush" | "fcm" | "huawei" | "xiaomi" | null,
  metadata: {
    platform: Platform.OS,
    os_version: Platform.Version
  } as Record<string, unknown>,
  pushToken: null as string | null,
  voipToken: null as string | null,
  pushAppId: null as string | null,
  pushCapabilities: [] as string[]
};

let deviceInfoReadyPromise: Promise<void> | null = null;

async function loadMobileDeviceInfo() {
  const [model, systemName, systemVersion, version, manufacturer] =
    await Promise.all([
      DeviceInfo.getModel(),
      DeviceInfo.getSystemName(),
      DeviceInfo.getSystemVersion(),
      DeviceInfo.getVersion(),
      Platform.OS === "android"
        ? DeviceInfo.getManufacturer()
        : Promise.resolve(null)
    ]);

  // Android 拼品牌+制造商+型号（如 `Redmi Xiaomi 24094RAD4C`，brand 与
  // manufacturer 相同则去重，见 buildVendorLabel）；iOS 的 getModel() 已是
  // 营销名，不拼 vendor 避免 `Apple iPhone 15 Pro` 冗余。
  const vendor =
    Platform.OS === "android"
      ? buildVendorLabel(DeviceInfo.getBrand(), manufacturer)
      : null;

  mobileDeviceInfo.deviceName = buildDeviceName({
    model,
    osName: systemName,
    osVersion: systemVersion,
    vendor,
    fallback: `${Platform.OS} / RN Mobile`
  });
  mobileDeviceInfo.appVersion = version;
  mobileDeviceInfo.metadata = {
    ...mobileDeviceInfo.metadata,
    platform: Platform.OS,
    os_version: systemVersion
  };
}

/**
 * 幂等地加载真实设备型号 / 系统版本 / 应用版本，写回 mobileDeviceInfo。
 * 登录 / 注册 / 设备注册前应 await 本函数，确保上报给服务端的
 * device_name / app_version 是真实值而非占位。失败自动放行并允许下次重试。
 */
export function ensureMobileDeviceInfoReady(): Promise<void> {
  if (!deviceInfoReadyPromise) {
    deviceInfoReadyPromise = loadMobileDeviceInfo().catch(err => {
      runtimeLog.warn("device info load failed", err);
      deviceInfoReadyPromise = null;
    });
  }
  return deviceInfoReadyPromise;
}

// 模块加载即预取，早于任何登录动作，减小首登上报时未就绪的概率。
void ensureMobileDeviceInfoReady();

export function getMobilePushDeviceState() {
  return {
    provider: mobileDeviceInfo.pushProvider,
    hasToken: Boolean(mobileDeviceInfo.pushToken),
    capabilities: mobileDeviceInfo.pushCapabilities
  };
}

export function updateMobilePushRegistration(
  registration: {
    provider: "jpush" | "fcm" | "huawei" | "xiaomi";
    token: string | null;
    appId?: string | null;
    region?: string | null;
    capabilities?: string[];
  } | null
) {
  mobileDeviceInfo.pushProvider = registration?.provider ?? null;
  mobileDeviceInfo.pushToken = registration?.token ?? null;
  mobileDeviceInfo.pushAppId = registration?.appId ?? null;
  mobileDeviceInfo.pushCapabilities = registration?.capabilities ?? [];
  if (registration?.region) {
    mobileDeviceInfo.metadata = {
      ...mobileDeviceInfo.metadata,
      push_region: registration.region
    };
    return;
  }

  if (mobileDeviceInfo.metadata?.push_region !== undefined) {
    const nextMetadata = { ...mobileDeviceInfo.metadata };
    delete nextMetadata.push_region;
    mobileDeviceInfo.metadata = nextMetadata;
  }
}

/**
 * Record the iOS PushKit VoIP token (independent of the regular push token).
 * Returns true when the value changed, so the caller can decide whether to
 * re-sync the device registration with the server.
 */
export function updateMobileVoipToken(token: string | null): boolean {
  const next = token && token.trim().length > 0 ? token.trim() : null;
  if (mobileDeviceInfo.voipToken === next) {
    return false;
  }
  mobileDeviceInfo.voipToken = next;
  runtimeLog.info("voip token updated", { hasToken: Boolean(next) });
  return true;
}
