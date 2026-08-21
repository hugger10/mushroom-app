import { execFile, type ExecFileException } from "node:child_process";
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

interface XiaomiCliArgs {
  classpath: string;
  appSecret: string;
  packageName: string;
  region: string;
  regId: string;
  title: string;
  body: string;
  data: string;
  messageType: "notification" | "passthrough";
  channelId: string;
  templateId: string;
  templateParam: string;
  retries: number;
}

/**
 * 拼接传给 XiaomiPushCli 的参数数组。纯函数，便于单测。
 */
export function buildXiaomiCliArgs(input: XiaomiCliArgs): string[] {
  return [
    "-cp",
    input.classpath,
    "com.mushroom.push.xiaomi.XiaomiPushCli",
    input.appSecret,
    input.packageName,
    input.region,
    input.regId,
    input.title,
    input.body,
    input.data,
    input.messageType,
    input.channelId,
    input.templateId,
    input.templateParam,
    String(input.retries)
  ];
}

export function resolveXiaomiRegion(region: string) {
  const normalized = region.trim().toLowerCase();
  if (normalized === "mainland") {
    return "china";
  }
  if (normalized === "singapore") {
    return "global";
  }
  if (
    normalized === "china" ||
    normalized === "global" ||
    normalized === "europe" ||
    normalized === "russia" ||
    normalized === "india"
  ) {
    return normalized;
  }

  return "china";
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
    const channelId = config.push.xiaomiChannelId ?? "";
    const templateId = config.push.xiaomiTemplateId ?? "";

    // 私信消息（2026 消息分类新规）必须走模板：title/body 传模板结构
    // （{$keywordsN$} 占位符），template_param 填实际变量值，由 MiPush 拼装。
    // 官方好友聊天模板 M12762：标题「您有一条消息来自{$keywords1$}」、
    // 内容「{$keywords2$}」；keywords1=发送者，keywords2=消息内容。
    // 来电走透传（passThrough），不适用模板。
    let title = payload.title;
    let body = payload.body;
    let templateParam = "";
    if (!isCall && templateId) {
      title = "您有一条消息来自{$keywords1$}";
      body = "{$keywords2$}";
      templateParam = JSON.stringify({
        keywords1: payload.title ?? "",
        keywords2: payload.body ?? ""
      });
    }

    const args = buildXiaomiCliArgs({
      classpath,
      appSecret: config.push.xiaomiAppSecret,
      packageName: config.push.xiaomiPackageName,
      region:
        resolveDeviceRegion(device) ??
        resolveXiaomiRegion(config.push.xiaomiRegion),
      regId,
      title,
      body,
      data,
      messageType,
      channelId,
      templateId,
      templateParam,
      retries: config.push.xiaomiRetries
    });

    try {
      await execFileAsync(config.push.xiaomiJavaBin, args, {
        cwd: process.cwd(),
        timeout: config.push.xiaomiTimeoutMs,
        maxBuffer: 1024 * 1024
      });
    } catch (error) {
      const execError = error as ExecFileException;
      // Node 在 timeout 到期后会向子进程发 SIGTERM，此时 `killed === true`
      //（日志里常表现为 exit code 143）。区分它和真正的业务失败，
      // 以便提示运维排查容器到小米 API 的出网，而不是误判为参数/模板问题。
      const timedOut = execError.killed === true;
      logger.error(
        {
          err: error,
          pushProvider: this.id,
          pushType: payload.type,
          deviceId: device.device_id,
          regIdSuffix: regId.slice(-8),
          timedOut,
          stderr: execError.stderr?.trim() || undefined,
          stdout: execError.stdout?.trim() || undefined
        },
        timedOut
          ? "Xiaomi push delivery timed out (Xiaomi API likely unreachable)"
          : "Xiaomi push delivery failed"
      );
      throw error;
    }
  }
}

export default new XiaomiPushProvider();
