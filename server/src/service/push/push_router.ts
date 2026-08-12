import type { UserNotificationSettings } from "@mushroom/shared";
import logger from "../../utils/logger";
import { config } from "../../utils/config";
import UserDeviceRepository from "../../repository/user_device_repository";
import ConversationReadStateRepository from "../../repository/conversation/conversation_read_state_repository";
import NotificationSettingsService from "../notification_settings_service";
import FcmPushProvider from "./fcm_push_provider";
import HuaweiPushProvider from "./huawei_push_provider";
import JpushPushProvider from "./jpush_push_provider";
import XiaomiPushProvider from "./xiaomi_push_provider";
import ApnsVoipPushProvider from "./apns_voip_push_provider";
import type {
  PushDeliveryResult,
  PushNotificationEnvelope,
  PushProvider,
  PushProviderId,
  PushTargetDevice
} from "./types";
import { normalizePushProvider } from "./types";
import { logPayload } from "../../utils/payload_logger";

function currentHHmm() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function isQuietHoursActive(settings: UserNotificationSettings) {
  if (!settings.quiet_hours_enabled) {
    return false;
  }

  const now = currentHHmm();
  const start = settings.quiet_hours_start;
  const end = settings.quiet_hours_end;

  if (start === end) {
    return true;
  }

  if (start < end) {
    return now >= start && now < end;
  }

  return now >= start || now < end;
}

function shouldDeliverBySettings(
  settings: UserNotificationSettings,
  payload: PushNotificationEnvelope
) {
  const isCall =
    payload.type === "call.invite" || payload.type === "call.missed";
  const isQuiet = isQuietHoursActive(settings);

  if (isCall) {
    return (
      settings.calls_enabled && (!isQuiet || settings.quiet_hours_allow_calls)
    );
  }

  if (!settings.messages_enabled) {
    return false;
  }

  if (payload.conversation_type === 2 && !settings.group_messages_enabled) {
    return false;
  }

  if (settings.mention_only && !payload.is_mention) {
    return false;
  }

  if (isQuiet) {
    return payload.is_mention && settings.quiet_hours_allow_mentions;
  }

  return true;
}

class PushRouter {
  private readonly providers = new Map<PushProviderId, PushProvider>([
    [JpushPushProvider.id, JpushPushProvider],
    [FcmPushProvider.id, FcmPushProvider],
    [HuaweiPushProvider.id, HuaweiPushProvider],
    [XiaomiPushProvider.id, XiaomiPushProvider],
    [ApnsVoipPushProvider.id, ApnsVoipPushProvider]
  ]);

  async deliverToUser(
    userId: number,
    payload: PushNotificationEnvelope
  ): Promise<PushDeliveryResult> {
    if (!config.push.enabled) {
      return { mode: "disabled", targetedDevices: 0, delivered: 0 };
    }

    const settings =
      await NotificationSettingsService.getNotificationSettings(userId);
    if (!shouldDeliverBySettings(settings, payload)) {
      return { mode: "suppressed", targetedDevices: 0, delivered: 0 };
    }

    // Force silent delivery when the user has muted sound or when we are
    // currently inside the quiet-hours window. The visual notification still
    // goes out (subject to the should-deliver gate above), but providers must
    // suppress audible cues. Calls are intentionally exempted: an incoming
    // call must always ring once it has passed `shouldDeliverBySettings`.
    const isCall =
      payload.type === "call.invite" || payload.type === "call.missed";
    const silent =
      !isCall && (!settings.sound_enabled || isQuietHoursActive(settings));

    // Attach the recipient's total unread count so iOS can render the
    // app-icon badge via APNs `aps.badge` even when the app is killed, and
    // so Android background handlers can fall back to it. Skipped for
    // `call.invite` (a ringing call should not mutate the unread badge);
    // `call.missed` and `chat.message` both reflect a real unread item.
    let badge: number | undefined;
    if (payload.type !== "call.invite") {
      try {
        badge =
          await ConversationReadStateRepository.getTotalUnreadForUser(userId);
      } catch (error) {
        // Badge is a best-effort enhancement — never block delivery on it.
        logger.warn(
          { err: error, userId },
          "Failed to compute unread badge; delivering push without badge"
        );
      }
    }

    const effectivePayload: PushNotificationEnvelope =
      silent || badge !== undefined
        ? {
            ...payload,
            ...(silent ? { silent: true } : {}),
            ...(badge !== undefined ? { badge } : {})
          }
        : payload;

    const devices = await UserDeviceRepository.listByUser(userId);
    // Only route call signalling exclusively over APNs VoIP when that provider
    // is actually configured; otherwise fall back to the device's regular push
    // token (FCM) so a missing/forgotten APNs key does not silently break all
    // iOS calls with no fallback.
    const apnsVoipConfigured =
      this.providers.get(ApnsVoipPushProvider.id)?.isConfigured() ?? false;
    const targets = this.collectTargets(devices, isCall, apnsVoipConfigured);

    if (targets.length === 0) {
      return { mode: "no-target", targetedDevices: 0, delivered: 0 };
    }

    logger.debug(
      {
        userId,
        pushType: payload.type,
        targetedDevices: targets.length,
        providerIds: targets.map(item => item.push_provider),
        silent
      },
      "Push notification routing"
    );

    logPayload(
      {
        scope: "push.envelope",
        userId,
        classify: payload.type
      },
      effectivePayload
    );

    if (config.push.dryRun) {
      logger.info(
        {
          userId,
          pushType: payload.type,
          targetedDevices: targets.length,
          providerIds: targets.map(item => item.push_provider),
          silent
        },
        "Push notification queued without remote delivery"
      );
      return {
        mode: "dry-run",
        targetedDevices: targets.length,
        delivered: 0
      };
    }

    let delivered = 0;
    let unconfiguredCount = 0;
    let failedCount = 0;
    let noProviderCount = 0;
    const deliveredProviders = new Set<PushProviderId>();

    for (const device of targets) {
      const providerId = normalizePushProvider(device.push_provider);
      const provider = providerId ? this.providers.get(providerId) : null;
      if (!provider) {
        noProviderCount += 1;
        continue;
      }

      if (!provider.isConfigured()) {
        unconfiguredCount += 1;
        continue;
      }

      try {
        await provider.deliverToDevice(device, effectivePayload);
        delivered += 1;
        deliveredProviders.add(provider.id);
      } catch (error) {
        failedCount += 1;
        logger.warn(
          {
            err: error,
            userId,
            deviceId: device.device_id,
            pushProvider: provider.id,
            pushType: payload.type,
            tokenSuffix: device.push_token?.slice(-6)
          },
          "Push delivery failed for a target device"
        );
      }
    }

    return {
      mode: this.resolveMode({
        targetedDevices: targets.length,
        delivered,
        unconfiguredCount,
        failedCount,
        noProviderCount,
        deliveredProviders
      }),
      targetedDevices: targets.length,
      delivered
    };
  }

  /**
   * Resolve the concrete (provider, token) targets for a user's devices.
   *
   * For call signalling (`isCall`), an iOS device that registered a PushKit
   * `voip_token` is routed through the dedicated `apns_voip` provider — the
   * only transport that reliably wakes a killed/background iOS app to show
   * CallKit. Such a device is NOT also targeted via its regular FCM token, to
   * avoid a duplicate ring. Devices without a VoIP token (Android, or iOS that
   * has not yet registered one) keep their normal provider/token.
   *
   * The VoIP fast-path is only taken when `apnsVoipConfigured` is true. If APNs
   * VoIP is not configured, such a device falls back to its regular push token
   * (FCM) rather than being dropped, so iOS calls are not silently lost when the
   * APNs key is missing.
   */
  private collectTargets(
    devices: PushTargetDevice[],
    isCall: boolean,
    apnsVoipConfigured: boolean
  ) {
    const deduped = new Map<string, PushTargetDevice>();

    for (const device of devices) {
      if (Number(device.status) !== 1) {
        continue;
      }

      const voipToken =
        typeof device.voip_token === "string" ? device.voip_token.trim() : "";

      if (isCall && apnsVoipConfigured && voipToken.length > 0) {
        const key = `apns_voip:${voipToken}`;
        deduped.set(key, {
          ...device,
          push_provider: "apns_voip",
          voip_token: voipToken
        });
        continue;
      }

      if (
        typeof device.push_token !== "string" ||
        device.push_token.trim().length === 0
      ) {
        continue;
      }

      const providerId = normalizePushProvider(device.push_provider) ?? "fcm";
      const key = `${providerId}:${device.push_token.trim()}`;
      deduped.set(key, {
        ...device,
        push_provider: providerId,
        push_token: device.push_token.trim()
      });
    }

    return Array.from(deduped.values());
  }

  private resolveMode(input: {
    targetedDevices: number;
    delivered: number;
    unconfiguredCount: number;
    failedCount: number;
    noProviderCount: number;
    deliveredProviders: Set<PushProviderId>;
  }) {
    if (input.delivered === 0) {
      if (input.unconfiguredCount === input.targetedDevices) {
        return "unconfigured";
      }

      if (input.noProviderCount === input.targetedDevices) {
        return "no-provider";
      }

      return "failed";
    }

    if (
      input.delivered === input.targetedDevices &&
      input.deliveredProviders.size === 1
    ) {
      return Array.from(input.deliveredProviders)[0];
    }

    if (
      input.delivered === input.targetedDevices &&
      input.deliveredProviders.size > 1
    ) {
      return "multi";
    }

    return "partial";
  }
}

export default new PushRouter();
