import logger from "../../utils/logger";
import { config } from "../../utils/config";
import type {
  PushNotificationEnvelope,
  PushProvider,
  PushTargetDevice
} from "./types";
import { stringifyPushData } from "./types";

type HuaweiAccessToken = {
  access_token: string;
  expires_at: number;
};

class HuaweiPushProvider implements PushProvider {
  readonly id = "huawei" as const;

  private accessTokenCache: HuaweiAccessToken | null = null;

  isConfigured() {
    return Boolean(
      config.push.huaweiAppId &&
        config.push.huaweiClientId &&
        config.push.huaweiClientSecret
    );
  }

  canDeliver(device: PushTargetDevice) {
    return (
      typeof device.push_token === "string" &&
      device.push_token.trim().length > 0 &&
      (device.push_provider === "huawei" || device.push_provider == null)
    );
  }

  async deliverToDevice(
    device: PushTargetDevice,
    payload: PushNotificationEnvelope
  ) {
    const appId = String(device.push_app_id ?? config.push.huaweiAppId).trim();
    if (!appId) {
      throw new Error("Huawei push app id is required");
    }

    const token = String(device.push_token).trim();
    const accessToken = await this.getAccessToken();
    const data = stringifyPushData(payload);
    const silent = payload.silent === true;
    const endpoint = `${config.push.huaweiPushApiUrl.replace(/\/+$/u, "")}/v1/${appId}/messages:send`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        validate_only: false,
        message: {
          token: [token],
          data: JSON.stringify(data),
          android: {
            urgency: payload.type === "call.invite" ? "HIGH" : "NORMAL",
            ttl: payload.type === "call.invite" ? "60s" : "86400s",
            notification: {
              title: payload.title,
              body: payload.body,
              default_sound: !silent,
              click_action: {
                type: 3
              }
            }
          }
        }
      }),
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
          appId,
          body: errorText
        },
        "Huawei push delivery failed"
      );
      throw new Error(
        `Huawei push delivery failed with status ${response.status}`
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

    const response = await fetch(config.push.huaweiOauthUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.push.huaweiClientId,
        client_secret: config.push.huaweiClientSecret
      }).toString(),
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to obtain Huawei access token: ${response.status} ${errorText}`
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

export default new HuaweiPushProvider();
