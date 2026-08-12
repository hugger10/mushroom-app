import fs from "fs";
import path from "path";
import { app } from "electron";
import { createDeviceId, isUuidV4 } from "@mushroom/app-core";
import log from "../utils/log";

const runtimeLog = log.scope("runtime");

export function getOrCreateDeviceId(): string {
  // userData 已在 main 入口按实例切换过，device-id 自然随实例隔离。
  const filePath = path.join(app.getPath("userData"), "device-id");

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8").trim();
    // 迁移兜底：仅接受统一格式（UUID v4），异常值视为缺失并重建。
    if (existing && isUuidV4(existing)) {
      return existing;
    }
  }
  const newId = createDeviceId();
  fs.writeFileSync(filePath, newId, "utf-8");
  runtimeLog.info("device id generated", { deviceId: newId });
  return newId;
}
