import { HmsPushEvent, HmsPushMessaging } from "@hmscore/react-native-hms-push";
import { Platform } from "react-native";
import {
  getInitialNotification,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  setBackgroundMessageHandler
} from "@react-native-firebase/messaging";
import {
  FCM_CAPABILITIES,
  HUAWEI_CAPABILITIES,
  type MobilePushRegistration,
  type NormalizedPushRemoteMessage
} from "./types";
import { extractTokenValue, normalizeStringValue, pushLog } from "./shared";
import { getActivePushProvider } from "./state";
import { getMessagingInstance, toFcmRemoteMessage } from "./providers/fcm";
import {
  isHuaweiFamilyDevice,
  toHuaweiRemoteMessage
} from "./providers/huawei";
import { isJpushConfigured, subscribeJpushEvents } from "./providers/jpush";
import {
  handleRegistrationResult,
  syncUnifiedPushRegistration
} from "./registration";

const MAX_REGISTRATION_RETRIES = 3;
const REGISTRATION_RETRY_DELAYS_MS = [2000, 4000, 8000];

type RegistrationOptions = {
  onRegistration: (
    registration: MobilePushRegistration
  ) => Promise<void> | void;
};

/**
 * 注册推送通道（xiaomi/huawei/fcm 择优）。首次立即尝试；若所有 provider 都
 * 返回 null（如 FCM token 尚未就绪）或抛错，按指数退避重试有限次，避免
 * 「启动瞬间失败后 push_provider 永久为 null」的问题。
 */
function scheduleUnifiedPushRegistration(
  options: RegistrationOptions,
  attempt = 1
) {
  void syncUnifiedPushRegistration({
    onRegistration: options.onRegistration
  })
    .then(registration => {
      if (!registration && attempt <= MAX_REGISTRATION_RETRIES) {
        pushLog.warn("push registration unresolved, scheduling retry", {
          attempt
        });
        scheduleRegistrationRetry(options, attempt + 1);
      }
    })
    .catch(error => {
      // syncUnifiedPushRegistration 内部已 try/catch；这里兜底防止意外裸 reject。
      pushLog.warn("push registration error, scheduling retry", {
        attempt,
        error
      });
      if (attempt <= MAX_REGISTRATION_RETRIES) {
        scheduleRegistrationRetry(options, attempt + 1);
      }
    });
}

function scheduleRegistrationRetry(
  options: RegistrationOptions,
  nextAttempt: number
) {
  const delayMs = REGISTRATION_RETRY_DELAYS_MS[nextAttempt - 2] ?? 10_000;
  setTimeout(() => {
    scheduleUnifiedPushRegistration(options, nextAttempt);
  }, delayMs);
}

export function initializeUnifiedPush(options: {
  onRegistration: (
    registration: MobilePushRegistration
  ) => Promise<void> | void;
  onForegroundMessage: (
    message: NormalizedPushRemoteMessage
  ) => Promise<void> | void;
  onNotificationOpened: (
    message: NormalizedPushRemoteMessage
  ) => Promise<void> | void;
}) {
  const cleanups: Array<() => void> = [];
  const messagingInstance = getMessagingInstance();

  scheduleUnifiedPushRegistration({
    onRegistration: options.onRegistration
  });

  if (messagingInstance) {
    cleanups.push(
      onTokenRefresh(messagingInstance, (token: string) => {
        if (
          Platform.OS === "android" &&
          (getActivePushProvider() === "huawei" ||
            getActivePushProvider() === "jpush")
        ) {
          return;
        }

        const normalizedToken = normalizeStringValue(token);
        if (!normalizedToken) {
          return;
        }

        void handleRegistrationResult(
          {
            provider: "fcm",
            token: normalizedToken,
            appId: null,
            region: null,
            capabilities: FCM_CAPABILITIES
          },
          options.onRegistration
        );
      })
    );

    cleanups.push(
      onMessage(messagingInstance, message => {
        if (
          Platform.OS === "android" &&
          (getActivePushProvider() === "huawei" ||
            getActivePushProvider() === "jpush")
        ) {
          return;
        }

        const normalizedMessage = toFcmRemoteMessage(message);
        if (!normalizedMessage) {
          return;
        }

        void options.onForegroundMessage(normalizedMessage);
      })
    );

    cleanups.push(
      onNotificationOpenedApp(messagingInstance, message => {
        if (
          Platform.OS === "android" &&
          (getActivePushProvider() === "huawei" ||
            getActivePushProvider() === "jpush")
        ) {
          return;
        }

        const normalizedMessage = toFcmRemoteMessage(message);
        if (!normalizedMessage) {
          return;
        }

        void options.onNotificationOpened(normalizedMessage);
      })
    );

    const initialFcmNotification = getInitialNotification(messagingInstance);
    void initialFcmNotification?.then(message => {
      if (
        Platform.OS === "android" &&
        (getActivePushProvider() === "huawei" ||
          getActivePushProvider() === "jpush")
      ) {
        return;
      }

      const normalizedMessage = toFcmRemoteMessage(message);
      if (!normalizedMessage) {
        return;
      }
      void options.onNotificationOpened(normalizedMessage);
    });
  }

  if (isHuaweiFamilyDevice()) {
    const huaweiForegroundSubscription = HmsPushEvent.onRemoteMessageReceived(
      (message: unknown) => {
        if (
          getActivePushProvider() === "fcm" ||
          getActivePushProvider() === "jpush"
        ) {
          return;
        }

        const normalizedMessage = toHuaweiRemoteMessage(message);
        if (!normalizedMessage) {
          return;
        }

        void options.onForegroundMessage(normalizedMessage);
      }
    ) as { remove?: () => void } | void;
    const removeForegroundSubscription = huaweiForegroundSubscription?.remove;
    if (removeForegroundSubscription) {
      cleanups.push(() => removeForegroundSubscription());
    }

    const huaweiTokenSubscription = HmsPushEvent.onTokenReceived(
      (tokenResult: unknown) => {
        if (
          getActivePushProvider() === "fcm" ||
          getActivePushProvider() === "jpush"
        ) {
          return;
        }

        const token = extractTokenValue(tokenResult);
        if (!token) {
          return;
        }

        void handleRegistrationResult(
          {
            provider: "huawei",
            token,
            appId: null,
            capabilities: HUAWEI_CAPABILITIES
          },
          options.onRegistration
        );
      }
    ) as { remove?: () => void } | void;
    const removeTokenSubscription = huaweiTokenSubscription?.remove;
    if (removeTokenSubscription) {
      cleanups.push(() => removeTokenSubscription());
    }

    const huaweiOpenSubscription = HmsPushEvent.onNotificationOpenedApp(
      (message: unknown) => {
        if (
          getActivePushProvider() === "fcm" ||
          getActivePushProvider() === "jpush"
        ) {
          return;
        }

        const normalizedMessage = toHuaweiRemoteMessage(message);
        if (!normalizedMessage) {
          return;
        }

        void options.onNotificationOpened(normalizedMessage);
      }
    ) as { remove?: () => void } | void;
    const removeOpenSubscription = huaweiOpenSubscription?.remove;
    if (removeOpenSubscription) {
      cleanups.push(() => removeOpenSubscription());
    }

    const initialHuaweiNotification =
      HmsPushMessaging.getInitialNotification?.();
    void initialHuaweiNotification?.then(message => {
      if (
        getActivePushProvider() === "fcm" ||
        getActivePushProvider() === "jpush"
      ) {
        return;
      }

      const normalizedMessage = toHuaweiRemoteMessage(message);
      if (!normalizedMessage) {
        return;
      }

      void options.onNotificationOpened(normalizedMessage);
    });
  }

  // 极光事件接线：仅当最终注册的通道是 jpush 时才消费其消息/点击事件，
  // 避免与 FCM/华为双路重复（active provider 由注册结果决定）。
  if (isJpushConfigured()) {
    const unsubscribeJpush = subscribeJpushEvents({
      onMessage: message => {
        const activeProvider = getActivePushProvider();
        if (activeProvider != null && activeProvider !== "jpush") {
          return;
        }
        void options.onForegroundMessage(message);
      },
      onNotificationOpened: message => {
        const activeProvider = getActivePushProvider();
        if (activeProvider != null && activeProvider !== "jpush") {
          return;
        }
        void options.onNotificationOpened(message);
      }
    });
    if (unsubscribeJpush) {
      cleanups.push(unsubscribeJpush);
    }
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

export function registerUnifiedPushBackgroundHandler(
  onBackgroundMessage: (
    message: NormalizedPushRemoteMessage
  ) => Promise<void> | void
) {
  const messagingInstance = getMessagingInstance();
  if (messagingInstance) {
    setBackgroundMessageHandler(
      messagingInstance,
      async (message: {
        data?: Record<string, unknown> | null;
        notification?: {
          title?: string | null;
          body?: string | null;
        } | null;
      }) => {
        const normalizedMessage = toFcmRemoteMessage(message);
        if (!normalizedMessage) {
          return;
        }

        await onBackgroundMessage(normalizedMessage);
      }
    );
  }

  if (isHuaweiFamilyDevice()) {
    HmsPushMessaging.setBackgroundMessageHandler?.(async (message: unknown) => {
      const normalizedMessage = toHuaweiRemoteMessage(message);
      if (!normalizedMessage) {
        return;
      }

      await onBackgroundMessage(normalizedMessage);
      return Promise.resolve();
    });
  }
}
