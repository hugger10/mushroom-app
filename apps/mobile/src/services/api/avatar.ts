import type { AuthSessionStore } from "@mushroom/app-core";
import { ApiError } from "@mushroom/shared";
import { NativeModules } from "react-native";
import log from "../../utils/log";
import { normalizeBaseURL } from "./factory";
import type { MobileAttachmentAsset } from "./types";
import {
  getUploadUriCandidates,
  shouldUseAndroidNativeUpload
} from "./upload-adapter";
import { i18n } from "../../i18n";

const avatarUploadLog = log.scope("avatar-upload");

type AndroidNativeUploadModule = {
  uploadFile?: (
    uploadUrl: string,
    fileUri: string,
    fileName: string,
    mimeType: string,
    accessToken?: string | null
  ) => Promise<string>;
  uploadFileWithField?: (
    uploadUrl: string,
    fileUri: string,
    fieldName: string,
    fileName: string,
    mimeType: string,
    accessToken?: string | null
  ) => Promise<string>;
};

type UploadAvatarResponse = {
  original?: string;
  large?: string;
  medium?: string;
  small?: string;
  originalname?: string;
};

type UploadAvatarApiResult = {
  code?: number;
  message?: string | null;
  data?: UploadAvatarResponse | null;
};

export async function uploadMobileAvatar(options: {
  baseURL: string;
  authStore: AuthSessionStore;
  file: MobileAttachmentAsset;
}) {
  const auth = await options.authStore.read();
  const url = `${normalizeBaseURL(options.baseURL)}/file/avatar`;

  // Android: 走原生 multipart 通道，绕开 RN fetch+FormData 读取应用私有目录
  // (file:///data/user/0/...) 时偶发的 "Network request failed"。
  if (shouldUseAndroidNativeUpload(options.file)) {
    const nativeModule = NativeModules.MushroomVoiceRecorder as
      | AndroidNativeUploadModule
      | undefined;
    if (nativeModule?.uploadFileWithField) {
      let rawResult: string;
      try {
        rawResult = await nativeModule.uploadFileWithField(
          url,
          options.file.uri,
          "avatar",
          options.file.name,
          options.file.type || "image/jpeg",
          auth.accessToken ?? null
        );
      } catch (nativeError) {
        avatarUploadLog.warn("native uploader failed", nativeError);
        throw new ApiError(
          nativeError instanceof Error
            ? nativeError.message
            : i18n.t("api.avatarUploadFailed")
        );
      }

      let parsed: UploadAvatarApiResult;
      try {
        parsed = JSON.parse(rawResult) as UploadAvatarApiResult;
      } catch {
        throw new ApiError(i18n.t("api.avatarResponseParseFailed"), {
          result: rawResult as never
        });
      }
      if (parsed.code !== 0 || !parsed.data) {
        throw new ApiError(parsed.message ?? i18n.t("api.avatarUploadFailed"), {
          code: parsed.code,
          result: parsed as never
        });
      }
      return parsed.data;
    }
  }

  // iOS / 老 native 包：fetch + URI 候选 fallback。
  // 注意：只有 transport 层失败（fetch throw 或 response.text 失败）时才尝试
  // 下一个候选 URI；一旦服务器返回了结构化响应（无论 200/4xx/5xx），上传
  // 已经实际发生，重复 POST 只会产生重复文件，所以立刻把错误抛给上层。
  const candidates = getUploadUriCandidates(options.file.uri);
  let lastTransportError: unknown = null;

  for (const candidateUri of candidates) {
    const formData = new FormData();
    formData.append("avatar", {
      uri: candidateUri,
      name: options.file.name,
      type: options.file.type || "image/jpeg"
    } as never);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: auth.accessToken
          ? {
              Authorization: `Bearer ${auth.accessToken}`
            }
          : undefined,
        body: formData
      });
    } catch (networkError) {
      avatarUploadLog.warn(
        "fetch failed for candidate",
        candidateUri,
        networkError
      );
      lastTransportError = networkError;
      continue;
    }

    let rawText = "";
    try {
      rawText = await response.text();
    } catch (readError) {
      lastTransportError = readError;
      continue;
    }

    let result: UploadAvatarApiResult;
    try {
      result = JSON.parse(rawText) as UploadAvatarApiResult;
    } catch {
      throw new ApiError(i18n.t("api.avatarResponseParseFailed"), {
        status: response.status,
        result: rawText as never
      });
    }

    if (!response.ok || result.code !== 0 || !result.data) {
      throw new ApiError(result.message ?? i18n.t("api.avatarUploadFailed"), {
        status: response.status,
        code: result.code,
        result: result as never
      });
    }

    return result.data;
  }

  throw lastTransportError instanceof Error
    ? lastTransportError
    : new Error(i18n.t("api.avatarUploadFailed"));
}
