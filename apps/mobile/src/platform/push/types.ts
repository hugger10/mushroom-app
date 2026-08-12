export type MobilePushProviderId = "jpush" | "fcm" | "huawei" | "xiaomi";

export type MobilePushRegistration = {
  provider: MobilePushProviderId;
  token: string;
  appId?: string | null;
  region?: string | null;
  capabilities: string[];
};

export type NormalizedPushRemoteMessage = {
  provider: MobilePushProviderId;
  data?: Record<string, unknown> | null;
  notification?: {
    title?: string | null;
    body?: string | null;
  } | null;
};

export const FCM_CAPABILITIES = [
  "background-handler",
  "foreground-message",
  "notification-open",
  "token-refresh"
];

export const HUAWEI_CAPABILITIES = [
  "background-handler",
  "foreground-message",
  "notification-open",
  "token-refresh"
];

export const XIAOMI_CAPABILITIES = [
  "register-push",
  "regid-sync",
  "region-sync"
];

export const JPUSH_CAPABILITIES = [
  "background-handler",
  "foreground-message",
  "notification-open",
  "token-refresh"
];

export const HUAWEI_SCOPE = "HCM";
