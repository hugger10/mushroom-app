import { buildDeviceRegistrationPayload } from "@mushroom/app-core";
import {
  ensureFreshAccessToken,
  uploadMobileAttachment,
  uploadMobileAvatar
} from "../api";
import {
  ensureMobileDeviceInfoReady,
  mobileApiBaseUrl,
  mobileDeviceInfo
} from "./device-identity";
import { mobileServerApi } from "./api-proxy";
import { requireActiveSession } from "./session";

export async function uploadMobileFile(options: {
  uri: string;
  name: string;
  type?: string;
  size?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  category?: import("@mushroom/shared").AttachmentCategory;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}) {
  const session = requireActiveSession();
  return uploadMobileAttachment({
    baseURL: mobileApiBaseUrl,
    authStore: session.authStore,
    file: {
      uri: options.uri,
      name: options.name,
      type: options.type,
      size: options.size,
      width: options.width,
      height: options.height,
      durationMs: options.durationMs,
      category: options.category
    },
    onProgress: options.onProgress,
    signal: options.signal
  });
}

export async function uploadMobileAvatarFile(options: {
  uri: string;
  name: string;
  type?: string;
  size?: number;
}) {
  const session = requireActiveSession();
  return uploadMobileAvatar({
    baseURL: mobileApiBaseUrl,
    authStore: session.authStore,
    file: options
  });
}

/**
 * Startup gate. If the persisted access token is already expired (or close
 * to it), refresh it before any UI code fires off bootstrap requests, so
 * the very first network burst doesn't fan out with a stale `Bearer`
 * header and trigger a 401 storm on the server.
 */
export async function ensureMobileFreshAccessToken() {
  const session = requireActiveSession();
  return ensureFreshAccessToken({
    baseURL: mobileApiBaseUrl,
    authStore: session.authStore
  });
}

export async function registerCurrentMobileDevice() {
  await ensureMobileDeviceInfoReady();
  return mobileServerApi.registerCurrentDevice({
    device: buildDeviceRegistrationPayload(mobileDeviceInfo)
  });
}
