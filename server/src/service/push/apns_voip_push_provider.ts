import crypto from "crypto";
import http2 from "node:http2";
import logger from "../../utils/logger";
import { config } from "../../utils/config";
import type {
  PushNotificationEnvelope,
  PushProvider,
  PushTargetDevice
} from "./types";

type ApnsAuthToken = {
  token: string;
  // APNs requires the provider auth token to be refreshed at least hourly and
  // at most once every 20 minutes. We cache for ~50 minutes.
  expires_at: number;
};

const APNS_PRODUCTION_HOST = "https://api.push.apple.com";
const APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com";
const APNS_TOKEN_TTL_MS = 50 * 60 * 1000;

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * APNs VoIP (PushKit) push provider.
 *
 * Delivers ONLY `call.invite` (and the matching `call.missed` cancellation)
 * over Apple's dedicated VoIP topic (`<bundleId>.voip`). A VoIP push is the
 * only transport that reliably wakes a killed/background iOS app so the native
 * layer can synchronously report a CallKit incoming call — a normal
 * `content-available` data push is rate-limited and will not run JS when the
 * app has been swiped away.
 *
 * Targets devices by their `voip_token` (PushKit credential), which is
 * independent of the regular FCM/APNs `push_token` used for chat messages.
 * Uses token-based (.p8 / JWT ES256) authentication over HTTP/2.
 */
class ApnsVoipPushProvider implements PushProvider {
  readonly id = "apns_voip" as const;

  private authTokenCache: ApnsAuthToken | null = null;

  isConfigured() {
    return Boolean(
      config.push.apnsKeyId &&
        config.push.apnsTeamId &&
        config.push.apnsPrivateKey &&
        config.push.apnsBundleId
    );
  }

  canDeliver(device: PushTargetDevice) {
    return (
      typeof device.voip_token === "string" &&
      device.voip_token.trim().length > 0
    );
  }

  /**
   * Build the APNs JSON payload for a call invite / cancellation.
   *
   * Pure + side-effect free so it can be unit-tested without a network/HTTP2
   * connection. The native PushKit handler reads these fields to report (or
   * cancel) the CallKit call without needing the JS runtime.
   */
  buildPayload(payload: PushNotificationEnvelope) {
    return {
      type: payload.type,
      title: payload.title,
      body: payload.body,
      call_id: payload.call_id ?? "",
      conversation_id: payload.conversation_id ?? "",
      conversation_name: payload.conversation_name ?? "",
      call_scope:
        payload.call_scope !== undefined ? String(payload.call_scope) : "",
      media_type:
        payload.media_type !== undefined ? String(payload.media_type) : "",
      sender_user_id:
        payload.sender_user_id !== undefined
          ? String(payload.sender_user_id)
          : "",
      sender_device_id: payload.sender_device_id ?? "",
      timeout_seconds:
        payload.timeout_seconds !== undefined
          ? String(payload.timeout_seconds)
          : ""
    };
  }

  async deliverToDevice(
    device: PushTargetDevice,
    payload: PushNotificationEnvelope
  ) {
    // The VoIP channel only carries call signalling. Anything else is a routing
    // bug — fail loud rather than silently dropping a chat push here.
    if (payload.type !== "call.invite" && payload.type !== "call.missed") {
      throw new Error(
        `APNs VoIP provider received unsupported push type: ${payload.type}`
      );
    }

    const token = String(device.voip_token).trim();
    const authToken = this.getAuthToken();
    const host = config.push.apnsProduction
      ? APNS_PRODUCTION_HOST
      : APNS_SANDBOX_HOST;
    const body = JSON.stringify(this.buildPayload(payload));

    await this.sendOverHttp2({
      host,
      token,
      authToken,
      body,
      deviceId: device.device_id,
      pushType: payload.type
    });
  }

  private sendOverHttp2(input: {
    host: string;
    token: string;
    authToken: string;
    body: string;
    deviceId: string;
    pushType: PushNotificationEnvelope["type"];
  }) {
    return new Promise<void>((resolve, reject) => {
      const client = http2.connect(input.host);
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        client.close();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      client.on("error", err => finish(err as Error));

      const request = client.request({
        ":method": "POST",
        ":path": `/3/device/${input.token}`,
        authorization: `bearer ${input.authToken}`,
        "apns-topic": `${config.push.apnsBundleId}.voip`,
        "apns-push-type": "voip",
        "apns-priority": "10",
        "content-type": "application/json"
      });

      request.setTimeout(15_000, () => {
        request.close(http2.constants.NGHTTP2_CANCEL);
        finish(new Error("APNs VoIP request timed out"));
      });

      let status = 0;
      let responseBody = "";

      request.on("response", headers => {
        status = Number(headers[":status"]) || 0;
      });
      request.on("data", chunk => {
        responseBody += chunk;
      });
      request.on("end", () => {
        if (status >= 200 && status < 300) {
          finish();
          return;
        }

        logger.error(
          {
            status,
            pushProvider: this.id,
            pushType: input.pushType,
            tokenSuffix: input.token.slice(-8),
            deviceId: input.deviceId,
            body: responseBody
          },
          "APNs VoIP push delivery failed"
        );
        finish(
          new Error(`APNs VoIP push delivery failed with status ${status}`)
        );
      });
      request.on("error", err => finish(err as Error));

      request.write(input.body);
      request.end();
    });
  }

  private getAuthToken() {
    if (
      this.authTokenCache &&
      this.authTokenCache.expires_at > Date.now() + 60_000
    ) {
      return this.authTokenCache.token;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = toBase64Url(
      JSON.stringify({
        alg: "ES256",
        kid: config.push.apnsKeyId
      })
    );
    const claims = toBase64Url(
      JSON.stringify({
        iss: config.push.apnsTeamId,
        iat: nowSeconds
      })
    );
    const unsignedToken = `${header}.${claims}`;
    const signature = crypto.sign("SHA256", Buffer.from(unsignedToken), {
      key: config.push.apnsPrivateKey,
      dsaEncoding: "ieee-p1363"
    });
    const token = `${unsignedToken}.${toBase64Url(signature)}`;

    this.authTokenCache = {
      token,
      expires_at: Date.now() + APNS_TOKEN_TTL_MS
    };

    return token;
  }
}

export default new ApnsVoipPushProvider();
