import { getApp, getApps } from "@react-native-firebase/app";
import {
  deleteToken,
  getMessaging,
  getToken,
  registerDeviceForRemoteMessages
} from "@react-native-firebase/messaging";
import { FCM_CAPABILITIES } from "../types";
import { normalizeDataMap, normalizeStringValue, pushLog } from "../shared";

let fcmAvailabilityLogged = false;

function hasConfiguredFirebaseApp() {
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
}

export function getMessagingInstance() {
  if (!hasConfiguredFirebaseApp()) {
    if (!fcmAvailabilityLogged) {
      fcmAvailabilityLogged = true;
      pushLog.info(
        "Firebase app is not configured; skipping FCM initialization."
      );
    }
    return null;
  }

  try {
    return getMessaging(getApp());
  } catch {
    return null;
  }
}

export function toFcmRemoteMessage(
  message:
    | {
        data?: Record<string, unknown> | null;
        notification?: {
          title?: string | null;
          body?: string | null;
        } | null;
      }
    | null
    | undefined
) {
  if (!message) {
    return null;
  }

  return {
    provider: "fcm" as const,
    data: normalizeDataMap(message.data),
    notification: message.notification ?? null
  };
}

export async function getFcmRegistration() {
  const instance = getMessagingInstance();
  if (!instance) {
    return null;
  }

  await registerDeviceForRemoteMessages(instance).catch(() => undefined);

  let token: string | null = null;
  try {
    token = normalizeStringValue(await getToken(instance));
  } catch (error) {
    // getToken 在 FCM 服务暂不可用 / 首次初始化未完成时可能 reject。这里不裸
    // 抛（否则整个 syncUnifiedPushRegistration 中断且无回调），返回 null 让上层
    // 统一走重试（见 lifecycle.initializeUnifiedPush 的指数退避）。
    pushLog.warn("fcm getToken failed", error);
    return null;
  }
  if (!token) {
    return null;
  }

  return {
    provider: "fcm" as const,
    token,
    appId: null,
    region: null,
    capabilities: FCM_CAPABILITIES
  };
}

export function deleteFcmToken(): Promise<unknown> | null {
  const instance = getMessagingInstance();
  if (!instance) {
    return null;
  }
  return Promise.resolve(deleteToken(instance)).catch(() => undefined);
}
