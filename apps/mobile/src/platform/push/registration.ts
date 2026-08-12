import { Platform } from "react-native";
import type { MobilePushRegistration } from "./types";
import { clearActivePushProvider, setActivePushProvider } from "./state";
import { pushLog } from "./shared";
import { deleteFcmToken, getFcmRegistration } from "./providers/fcm";
import { deleteHuaweiToken, getHuaweiRegistration } from "./providers/huawei";
import { getJpushRegistration, isJpushConfigured } from "./providers/jpush";
import { deleteXiaomiToken, getXiaomiRegistration } from "./providers/xiaomi";

async function resolvePreferredRegistration() {
  // 极光作为可选厂商，优先级最高：构建注入了 JPUSH_APPKEY 且能拿到
  // registrationId 时，所有设备统一走极光（极光内部再按设备路由厂商通道）。
  // 未配置或注册失败则回退到现有 xiaomi → huawei → fcm 择优。
  if (isJpushConfigured()) {
    const jpushRegistration = await getJpushRegistration();
    if (jpushRegistration) {
      return jpushRegistration;
    }
  }

  if (Platform.OS === "android") {
    const xiaomiRegistration = await getXiaomiRegistration();
    if (xiaomiRegistration) {
      return xiaomiRegistration;
    }

    const huaweiRegistration = await getHuaweiRegistration();
    if (huaweiRegistration) {
      return huaweiRegistration;
    }
  }

  return getFcmRegistration();
}

export async function handleRegistrationResult(
  registration: MobilePushRegistration | null,
  onRegistration: (
    nextRegistration: MobilePushRegistration
  ) => Promise<void> | void
) {
  if (!registration) {
    return null;
  }

  setActivePushProvider(registration.provider);
  await onRegistration(registration);
  return registration;
}

export async function syncUnifiedPushRegistration(options: {
  onRegistration: (
    registration: MobilePushRegistration
  ) => Promise<void> | void;
}) {
  let registration: MobilePushRegistration | null = null;
  try {
    registration = await resolvePreferredRegistration();
  } catch (error) {
    // 任一 provider 探测/注册抛错都不应让整条链路静默中断：记录后返回 null，
    // 由上层（lifecycle 的指数退避重试）择机重试
    pushLog.warn("resolvePreferredRegistration failed", error);
    return null;
  }
  return handleRegistrationResult(registration, options.onRegistration);
}

/**
 * Best-effort revoke the push token at the OS / provider level. Called on
 * logout (wipe path) so a freshly logged-in user on the same device gets a
 * brand-new token instead of inheriting the previous account's binding.
 *
 * All failures are swallowed: a missing/unconfigured provider, an offline
 * device, or a provider SDK that simply refuses to delete should never block
 * logout.
 */
export async function deleteUnifiedPushToken(): Promise<void> {
  const tasks: Array<Promise<unknown>> = [];

  const fcmTask = deleteFcmToken();
  if (fcmTask) {
    tasks.push(fcmTask);
  }

  if (Platform.OS === "android") {
    const huaweiTask = deleteHuaweiToken();
    if (huaweiTask) {
      tasks.push(huaweiTask);
    }
    const xiaomiTask = deleteXiaomiToken();
    if (xiaomiTask) {
      tasks.push(xiaomiTask);
    }
  }

  await Promise.allSettled(tasks);
  clearActivePushProvider();
}
