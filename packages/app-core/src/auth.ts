import type { DeviceRegistrationPayload, LoginUser } from "@mushroom/shared";
import type { DeviceEnvironmentInfo } from "./types";

const base64Alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64Chunk(input: string) {
  const values = input
    .split("")
    .filter(character => character !== "=")
    .map(character => base64Alphabet.indexOf(character))
    .filter(value => value >= 0);

  const bytes: number[] = [];
  for (let index = 0; index < values.length; index += 4) {
    const first = values[index] ?? 0;
    const second = values[index + 1] ?? 0;
    const third = values[index + 2];
    const fourth = values[index + 3];

    bytes.push((first << 2) | (second >> 4));

    if (third !== undefined) {
      bytes.push(((second & 0x0f) << 4) | (third >> 2));
    }

    if (fourth !== undefined) {
      bytes.push((((third ?? 0) & 0x03) << 6) | fourth);
    }
  }

  return Uint8Array.from(bytes);
}

function decodeUtf8(bytes: Uint8Array) {
  let result = "";

  for (let index = 0; index < bytes.length; ) {
    const first = bytes[index] ?? 0;

    if (first < 0x80) {
      result += String.fromCharCode(first);
      index += 1;
      continue;
    }

    if (first < 0xe0) {
      const second = bytes[index + 1] ?? 0;
      result += String.fromCharCode(((first & 0x1f) << 6) | (second & 0x3f));
      index += 2;
      continue;
    }

    if (first < 0xf0) {
      const second = bytes[index + 1] ?? 0;
      const third = bytes[index + 2] ?? 0;
      result += String.fromCharCode(
        ((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f)
      );
      index += 3;
      continue;
    }

    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const fourth = bytes[index + 3] ?? 0;
    const codePoint =
      ((first & 0x07) << 18) |
      ((second & 0x3f) << 12) |
      ((third & 0x3f) << 6) |
      (fourth & 0x3f);
    result += String.fromCodePoint(codePoint);
    index += 4;
  }

  return result;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  const globalAtob = (globalThis as { atob?: (input: string) => string }).atob;
  if (typeof globalAtob === "function") {
    return globalAtob(padded);
  }

  return decodeUtf8(decodeBase64Chunk(padded));
}

export function parseJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }

    return JSON.parse(decodeBase64Url(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getJwtExpiryEpochMs(token: string) {
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp ?? 0);
  return exp > 0 ? exp * 1000 : 0;
}

export function isJwtExpired(token: string, skewMs = 30_000) {
  const expiresAt = getJwtExpiryEpochMs(token);
  if (!expiresAt) {
    return false;
  }

  return Date.now() + skewMs >= expiresAt;
}

export function buildLoginUserFromAccessToken(options: {
  accessToken: string;
  refreshToken?: string | null;
}) {
  const payload = parseJwtPayload(options.accessToken);
  if (!payload) {
    return null;
  }

  const userId = Number(payload.userId ?? payload.user_id ?? 0);
  const username = String(payload.username ?? "");
  const nickname = String(payload.nickname ?? username);

  if (!userId || !username) {
    return null;
  }

  const loginUser: LoginUser = {
    userId,
    username,
    nickname,
    device_id:
      typeof payload.deviceId === "string"
        ? payload.deviceId
        : typeof payload.device_id === "string"
          ? payload.device_id
          : undefined,
    expires_in: Number(payload.exp ?? 0) || undefined,
    access_token: options.accessToken,
    refresh_token: options.refreshToken ?? undefined
  };

  return loginUser;
}

export function extractUidFromAccessToken(accessToken: string): string | null {
  const payload = parseJwtPayload(accessToken);
  if (!payload) {
    return null;
  }
  const userId = Number(payload.userId ?? payload.user_id ?? 0);
  if (!userId || Number.isNaN(userId)) {
    return null;
  }
  return String(userId);
}

export function buildDeviceRegistrationPayload(
  info: DeviceEnvironmentInfo
): DeviceRegistrationPayload {
  return {
    device_id: info.deviceId,
    device_type: info.deviceType,
    device_name: info.deviceName,
    app_version: info.appVersion,
    push_provider: info.pushProvider ?? undefined,
    push_token: info.pushToken ?? undefined,
    voip_token: info.voipToken ?? undefined,
    push_app_id: info.pushAppId ?? undefined,
    push_capabilities: info.pushCapabilities,
    metadata: info.metadata
  };
}
