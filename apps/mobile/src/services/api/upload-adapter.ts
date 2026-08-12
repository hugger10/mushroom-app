import type { ChunkedUploaderAdapter, PutChunkResult } from "@mushroom/shared";
import { Platform } from "react-native";
import * as RNFS from "react-native-fs";
import type { MobileAttachmentAsset } from "./types";

export function getUploadUriCandidates(uri: string) {
  if (!uri) {
    return [];
  }

  const candidates = new Set<string>();
  candidates.add(uri);

  if (!/^[a-z]+:\/\//i.test(uri)) {
    candidates.add(`file://${uri}`);
  }

  if (/^file:\/\//i.test(uri)) {
    candidates.add(uri.replace(/^file:\/\//i, ""));
  }

  return Array.from(candidates).filter(Boolean);
}

export function shouldUseAndroidNativeUpload(file: MobileAttachmentAsset) {
  if (Platform.OS !== "android") {
    return false;
  }

  if (!file.uri || /^https?:\/\//i.test(file.uri)) {
    return false;
  }

  return true;
}

/** 将文件 URI 规范化为 RNFS 可读取的本地路径（去掉 `file://` 前缀）。 */
export function normalizeLocalPath(uri: string): string {
  if (!uri) return uri;
  if (/^file:\/\//i.test(uri)) {
    return uri.replace(/^file:\/\//i, "");
  }
  return uri;
}

/** base64 → Uint8Array；依赖 RN 0.65+ 默认提供的 `global.atob`。 */
export function base64ToUint8Array(b64: string): Uint8Array {
  const decoder = (globalThis as { atob?: (input: string) => string }).atob;
  if (typeof decoder !== "function") {
    throw new Error("base64 decoder not available in this runtime");
  }
  const binary = decoder(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * RN 平台的分片上传适配器：通过 `RNFS.read(path, length, offset, 'base64')`
 * 读取指定字节范围并 PUT 到 MinIO presigned URL。fetch 的响应 header
 * 中需要包含 `ETag`（由服务端 CORS 暴露）。
 */
export function createRNAdapter(
  file: MobileAttachmentAsset
): ChunkedUploaderAdapter {
  const localPath = normalizeLocalPath(file.uri);
  return {
    async putChunk({ url, offset, length, contentType, signal, onProgress }) {
      if (signal.aborted) {
        throw new Error("aborted");
      }
      const b64 = await RNFS.read(localPath, length, offset, "base64");
      const body = base64ToUint8Array(b64);
      onProgress?.(0);
      const response = await fetch(url, {
        method: "PUT",
        headers: contentType ? { "Content-Type": contentType } : undefined,
        body: body as unknown as BodyInit_,
        signal
      });
      // fetch 没有真实进度事件，退化为完成时一次性回报。
      onProgress?.(length);
      const etag =
        response.headers.get("etag") ?? response.headers.get("ETag") ?? "";
      const result: PutChunkResult = {
        status: response.status,
        etag
      };
      return result;
    }
  };
}
