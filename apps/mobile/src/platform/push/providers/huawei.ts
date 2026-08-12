import {
  HmsPushInstanceId,
  HmsPushMessaging,
  RNRemoteMessage
} from "@hmscore/react-native-hms-push";
import { Platform } from "react-native";
import { HUAWEI_CAPABILITIES, HUAWEI_SCOPE } from "../types";
import {
  extractTokenValue,
  normalizeDataMap,
  normalizeStringValue
} from "../shared";

export function isHuaweiFamilyDevice() {
  if (Platform.OS !== "android") {
    return false;
  }

  const constants = Platform.constants as
    | { Brand?: string; Manufacturer?: string }
    | undefined;
  const identity = `${constants?.Brand ?? ""} ${constants?.Manufacturer ?? ""}`
    .trim()
    .toLowerCase();
  return identity.includes("huawei") || identity.includes("honor");
}

export function toHuaweiRemoteMessage(message: unknown) {
  if (!message || typeof message !== "object") {
    return null;
  }

  const RemoteMessageCtor = RNRemoteMessage as unknown as {
    new (input?: Record<string, unknown>): {
      getDataOfMap?: () => unknown;
      getData?: () => unknown;
      getNotificationTitle?: () => unknown;
      getBody?: () => unknown;
    };
  };
  const remoteMessage = new RemoteMessageCtor(
    message as Record<string, unknown>
  );
  const data =
    normalizeDataMap(remoteMessage.getDataOfMap?.()) ??
    normalizeDataMap(remoteMessage.getData?.());

  return {
    provider: "huawei" as const,
    data,
    notification: {
      title: normalizeStringValue(remoteMessage.getNotificationTitle?.()),
      body: normalizeStringValue(remoteMessage.getBody?.())
    }
  };
}

export async function getHuaweiRegistration() {
  if (!isHuaweiFamilyDevice()) {
    return null;
  }

  try {
    await HmsPushMessaging.turnOnPush?.();
    const token = extractTokenValue(
      await HmsPushInstanceId.getToken?.(HUAWEI_SCOPE)
    );
    if (!token) {
      return null;
    }

    return {
      provider: "huawei" as const,
      token,
      appId: null,
      region: null,
      capabilities: HUAWEI_CAPABILITIES
    };
  } catch {
    return null;
  }
}

export function deleteHuaweiToken(): Promise<unknown> | null {
  if (!isHuaweiFamilyDevice() || !HmsPushInstanceId?.deleteToken) {
    return null;
  }
  return Promise.resolve(HmsPushInstanceId.deleteToken(HUAWEI_SCOPE)).catch(
    () => undefined
  );
}
