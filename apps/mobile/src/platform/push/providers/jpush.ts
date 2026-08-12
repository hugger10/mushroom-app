import Config from "react-native-config";
import JPush from "jpush-react-native";
import { JPUSH_CAPABILITIES, type NormalizedPushRemoteMessage } from "../types";
import { normalizeDataMap, normalizeStringValue, pushLog } from "../shared";

let initialized = false;

function resolveAppKey(): string | null {
  const appKey = Config.JPUSH_APPKEY;
  if (appKey && typeof appKey === "string" && appKey.trim().length > 0) {
    return appKey.trim();
  }
  return null;
}

/**
 * 极光是否已配置。判断标准：构建时注入了非空 `JPUSH_APPKEY`。未配置时
 * 整个极光 provider 静默跳过，注册走现有 xiaomi → huawei → fcm 优先级。
 */
export function isJpushConfigured(): boolean {
  return resolveAppKey() !== null;
}

function ensureJpushInitialized(): boolean {
  const appKey = resolveAppKey();
  if (!appKey) {
    return false;
  }
  if (!initialized) {
    try {
      JPush.setLoggerEnable(false);
      const production = Config.JPUSH_PRODUCTION === "true";
      JPush.init({
        appKey,
        channel: "default",
        production
      });
      initialized = true;
    } catch (error) {
      pushLog.warn("jpush init failed", error);
      return false;
    }
  }
  return true;
}

function getRegistrationIdWithTimeout(
  timeoutMs = 5000
): Promise<string | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      JPush.getRegistrationID(({ registerID }) => {
        clearTimeout(timer);
        resolve(normalizeStringValue(registerID));
      });
    } catch (error) {
      clearTimeout(timer);
      pushLog.warn("jpush getRegistrationID failed", error);
      resolve(null);
    }
  });
}

export async function getJpushRegistration() {
  if (!ensureJpushInitialized()) {
    return null;
  }

  const registerId = await getRegistrationIdWithTimeout();
  if (!registerId) {
    return null;
  }

  return {
    provider: "jpush" as const,
    token: registerId,
    appId: null,
    region: null,
    capabilities: JPUSH_CAPABILITIES
  };
}

/**
 * 把 JPush 的事件载荷转成统一的 NormalizedPushRemoteMessage。
 *
 * - notification（addNotificationListener）：服务端把 payload 平铺进 `extras`，
 *   data 取 extras；title/body 用于展示。
 * - 自定义消息（addCustomMessageListener）：服务端把 payload JSON 放进
 *   `content`，data 解析自 content。
 */
export function toJpushRemoteMessage(input: {
  title?: string | null;
  content?: string | null;
  extras?: Record<string, string>;
}): NormalizedPushRemoteMessage | null {
  let data = normalizeDataMap(input?.extras);
  if (!data && input?.content) {
    data = normalizeDataMap(input.content);
  }
  if (!data) {
    return null;
  }

  return {
    provider: "jpush",
    data,
    notification: {
      title: normalizeStringValue(input?.title),
      body: normalizeStringValue(input?.content)
    }
  };
}

export type JpushEventHandlers = {
  /** Android 自定义消息（服务端把 payload JSON 放 msg_content）与 iOS 通知到达。 */
  onMessage: (message: NormalizedPushRemoteMessage) => void | Promise<void>;
  /** 通知被点击（打开深链）。 */
  onNotificationOpened: (
    message: NormalizedPushRemoteMessage
  ) => void | Promise<void>;
};

/**
 * 订阅 JPush 事件（通知 + 自定义消息），返回退订函数。极光未初始化时返回 null。
 *
 * - `addCustomMessageListener`：Android 服务端用 `message`（自定义消息）投递
 *   chat/call，客户端收到后走现有 Notifee 展示链路（去重/静音/全屏来电）。
 * - `addNotificationListener`：iOS 由系统弹通知，JS 侧处理 notificationOpened
 *   的深链跳转。
 */
export function subscribeJpushEvents(
  handlers: JpushEventHandlers
): (() => void) | null {
  if (!ensureJpushInitialized()) {
    return null;
  }

  const onNotification = (payload: {
    title?: string | null;
    content?: string | null;
    extras?: Record<string, string>;
    notificationEventType?: "notificationArrived" | "notificationOpened";
  }) => {
    const message = toJpushRemoteMessage(payload);
    if (!message) {
      return;
    }
    if (payload.notificationEventType === "notificationOpened") {
      void handlers.onNotificationOpened(message);
    } else {
      void handlers.onMessage(message);
    }
  };

  const onCustomMessage = (payload: {
    content?: string | null;
    extras?: Record<string, string>;
  }) => {
    const message = toJpushRemoteMessage(payload);
    if (!message) {
      return;
    }
    void handlers.onMessage(message);
  };

  JPush.addNotificationListener(onNotification);
  JPush.addCustomMessageListener(onCustomMessage);

  return () => {
    JPush.removeListener(onNotification);
    JPush.removeListener(onCustomMessage);
  };
}
