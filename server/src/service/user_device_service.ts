import type { Request } from "express";
import type { IncomingMessage } from "http";
import net from "node:net";
import type { DeviceRegistrationPayload } from "@mushroom/shared";
import pg from "../db/pg";
import AuthAuditRepository from "../repository/auth_audit_repository";
import { type DbTx } from "../repository/conversation/conversation_core_repository";
import UserDeviceRepository from "../repository/user_device_repository";
import UserSessionRepository from "../repository/user_session_repository";
import { parseJsonObject } from "../utils/json";
import { wsServer } from "../websocket";

function normalizePushProviderValue(
  value: unknown
): "jpush" | "fcm" | "huawei" | "xiaomi" | null {
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

  return null;
}

function getForwardedIp(value: string | string[] | undefined) {
  if (!value) {
    return null;
  }

  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw.split(",")[0]?.trim();
  return first || null;
}

function normalizeIp(ip: string | null) {
  if (!ip) {
    return null;
  }

  const normalized = ip.trim();
  return net.isIP(normalized) ? normalized : null;
}

function getRequestIp(req: Request | IncomingMessage) {
  const forwarded = getForwardedIp(req.headers["x-forwarded-for"]);
  if (forwarded) {
    return normalizeIp(forwarded);
  }

  const socketAddress = req.socket.remoteAddress?.trim();
  return normalizeIp(socketAddress || null);
}

function getUserAgent(req: Request | IncomingMessage) {
  const userAgent = req.headers["user-agent"];
  if (Array.isArray(userAgent)) {
    return userAgent[0] ?? null;
  }

  return userAgent?.trim() || null;
}

function normalizeMetadata(
  metadata?: Record<string, unknown> | null,
  pushCapabilities?: string[] | null,
  req?: Request | IncomingMessage
) {
  const normalized: Record<string, unknown> = {};

  if (metadata && typeof metadata === "object") {
    Object.assign(normalized, metadata);
  }

  if (Array.isArray(pushCapabilities) && pushCapabilities.length > 0) {
    normalized.push_capabilities = Array.from(
      new Set(
        pushCapabilities
          .map(item => String(item).trim())
          .filter(item => item.length > 0)
      )
    );
  }

  if (req) {
    const userAgent = getUserAgent(req);
    if (userAgent && normalized.user_agent === undefined) {
      normalized.user_agent = userAgent;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

class UserDeviceService {
  async registerAuthenticatedDevice(
    userId: number,
    device: DeviceRegistrationPayload | undefined,
    req: Request
  ) {
    if (!device?.device_id) {
      return null;
    }

    return UserDeviceRepository.upsertDevice({
      user_id: userId,
      device_id: device.device_id,
      device_type: device.device_type ?? null,
      device_name: device.device_name ?? null,
      push_provider: device.push_provider ?? null,
      push_token: device.push_token ?? null,
      voip_token: device.voip_token ?? null,
      push_app_id: device.push_app_id ?? null,
      app_version: device.app_version ?? null,
      last_ip: getRequestIp(req),
      metadata: normalizeMetadata(
        device.metadata,
        device.push_capabilities ?? null,
        req
      ),
      markLoggedIn: false
    });
  }

  async registerLoginDevice(
    userId: number,
    device: DeviceRegistrationPayload | undefined,
    req: Request
  ) {
    if (!device?.device_id) {
      return null;
    }

    const registered = await this.registerAuthenticatedDevice(
      userId,
      device,
      req
    );
    if (!registered) {
      return null;
    }

    return UserDeviceRepository.upsertDevice({
      user_id: userId,
      device_id: device.device_id,
      device_type: device.device_type ?? null,
      device_name: device.device_name ?? null,
      push_provider: device.push_provider ?? null,
      push_token: device.push_token ?? null,
      voip_token: device.voip_token ?? null,
      push_app_id: device.push_app_id ?? null,
      app_version: device.app_version ?? null,
      last_ip: getRequestIp(req),
      metadata: normalizeMetadata(
        device.metadata,
        device.push_capabilities ?? null,
        req
      ),
      markLoggedIn: true
    });
  }

  async registerOrRefreshWebSocketDevice(
    userId: number,
    deviceId: string,
    req: IncomingMessage,
    patch?: {
      device_type?: number | null;
      device_name?: string | null;
      push_provider?: string | null;
      push_token?: string | null;
      voip_token?: string | null;
      push_app_id?: string | null;
      app_version?: string | null;
      push_capabilities?: string[] | null;
      metadata?: Record<string, unknown> | null;
    }
  ) {
    return UserDeviceRepository.upsertDevice({
      user_id: userId,
      device_id: deviceId,
      device_type: patch?.device_type ?? null,
      device_name: patch?.device_name ?? null,
      push_provider: patch?.push_provider ?? null,
      push_token: patch?.push_token ?? null,
      voip_token: patch?.voip_token ?? null,
      push_app_id: patch?.push_app_id ?? null,
      app_version: patch?.app_version ?? null,
      last_ip: getRequestIp(req),
      metadata: normalizeMetadata(
        patch?.metadata,
        patch?.push_capabilities ?? null,
        req
      ),
      markLoggedIn: false
    });
  }

  async touchWebSocketDeviceSeen(
    userId: number,
    deviceId: string,
    req: IncomingMessage
  ) {
    return UserDeviceRepository.touchDeviceSeen(userId, deviceId, {
      last_ip: getRequestIp(req),
      metadata: normalizeMetadata(null, null, req)
    });
  }

  async getManagedDevices(userId: number, currentDeviceId?: string | null) {
    const [devices, onlineDeviceIds, activeSessionCounts] = await Promise.all([
      UserDeviceRepository.listByUser(userId),
      wsServer.getOnlineDeviceIds(userId),
      UserSessionRepository.countActiveSessionsByUser(userId)
    ]);
    const onlineSet = new Set(onlineDeviceIds.map(item => String(item)));
    const sessionCountMap = new Map(
      activeSessionCounts.map(item => [
        item.device_id == null ? "__null__" : String(item.device_id),
        Number(item.active_session_count)
      ])
    );

    return {
      current_device_id: currentDeviceId ?? null,
      devices: devices.map(device => {
        const metadata = parseJsonObject(device.metadata);
        return {
          device_id: device.device_id,
          device_type: device.device_type,
          device_name: device.device_name ?? null,
          push_provider: normalizePushProviderValue(device.push_provider),
          push_token: device.push_token ?? null,
          push_app_id: device.push_app_id ?? null,
          push_capabilities:
            (metadata?.push_capabilities as string[] | undefined) ?? null,
          app_version: device.app_version ?? null,
          last_seen_at: device.last_seen_at?.toISOString() ?? null,
          last_login_at: device.last_login_at?.toISOString() ?? null,
          last_ip: device.last_ip ?? null,
          status: device.status,
          metadata,
          is_current_device:
            currentDeviceId != null &&
            String(device.device_id) === String(currentDeviceId),
          is_online: onlineSet.has(String(device.device_id)),
          active_session_count:
            sessionCountMap.get(String(device.device_id)) ?? 0
        };
      })
    };
  }

  async logoutCurrentDevice(
    userId: number,
    currentSessionId?: string | null,
    currentDeviceId?: string | null
  ) {
    await pg.tx(async (t: DbTx) => {
      if (currentSessionId) {
        await UserSessionRepository.revokeSession(
          currentSessionId,
          "logged_out",
          1,
          t
        );
      }

      if (currentDeviceId) {
        await UserDeviceRepository.updateDeviceStatus(
          userId,
          currentDeviceId,
          2,
          t
        );
      }
    });

    if (currentDeviceId) {
      await wsServer.disconnectUserDevices(userId, {
        targetDeviceId: currentDeviceId,
        reason: "logged_out"
      });
    }

    await AuthAuditRepository.insert({
      user_id: userId,
      device_id: currentDeviceId ?? null,
      session_id: currentSessionId ?? null,
      action: "logout.current",
      action_status: 0
    });
  }

  /**
   * 客户端切换账号 / wipe-logout 时主动注销当前设备的推送：
   *   - 把 user_devices.push_token 置 NULL，避免推送路由继续投递到本机
   *   - 把状态置 2 (logged out)，与 logoutCurrentDevice 后置一致
   *   - 不触动 session / ws / 任何其它 deviceId（device 来自 JWT）
   *
   * 不写 audit log 的原因：本调用是 logout 流程里的「凭据清理」一步，
   * 调用方紧接着还会走 logoutCurrentDevice，那里已经写 `logout.current`。
   */
  async unregisterPushForCurrentDevice(
    userId: number,
    currentDeviceId: string
  ) {
    if (!currentDeviceId) {
      return null;
    }
    return UserDeviceRepository.unregisterPushAndLogout(
      userId,
      currentDeviceId
    );
  }

  async logoutDevice(
    userId: number,
    deviceId: string,
    currentDeviceId?: string | null,
    currentSessionId?: string | null
  ) {
    const { updated, revokedSessions } = await pg.tx(async (t: DbTx) => {
      const updated = await UserDeviceRepository.updateDeviceStatus(
        userId,
        deviceId,
        2,
        t
      );
      // 即使 device 行未被更新（已是 logged-out 状态或不存在），仍尝试撤销可能遗留的
      // session，避免崩溃恢复 / 重复请求场景下 session 与 device 状态不一致。
      const revokedSessions = await UserSessionRepository.revokeSessionsByUser(
        userId,
        {
          targetDeviceId: deviceId,
          reason: "device_logged_out"
        },
        t
      );
      return { updated, revokedSessions };
    });

    await wsServer.disconnectUserDevices(userId, {
      targetDeviceId: deviceId,
      reason: "device_revoked"
    });
    await AuthAuditRepository.insert({
      user_id: userId,
      device_id: deviceId,
      session_id: currentSessionId ?? null,
      action: "logout.device",
      action_status: 0,
      details: {
        revoked_session_count: revokedSessions.length
      }
    });

    return {
      revoked_count: updated || revokedSessions.length > 0 ? 1 : 0,
      current_device_id: currentDeviceId ?? null
    };
  }

  async logoutAllDevices(
    userId: number,
    currentSessionId?: string | null,
    currentDeviceId?: string | null,
    keepCurrent = false
  ) {
    const { updated, revokedSessions } = await pg.tx(async (t: DbTx) => {
      const updated = await UserDeviceRepository.updateDevicesStatusByUser(
        userId,
        2,
        {
          excludeDeviceId: keepCurrent ? (currentDeviceId ?? null) : null
        },
        t
      );
      const revokedSessions = await UserSessionRepository.revokeSessionsByUser(
        userId,
        {
          excludeDeviceId: keepCurrent ? (currentDeviceId ?? null) : null,
          excludeSessionId: keepCurrent ? (currentSessionId ?? null) : null,
          reason: keepCurrent ? "logout_other_devices" : "logout_all_devices"
        },
        t
      );
      return { updated, revokedSessions };
    });

    await wsServer.disconnectUserDevices(userId, {
      excludeDeviceId: keepCurrent ? (currentDeviceId ?? undefined) : undefined,
      reason: keepCurrent ? "logout_other_devices" : "logout_all_devices"
    });
    await AuthAuditRepository.insert({
      user_id: userId,
      device_id: currentDeviceId ?? null,
      session_id: currentSessionId ?? null,
      action: keepCurrent ? "logout.others" : "logout.all",
      action_status: 0,
      details: {
        revoked_device_count: updated.length,
        revoked_session_count: revokedSessions.length
      }
    });

    return {
      revoked_count: updated.length,
      current_device_id: currentDeviceId ?? null
    };
  }

  async disableDevice(
    userId: number,
    deviceId: string,
    currentDeviceId?: string | null,
    currentSessionId?: string | null
  ) {
    const { updated, revokedSessions } = await pg.tx(async (t: DbTx) => {
      const updated = await UserDeviceRepository.updateDeviceStatus(
        userId,
        deviceId,
        0,
        t
      );
      // 即使 device 行未被更新（已是 disabled 状态或不存在），仍尝试撤销可能遗留的
      // session，避免崩溃恢复 / 重复请求场景下 session 与 device 状态不一致。
      const revokedSessions = await UserSessionRepository.revokeSessionsByUser(
        userId,
        {
          targetDeviceId: deviceId,
          reason: "device_disabled"
        },
        t
      );
      return { updated, revokedSessions };
    });

    await wsServer.disconnectUserDevices(userId, {
      targetDeviceId: deviceId,
      reason: "device_disabled"
    });
    await AuthAuditRepository.insert({
      user_id: userId,
      device_id: deviceId,
      session_id: currentSessionId ?? null,
      action: "device.disable",
      action_status: 0,
      details: {
        revoked_session_count: revokedSessions.length
      }
    });

    return {
      updated: Boolean(updated) || revokedSessions.length > 0,
      target_device_id: deviceId,
      status: 0,
      current_device_id: currentDeviceId ?? null
    };
  }

  async restoreDevice(
    userId: number,
    deviceId: string,
    currentDeviceId?: string | null,
    currentSessionId?: string | null
  ) {
    const updated = await UserDeviceRepository.updateDeviceStatus(
      userId,
      deviceId,
      1
    );

    await AuthAuditRepository.insert({
      user_id: userId,
      device_id: deviceId,
      session_id: currentSessionId ?? null,
      action: "device.restore",
      action_status: 0
    });

    return {
      updated: Boolean(updated),
      target_device_id: deviceId,
      status: 1,
      current_device_id: currentDeviceId ?? null
    };
  }
}

export default new UserDeviceService();
