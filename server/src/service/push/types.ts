import type { UserDeviceRecord } from "../../repository/models";

export type PushProviderId =
  | "jpush"
  | "fcm"
  | "huawei"
  | "xiaomi"
  | "apns_voip";

export type PushDeliveryMode =
  | "disabled"
  | "suppressed"
  | "no-target"
  | "dry-run"
  | "unconfigured"
  | "no-provider"
  | "failed"
  | "partial"
  | "multi"
  | PushProviderId;

export type PushNotificationEnvelope = {
  type: "chat.message" | "call.invite" | "call.missed" | "sync.recovery";
  title: string;
  body: string;
  conversation_id?: string;
  conversation_name?: string;
  conversation_type?: number;
  message_id?: string;
  is_mention?: boolean;
  call_id?: string;
  call_scope?: number;
  media_type?: number;
  sender_user_id?: number;
  sender_device_id?: string;
  timeout_seconds?: number;
  /**
   * When true, providers should suppress audible cues (visual notification
   * still delivered). Set by the push router based on the user's
   * `sound_enabled` preference and active quiet-hours window.
   */
  silent?: boolean;
  /**
   * Absolute unread-message total for the recipient (sum of `unread_count`
   * across their non-muted conversations). Drives the OS app-icon badge on
   * iOS via APNs `aps.badge` even when the app has been killed, and is used
   * as an Android background fallback. Set by the push router per-recipient.
   */
  badge?: number;
};

export type PushDeliveryResult = {
  mode: PushDeliveryMode;
  targetedDevices: number;
  delivered: number;
};

export type PushTargetDevice = Pick<
  UserDeviceRecord,
  | "id"
  | "user_id"
  | "device_id"
  | "device_type"
  | "device_name"
  | "push_provider"
  | "push_token"
  | "voip_token"
  | "push_app_id"
  | "status"
  | "metadata"
>;

export interface PushProvider {
  readonly id: PushProviderId;
  isConfigured(): boolean;
  canDeliver(device: PushTargetDevice): boolean;
  deliverToDevice(
    device: PushTargetDevice,
    payload: PushNotificationEnvelope
  ): Promise<void>;
}

export function normalizePushProvider(value: unknown): PushProviderId | null {
  if (value === "jpush") {
    return "jpush";
  }

  if (value === "xiaomi") {
    return "xiaomi";
  }

  if (value === "huawei") {
    return "huawei";
  }

  if (value === "fcm") {
    return "fcm";
  }

  if (value === "apns_voip") {
    return "apns_voip";
  }

  return null;
}

export function stringifyPushData(
  payload: PushNotificationEnvelope
): Record<string, string> {
  const entries = Object.entries({
    type: payload.type,
    title: payload.title,
    body: payload.body,
    conversation_id: payload.conversation_id,
    conversation_name: payload.conversation_name,
    conversation_type:
      payload.conversation_type !== undefined
        ? String(payload.conversation_type)
        : undefined,
    message_id: payload.message_id,
    is_mention:
      payload.is_mention !== undefined ? String(payload.is_mention) : undefined,
    call_id: payload.call_id,
    call_scope:
      payload.call_scope !== undefined ? String(payload.call_scope) : undefined,
    media_type:
      payload.media_type !== undefined ? String(payload.media_type) : undefined,
    sender_user_id:
      payload.sender_user_id !== undefined
        ? String(payload.sender_user_id)
        : undefined,
    sender_device_id: payload.sender_device_id,
    timeout_seconds:
      payload.timeout_seconds !== undefined
        ? String(payload.timeout_seconds)
        : undefined,
    silent: payload.silent === true ? "1" : undefined,
    badge:
      payload.badge !== undefined && payload.badge !== null
        ? String(payload.badge)
        : undefined
  }).filter(([, value]) => value !== undefined && value !== null);

  return Object.fromEntries(
    entries.map(([key, value]) => [key, String(value)])
  );
}
