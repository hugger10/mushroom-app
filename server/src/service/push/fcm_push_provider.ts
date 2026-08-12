import crypto from "crypto";
import logger from "../../utils/logger";
import { config } from "../../utils/config";
import type {
  PushNotificationEnvelope,
  PushProvider,
  PushTargetDevice
} from "./types";
import { stringifyPushData } from "./types";

type GoogleAccessToken = {
  access_token: string;
  expires_at: number;
};

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

class FcmPushProvider implements PushProvider {
  readonly id = "fcm" as const;

  private accessTokenCache: GoogleAccessToken | null = null;

  isConfigured() {
    return Boolean(
      config.push.fcmProjectId &&
        config.push.fcmClientEmail &&
        config.push.fcmPrivateKey
    );
  }

  canDeliver(device: PushTargetDevice) {
    return (
      typeof device.push_token === "string" &&
      device.push_token.trim().length > 0
    );
  }

  /**
   * Build the FCM HTTP v1 message body for a device + envelope.
   *
   * Both `chat.message` and `call.invite` are delivered as **data-only**
   * messages on Android: we deliberately omit the top-level `notification`
   * block and the `android.notification` block so the FCM SDK never
   * auto-displays a system notification. Display is handled entirely by the
   * client's JS background handler (Notifee), which keeps a single,
   * deduped, fully-styled notification across foreground (WS) and
   * background (push) transports. Sending both blocks previously produced a
   * duplicate notification when the app was backgrounded/killed.
   *
   * Pure + side-effect free so it can be unit-tested without network.
   */
  buildMessage(token: string, payload: PushNotificationEnvelope) {
    const data = stringifyPushData(payload);
    const isIncomingCall = payload.type === "call.invite";
    const silent = payload.silent === true;
    const hasBadge =
      typeof payload.badge === "number" && Number.isFinite(payload.badge);
    return {
      message: {
        token,
        data,
        android: {
          // data-only messages require high priority to reliably wake the
          // background JS handler under Doze / background restrictions.
          priority: "high"
        },
        apns: {
          headers: {
            "apns-priority": isIncomingCall ? "10" : "5"
          },
          payload: {
            aps: {
              // Drive the iOS home-screen badge directly from APNs so the
              // count stays correct even when the app is killed (JS never
              // runs in that state). Omitted for incoming calls.
              ...(hasBadge && !isIncomingCall
                ? { badge: Math.max(0, Math.round(payload.badge as number)) }
                : {}),
              ...(isIncomingCall
                ? {
                    "content-available": 1,
                    ...(silent ? {} : { sound: "default" }),
                    category: "MUSHROOM_CALL"
                  }
                : {
                    alert: {
                      title: payload.title,
                      body: payload.body
                    },
                    // `mutable-content: 1` 触发 iOS Notification Service Extension
                    // 在后台/锁屏态按本地铃声偏好设置 `content.sound`（sound.md §5.5）。
                    "mutable-content": 1,
                    ...(silent ? {} : { sound: "default" }),
                    category: "MUSHROOM_MESSAGE"
                  })
            }
          }
        }
      },
      validate_only: false
    };
  }

  async deliverToDevice(
    device: PushTargetDevice,
    payload: PushNotificationEnvelope
  ) {
    const accessToken = await this.getAccessToken();
    const token = String(device.push_token).trim();
    const endpoint = `https://fcm.googleapis.com/v1/projects/${config.push.fcmProjectId}/messages:send`;
    const body = this.buildMessage(token, payload);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          status: response.status,
          pushProvider: this.id,
          pushType: payload.type,
          tokenSuffix: token.slice(-8),
          deviceId: device.device_id,
          body: errorText
        },
        "FCM push delivery failed"
      );
      throw new Error(
        `FCM push delivery failed with status ${response.status}`
      );
    }
  }

  private async getAccessToken() {
    if (
      this.accessTokenCache &&
      this.accessTokenCache.expires_at > Date.now() + 60_000
    ) {
      return this.accessTokenCache.access_token;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = toBase64Url(
      JSON.stringify({
        alg: "RS256",
        typ: "JWT"
      })
    );
    const payload = toBase64Url(
      JSON.stringify({
        iss: config.push.fcmClientEmail,
        sub: config.push.fcmClientEmail,
        aud: "https://oauth2.googleapis.com/token",
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        iat: nowSeconds,
        exp: nowSeconds + 3600
      })
    );
    const unsignedToken = `${header}.${payload}`;
    const signature = crypto.sign(
      "RSA-SHA256",
      Buffer.from(unsignedToken),
      config.push.fcmPrivateKey
    );
    const assertion = `${unsignedToken}.${toBase64Url(signature)}`;

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      }).toString(),
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to obtain Google access token: ${response.status} ${errorText}`
      );
    }

    const result = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.accessTokenCache = {
      access_token: result.access_token,
      expires_at: Date.now() + Math.max(60, result.expires_in) * 1000
    };

    return result.access_token;
  }
}

export default new FcmPushProvider();
