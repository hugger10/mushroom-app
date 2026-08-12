import logger from "../../utils/logger";
import { config } from "../../utils/config";
import { parseJsonObject } from "../../utils/json";
import type {
  PushNotificationEnvelope,
  PushProvider,
  PushTargetDevice
} from "./types";
import { stringifyPushData } from "./types";

const JPUSH_API_URL = "https://api.jpush.cn/v3/push";
const JPUSH_TIMEOUT_MS = 15_000;
const CALL_TTL_SECONDS = 60;
const MESSAGE_TTL_SECONDS = 86_400;

/**
 * JPush（极光）聚合推送 provider。
 *
 * - 客户端注册为 `push_provider:"jpush"`、`push_token` 存极光 registrationId。
 * - 服务端经 `api.jpush.cn/v3/push`（国内可达）按 registration_id 单发，极光
 *   内部按设备自动路由各厂商通道（小米/华为/OPPO/vivo/FCM/APNs）。
 * - **Android 全部走自定义消息（message）透传**：chat/call 都由客户端现有
 *   Notifee 链路统一展示（去重/静音/全屏来电），避免厂商 SDK 自动弹普通通知
 *   造成重复。
 * - **iOS 用 notification**：由 APNs 系统弹通知，客户端处理 notificationOpened
 *   的深链跳转。来电在 iOS 上由 APNs VoIP 专用通道承载（见 push_router 的
 *   voip_token 特判），不会到达本 provider。
 * - 极光返回 `msg_id` 即表示已入队，HTTP 2xx 且无业务 error code 即视为投递
 *   成功（不要把入队当失败反复重试）。
 */
class JpushPushProvider implements PushProvider {
  readonly id = "jpush" as const;

  isConfigured() {
    return Boolean(config.push.jpushAppKey && config.push.jpushMasterSecret);
  }

  canDeliver(device: PushTargetDevice) {
    return (
      typeof device.push_token === "string" &&
      device.push_token.trim().length > 0
    );
  }

  async deliverToDevice(
    device: PushTargetDevice,
    payload: PushNotificationEnvelope
  ) {
    const token = String(device.push_token).trim();
    const requestBody = this.buildRequestBody(device, payload);

    const response = await fetch(JPUSH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${config.push.jpushAppKey}:${config.push.jpushMasterSecret}`
        ).toString("base64")}`
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(JPUSH_TIMEOUT_MS)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      logger.error(
        {
          status: response.status,
          pushProvider: this.id,
          pushType: payload.type,
          tokenSuffix: token.slice(-8),
          deviceId: device.device_id,
          body: errorText
        },
        "JPush delivery failed"
      );
      throw new Error(`JPush delivery failed with status ${response.status}`);
    }

    // 极光 v3 返回 { msg_id, sendno, error? }。业务 error code（非 0）视为失败。
    const result = (await response.json().catch(() => null)) as {
      error?: { code?: number; message?: string };
    } | null;
    if (result?.error && Number(result.error.code) !== 0) {
      const message = result.error.message ?? "";
      logger.error(
        {
          pushProvider: this.id,
          pushType: payload.type,
          tokenSuffix: token.slice(-8),
          deviceId: device.device_id,
          errorCode: result.error.code,
          errorMessage: message
        },
        "JPush delivery rejected"
      );
      throw new Error(
        `JPush delivery rejected with code ${result.error.code}: ${message}`
      );
    }
  }

  private buildRequestBody(
    device: PushTargetDevice,
    payload: PushNotificationEnvelope
  ): Record<string, unknown> {
    const isIncomingCall =
      payload.type === "call.invite" || payload.type === "call.missed";
    const isAndroid = resolvePlatform(device) === "android";
    const data = stringifyPushData(payload);

    const body: Record<string, unknown> = {
      platform: isAndroid ? ["android"] : ["ios"],
      audience: {
        registration_id: [String(device.push_token).trim()]
      },
      options: {
        time_to_live: isIncomingCall ? CALL_TTL_SECONDS : MESSAGE_TTL_SECONDS,
        apns_production: config.push.jpushApnsProduction
      }
    };

    if (isAndroid) {
      body.message = {
        msg_content: JSON.stringify(data),
        title: payload.type,
        extras: data
      };
    } else {
      body.notification = {
        ios: {
          alert: {
            title: payload.title,
            body: payload.body
          },
          sound: isIncomingCall ? "incoming_ring" : "default",
          // `mutable_content` 触发 iOS Notification Service Extension 按本地铃声
          // 偏好设置 `content.sound`（sound.md §5.5）。
          "content-available": true,
          mutable_content: true,
          ...(payload.badge != null && !isIncomingCall
            ? { badge: payload.badge }
            : {}),
          category: isIncomingCall ? "MUSHROOM_CALL" : "MUSHROOM_MESSAGE",
          extras: data
        }
      };
    }

    return body;
  }
}

function resolvePlatform(device: PushTargetDevice): "android" | "ios" | null {
  const metadata = parseJsonObject(device.metadata);
  const platform = metadata?.platform;
  if (platform === "android") {
    return "android";
  }
  if (platform === "ios") {
    return "ios";
  }
  return null;
}

export default new JpushPushProvider();
