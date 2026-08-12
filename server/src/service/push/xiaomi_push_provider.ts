import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import logger from "../../utils/logger";
import { config } from "../../utils/config";
import { parseJsonObject } from "../../utils/json";
import type {
  PushNotificationEnvelope,
  PushProvider,
  PushTargetDevice
} from "./types";
import { stringifyPushData } from "./types";

const execFileAsync = promisify(execFile);

function resolveXiaomiRegion(region: string) {
  const normalized = region.trim().toLowerCase();
  if (
    normalized === "mainland" ||
    normalized === "singapore" ||
    normalized === "europe" ||
    normalized === "russia" ||
    normalized === "india"
  ) {
    return normalized;
  }

  return "singapore";
}

function resolveDeviceRegion(device: PushTargetDevice) {
  if (!device.metadata) {
    return null;
  }

  const metadata = parseJsonObject(device.metadata);

  const region = metadata?.push_region;
  return typeof region === "string" && region.trim().length > 0
    ? resolveXiaomiRegion(region)
    : null;
}

class XiaomiPushProvider implements PushProvider {
  readonly id = "xiaomi" as const;

  isConfigured() {
    return Boolean(
      config.push.xiaomiAppSecret &&
        config.push.xiaomiPackageName &&
        config.push.xiaomiSdkDir &&
        config.push.xiaomiHelperClasspath
    );
  }

  canDeliver(device: PushTargetDevice) {
    return (
      typeof device.push_token === "string" &&
      device.push_token.trim().length > 0 &&
      device.push_provider === "xiaomi"
    );
  }

  async deliverToDevice(
    device: PushTargetDevice,
    payload: PushNotificationEnvelope
  ) {
    const regId = String(device.push_token).trim();
    const helperClasspath = path.resolve(config.push.xiaomiHelperClasspath);
    const sdkDir = path.resolve(config.push.xiaomiSdkDir);
    const classpath = [helperClasspath, path.join(sdkDir, "*")].join(
      process.platform === "win32" ? ";" : ":"
    );
    const data = Buffer.from(
      JSON.stringify(stringifyPushData(payload)),
      "utf8"
    ).toString("base64");
    // Call invites are delivered as pass-through messages so the native
    // receiver can wake a HeadlessJS task (CallKeep + full-screen UI) instead
    // of the SDK auto-posting a plain notification. Chat messages stay as
    // normal notifications.
    const isCall =
      payload.type === "call.invite" || payload.type === "call.missed";
    const messageType = isCall ? "passthrough" : "notification";
    const args = [
      "-cp",
      classpath,
      "com.mushroom.push.xiaomi.XiaomiPushCli",
      config.push.xiaomiAppSecret,
      config.push.xiaomiPackageName,
      resolveDeviceRegion(device) ??
        resolveXiaomiRegion(config.push.xiaomiRegion),
      regId,
      payload.title,
      payload.body,
      data,
      messageType
    ];

    try {
      await execFileAsync(config.push.xiaomiJavaBin, args, {
        cwd: process.cwd(),
        timeout: 20_000,
        maxBuffer: 1024 * 1024
      });
    } catch (error) {
      logger.error(
        {
          err: error,
          pushProvider: this.id,
          pushType: payload.type,
          deviceId: device.device_id,
          regIdSuffix: regId.slice(-8)
        },
        "Xiaomi push delivery failed"
      );
      throw error;
    }
  }
}

export default new XiaomiPushProvider();
