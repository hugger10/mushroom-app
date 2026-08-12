import webServerApi from "./index";
import i18next from "i18next";
import {
  ApiError,
  bytesToMB,
  ChunkedUploader,
  detectAttachmentCategory,
  DEFAULT_LIMITS_CONFIG,
  type AttachmentCategory,
  type CallRoomConfigResponse,
  type CallIceConfigResponse,
  type ChunkedUploaderAdapter,
  type LimitsConfig,
  type PutChunkResult,
  type UploadResult
} from "@mushroom/shared";
import { getToken } from "../utils/token";
import { i18n } from "../i18n";

export const {
  addConversationMembers,
  changePassword,
  disableDevice,
  getBlocks,
  getContacts,
  getNotificationSettings,
  getPrivacySettings,
  deleteConversation,
  disbandConversation,
  login,
  logoutAllDevices,
  logoutCurrent,
  logoutDevice,
  refreshTokens,
  register,
  markConversationRead,
  getConversationReadState,
  presenceSummary,
  profile,
  session,
  updateProfile,
  updateNotificationSettings,
  updatePrivacySettings,
  searchUsers: searchUser,
  createConversation,
  createDirectConversation,
  getDevices,
  getUsersPresence,
  getUserProfile,
  leaveConversation,
  removeConversationMember,
  restoreDevice,
  syncConversations,
  recallMessage,
  syncMessageStates,
  syncMessageDelta,
  syncMessages,
  listMessages,
  listMessageReactions,
  listReactionDeltas,
  transferConversationOwner,
  updateMessageState,
  updateConversationAnnouncement,
  updateConversationMemberMute,
  updateConversationState,
  updateConversationSettings,
  updateConversationProfile,
  updateConversationMemberRole
} = webServerApi;

export async function blockUser(targetUserId: number) {
  return webServerApi.blockUser({ target_user_id: targetUserId });
}

export async function unblockUser(targetUserId: number) {
  return webServerApi.unblockUser({ target_user_id: targetUserId });
}

export async function saveContact(contactUserId: number) {
  return webServerApi.saveContact({ contact_user_id: contactUserId });
}

export async function updateContact(
  contactUserId: number,
  patch: { remark_name?: string; remark_note?: string }
) {
  return webServerApi.updateContact(contactUserId, patch);
}

export async function deleteContact(contactUserId: number) {
  return webServerApi.deleteContactById(contactUserId);
}

export async function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("avatar", file);

  const token = await getToken();
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL || "/api"}/file/avatar`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData
    }
  );

  const result = (await response.json()) as {
    code: number;
    message?: string | null;
    data?: {
      original?: string;
      large?: string;
      medium?: string;
      small?: string;
      originalname?: string;
    } | null;
  };

  if (!response.ok || result.code !== 0 || !result.data) {
    throw new ApiError(result.message ?? i18n.t("api.avatarUploadFailed"), {
      status: response.status,
      code: result.code,
      result: result as never
    });
  }

  return result.data;
}

export async function fetchCallIceConfig() {
  const token = await getToken();
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL || "/api"}/auth/call/ice`,
    {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    }
  );

  const result = (await response.json()) as {
    code: number;
    message?: string | null;
    data?: CallIceConfigResponse | null;
  };

  if (!response.ok || result.code !== 0 || !result.data) {
    throw new ApiError(result.message ?? i18n.t("api.getCallIceConfigFailed"), {
      status: response.status,
      code: result.code,
      result: result as never
    });
  }

  return result.data;
}

export async function fetchCallRoomConfig(callId: string) {
  const token = await getToken();
  const query = new URLSearchParams({ callId });
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL || "/api"}/auth/call/room?${query.toString()}`,
    {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    }
  );

  const result = (await response.json()) as {
    code: number;
    message?: string | null;
    data?: CallRoomConfigResponse | null;
  };

  if (!response.ok || result.code !== 0 || !result.data) {
    throw new ApiError(
      result.message ?? i18n.t("api.getGroupRoomConfigFailed"),
      {
        status: response.status,
        code: result.code,
        result: result as never
      }
    );
  }

  return result.data;
}

// ----- Limits config (fetched once, cached) -----

let limitsCache: LimitsConfig | null = null;
let limitsPromise: Promise<LimitsConfig> | null = null;

export async function ensureLimits(): Promise<LimitsConfig> {
  if (limitsCache) return limitsCache;
  if (!limitsPromise) {
    limitsPromise = (async () => {
      try {
        const res = await webServerApi.getLimits();
        if (res?.code === 0 && res.data) {
          limitsCache = res.data as LimitsConfig;
          return limitsCache;
        }
      } catch {
        /* fall back to defaults */
      }
      limitsCache = DEFAULT_LIMITS_CONFIG;
      return limitsCache;
    })();
  }
  return limitsPromise;
}

export function getLimitsSync(): LimitsConfig {
  return limitsCache ?? DEFAULT_LIMITS_CONFIG;
}

// ----- Chunked upload (web adapter) -----

function createWebAdapter(file: File): ChunkedUploaderAdapter {
  return {
    putChunk({ url, offset, length, contentType, signal, onProgress }) {
      return new Promise<PutChunkResult>((resolve, reject) => {
        const blob = file.slice(offset, offset + length);
        const xhr = new XMLHttpRequest();
        const onAbort = () => xhr.abort();
        xhr.open("PUT", url, true);
        if (contentType) {
          xhr.setRequestHeader("Content-Type", contentType);
        }
        xhr.upload.onprogress = ev => {
          if (ev.lengthComputable && onProgress) {
            onProgress(ev.loaded);
          }
        };
        xhr.onerror = () => {
          signal?.removeEventListener("abort", onAbort);
          reject(new Error("network error during chunk PUT"));
        };
        xhr.onabort = () => {
          signal?.removeEventListener("abort", onAbort);
          reject(new Error("chunk PUT aborted"));
        };
        xhr.onload = () => {
          signal?.removeEventListener("abort", onAbort);
          const etag = xhr.getResponseHeader("ETag") ?? "";
          resolve({ status: xhr.status, etag });
        };
        if (signal) {
          if (signal.aborted) {
            xhr.abort();
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }
        xhr.send(blob);
      });
    }
  };
}

export async function uploadAttachment(
  file: File,
  onProgress?: (percent: number) => void,
  options?: {
    category?: AttachmentCategory;
    width?: number;
    height?: number;
    durationMs?: number;
    signal?: AbortSignal;
  }
): Promise<UploadResult & { originalname: string }> {
  const limits = await ensureLimits();
  const category: AttachmentCategory =
    options?.category ??
    detectAttachmentCategory({ mimeType: file.type, name: file.name });
  const maxBytes = limits.attachments[category];
  if (file.size > maxBytes) {
    throw new ApiError(
      i18next.t("chat.attachmentSizeExceeded", {
        label: i18next.t(`chat.attachmentCategory.${category}`),
        size: bytesToMB(maxBytes)
      })
    );
  }

  const uploader = new ChunkedUploader({
    api: webServerApi,
    adapter: createWebAdapter(file),
    concurrency: limits.upload.concurrency,
    maxRetries: limits.upload.maxRetries,
    multipartThreshold: limits.upload.multipartThreshold
  });

  const result = await uploader.upload({
    source: {
      filename: file.name,
      size: file.size,
      mimeType: file.type || undefined,
      category,
      width: options?.width,
      height: options?.height,
      durationMs: options?.durationMs
    },
    signal: options?.signal,
    onProgress: progress => onProgress?.(Math.round(progress.percent * 100))
  });

  // Ensure final 100%
  onProgress?.(100);
  return { ...result, originalname: file.name };
}

// Token is consumed by webServerApi transport.

export type {
  AddConversationMembersRequest,
  ApiResult as BaseResult,
  ConversationMemberMutationResponse,
  CreateConversationRequest,
  CreateConversationResponse,
  DeleteConversationRequest,
  DisbandConversationRequest,
  LeaveConversationRequest,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  MarkConversationReadRequest,
  MarkConversationReadResponse,
  MessageSyncCursor,
  RecallMessageRequest,
  RecallMessageResponse,
  RemoveConversationMemberRequest,
  RemoteConversation,
  RemoteConversationMember,
  RemoteMessage,
  SearchUsersParams,
  TransferConversationOwnerRequest,
  UpdateConversationAnnouncementRequest,
  UpdateConversationMemberMuteRequest,
  UpdateConversationSettingsRequest,
  UpdateConversationStateRequest,
  UpdateConversationProfileRequest,
  UpdateConversationMemberRoleRequest,
  UserProfile,
  UserSearchResult
} from "@mushroom/shared";
