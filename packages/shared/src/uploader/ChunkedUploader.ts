/**
 * 平台无关的分片上传协调器。
 *
 * 设计要点：
 * - 不直接依赖 `fetch` / `XMLHttpRequest` / `react-native-fs`。所有平台细节通过
 *   `ChunkedUploaderAdapter` 注入：
 *   - `getFileSize()` 返回文件总字节数。
 *   - `readChunk(offset, length)` 读取指定范围数据，返回 `Blob | ArrayBuffer | Uint8Array | string(URI)`。
 *   - `putChunk(url, body, opts)` 执行实际 PUT 请求，返回 ETag。
 * - 协议层与 `@mushroom/shared` 的 `MushroomApi` 对齐：
 *   1. `initiateAttachmentUpload`
 *   2. 若为 multipart，循环 `getAttachmentPartUrl` + adapter.putChunk
 *   3. `completeAttachmentUpload`
 *   4. 出错则 `abortAttachmentUpload`
 * - 重试：每个分片最多 `maxRetries` 次，指数退避（200ms * 2^n + jitter）。
 */

import type {
  AbortAttachmentUploadRequest,
  AbortAttachmentUploadResponse,
  ApiResult,
  AttachmentPartETag,
  AttachmentPartUrlRequest,
  AttachmentPartUrlResponse,
  CompleteAttachmentUploadRequest,
  CompleteAttachmentUploadResponse,
  InitiateAttachmentUploadRequest,
  InitiateAttachmentUploadResponse
} from "../types/api";

/** 适配层需要提供的最小 API 子集，便于在测试中 mock。 */
export interface ChunkedUploaderApi {
  initiateAttachmentUpload(
    body: InitiateAttachmentUploadRequest
  ): Promise<ApiResult<InitiateAttachmentUploadResponse>>;
  getAttachmentPartUrl(
    body: AttachmentPartUrlRequest
  ): Promise<ApiResult<AttachmentPartUrlResponse>>;
  completeAttachmentUpload(
    body: CompleteAttachmentUploadRequest
  ): Promise<ApiResult<CompleteAttachmentUploadResponse>>;
  abortAttachmentUpload(
    body: AbortAttachmentUploadRequest
  ): Promise<ApiResult<AbortAttachmentUploadResponse>>;
}

/** 平台无关的“文件句柄”引用：web 用 File/Blob；RN 用 { uri, size, type }。 */
export interface ChunkedUploadSource {
  /** 文件名，用于服务端记录。 */
  filename: string;
  /** 总字节数。 */
  size: number;
  /** MIME 类型，可选。 */
  mimeType?: string;
  /** 业务类别，与服务端限额对应。 */
  category?: InitiateAttachmentUploadRequest["category"];
  /** 媒体元数据（图片/视频/音频）。 */
  width?: number;
  height?: number;
  durationMs?: number;
}

/** PUT 请求适配器返回的结果。 */
export interface PutChunkResult {
  /** S3/MinIO 返回的 ETag（含双引号，complete 时需原样回传或剥引号皆可）。 */
  etag: string;
  status: number;
}

export interface ChunkedUploaderAdapter {
  /**
   * 读取并 PUT 一段数据到给定 URL。实现需自行处理 abort / 进度回调。
   * 返回 ETag（必须）。
   *
   * @param params.url presigned URL
   * @param params.offset 在源文件中的字节起点
   * @param params.length 本次需要读取的字节数
   * @param params.partNumber 分片序号（1 基），便于日志
   * @param params.signal 中止信号
   * @param params.onProgress 已上传字节数（相对本分片）回调
   */
  putChunk(params: {
    url: string;
    offset: number;
    length: number;
    partNumber: number;
    contentType?: string;
    signal: AbortSignal;
    onProgress?: (bytesUploaded: number) => void;
  }): Promise<PutChunkResult>;
}

export interface ChunkedUploaderOptions {
  api: ChunkedUploaderApi;
  adapter: ChunkedUploaderAdapter;
  /** 分片并发数，默认 3。 */
  concurrency?: number;
  /** 每个分片最大重试次数，默认 3。 */
  maxRetries?: number;
  /** 初次退避毫秒数，默认 200。 */
  retryBaseMs?: number;
  /** 文件多大以上强制走 multipart（仅作为请求时的 hint，最终由服务端决定）。 */
  multipartThreshold?: number;
}

export interface UploadProgress {
  uploadId: string;
  bytesUploaded: number;
  totalBytes: number;
  /** 0~1。 */
  percent: number;
}

export interface UploadResult {
  uploadId: string;
  url: string;
  objectName: string;
  size: number;
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  thumbStatus?: "pending" | "ready" | "failed" | "none";
}

export interface UploadStartParams {
  source: ChunkedUploadSource;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}

export class ChunkedUploadError extends Error {
  uploadId?: string;
  cause?: unknown;
  code: string;

  constructor(
    message: string,
    options: { uploadId?: string; code?: string; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "ChunkedUploadError";
    this.uploadId = options.uploadId;
    this.code = options.code ?? "UPLOAD_FAILED";
    this.cause = options.cause;
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new ChunkedUploadError("aborted", { code: "ABORTED" }));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    if (signal?.aborted) {
      cleanup();
      reject(new ChunkedUploadError("aborted", { code: "ABORTED" }));
      return;
    }
    signal?.addEventListener("abort", onAbort);
  });
}

function unwrap<T>(result: ApiResult<T>, message: string): T {
  if (!result || (result as { code?: number }).code !== 0) {
    const msg = (result as { message?: string } | null)?.message || message;
    throw new ChunkedUploadError(msg, { code: "API_ERROR" });
  }
  return (result as { data: T }).data;
}

export class ChunkedUploader {
  private readonly api: ChunkedUploaderApi;
  private readonly adapter: ChunkedUploaderAdapter;
  private readonly concurrency: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly multipartThreshold: number;

  constructor(options: ChunkedUploaderOptions) {
    this.api = options.api;
    this.adapter = options.adapter;
    this.concurrency = Math.max(1, options.concurrency ?? 3);
    this.maxRetries = Math.max(0, options.maxRetries ?? 3);
    this.retryBaseMs = options.retryBaseMs ?? 200;
    this.multipartThreshold = options.multipartThreshold ?? 5 * 1024 * 1024;
  }

  async upload(params: UploadStartParams): Promise<UploadResult> {
    const { source, signal, onProgress } = params;

    const initRes = unwrap(
      await this.api.initiateAttachmentUpload({
        filename: source.filename,
        size: source.size,
        mime_type: source.mimeType,
        category: source.category,
        prefer_multipart: source.size >= this.multipartThreshold,
        width: source.width,
        height: source.height,
        duration_ms: source.durationMs
      }),
      "initiate upload failed"
    );

    const uploadId = initRes.upload_id;
    const totalBytes = source.size;
    let bytesDone = 0;

    const reportProgress = () => {
      if (!onProgress) return;
      onProgress({
        uploadId,
        bytesUploaded: bytesDone,
        totalBytes,
        percent: totalBytes > 0 ? Math.min(1, bytesDone / totalBytes) : 1
      });
    };

    try {
      if (initRes.mode === "single") {
        if (!initRes.put_url) {
          throw new ChunkedUploadError("missing put_url for single mode", {
            uploadId,
            code: "PROTOCOL_ERROR"
          });
        }
        await this.uploadOne({
          url: initRes.put_url,
          offset: 0,
          length: totalBytes,
          partNumber: 1,
          contentType: source.mimeType,
          signal,
          onChunkProgress: delta => {
            bytesDone += delta;
            reportProgress();
          }
        });
        const completed = unwrap(
          await this.api.completeAttachmentUpload({ upload_id: uploadId }),
          "complete upload failed"
        );
        return this.toResult(completed);
      }

      // multipart
      const chunkSize = initRes.chunk_size;
      const totalParts = Math.max(1, Math.ceil(totalBytes / chunkSize));
      const parts: AttachmentPartETag[] = [];
      const partProgress = new Array<number>(totalParts).fill(0);

      const tasks: Array<{
        partNumber: number;
        offset: number;
        length: number;
      }> = [];
      for (let i = 0; i < totalParts; i++) {
        const offset = i * chunkSize;
        const length = Math.min(chunkSize, totalBytes - offset);
        tasks.push({ partNumber: i + 1, offset, length });
      }

      let cursor = 0;
      const runWorker = async () => {
        while (true) {
          if (signal?.aborted) {
            throw new ChunkedUploadError("aborted", {
              uploadId,
              code: "ABORTED"
            });
          }
          const idx = cursor++;
          if (idx >= tasks.length) return;
          const task = tasks[idx];
          const partUrl = unwrap(
            await this.api.getAttachmentPartUrl({
              upload_id: uploadId,
              part_number: task.partNumber
            }),
            `get part url failed (part ${task.partNumber})`
          );
          const result = await this.uploadOne({
            url: partUrl.put_url,
            offset: task.offset,
            length: task.length,
            partNumber: task.partNumber,
            contentType: source.mimeType,
            signal,
            onChunkProgress: delta => {
              partProgress[task.partNumber - 1] += delta;
              bytesDone = partProgress.reduce((a, b) => a + b, 0);
              reportProgress();
            }
          });
          parts.push({ part_number: task.partNumber, etag: result.etag });
        }
      };

      const workerCount = Math.min(this.concurrency, tasks.length);
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

      parts.sort((a, b) => a.part_number - b.part_number);
      const completed = unwrap(
        await this.api.completeAttachmentUpload({
          upload_id: uploadId,
          parts
        }),
        "complete multipart upload failed"
      );
      bytesDone = totalBytes;
      reportProgress();
      return this.toResult(completed);
    } catch (error) {
      // best-effort abort; swallow errors
      try {
        await this.api.abortAttachmentUpload({ upload_id: uploadId });
      } catch {
        /* ignore */
      }
      if (error instanceof ChunkedUploadError) throw error;
      throw new ChunkedUploadError(
        (error as Error)?.message ?? "upload failed",
        { uploadId, cause: error }
      );
    }
  }

  private toResult(res: CompleteAttachmentUploadResponse): UploadResult {
    return {
      uploadId: res.upload_id,
      url: res.url,
      objectName: res.object_name,
      size: res.size,
      mimeType: res.mime_type,
      width: res.width,
      height: res.height,
      durationMs: res.duration_ms,
      thumbStatus: res.thumb_status
    };
  }

  private async uploadOne(args: {
    url: string;
    offset: number;
    length: number;
    partNumber: number;
    contentType?: string;
    signal?: AbortSignal;
    onChunkProgress?: (deltaBytes: number) => void;
  }): Promise<PutChunkResult> {
    const ac = args.signal;
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      if (ac?.aborted) {
        throw new ChunkedUploadError("aborted", { code: "ABORTED" });
      }
      let cumulative = 0;
      try {
        const res = await this.adapter.putChunk({
          url: args.url,
          offset: args.offset,
          length: args.length,
          partNumber: args.partNumber,
          contentType: args.contentType,
          signal: ac ?? new AbortController().signal,
          onProgress: uploaded => {
            if (!args.onChunkProgress) return;
            // 适配器（特别是 RN fetch 模式）可能上报超过分片长度的字节数；
            // 这里 clamp 到 [0, args.length] 防止上层 percent 越界。
            const clamped = Math.max(0, Math.min(uploaded, args.length));
            const delta = clamped - cumulative;
            if (delta === 0) return;
            cumulative = clamped;
            args.onChunkProgress(delta);
          }
        });
        if (res.status >= 200 && res.status < 300 && res.etag) {
          // ensure we reported full size in case adapter didn't emit final progress
          if (args.onChunkProgress && cumulative < args.length) {
            args.onChunkProgress(args.length - cumulative);
          }
          return res;
        }
        lastError = new Error(
          `unexpected response status ${res.status} for part ${args.partNumber}`
        );
      } catch (err) {
        lastError = err;
        if (err instanceof ChunkedUploadError && err.code === "ABORTED") {
          throw err;
        }
      }
      // rollback any partial progress reported during failed attempt
      if (args.onChunkProgress && cumulative > 0) {
        args.onChunkProgress(-cumulative);
      }
      attempt += 1;
      if (attempt > this.maxRetries) break;
      const backoff = this.retryBaseMs * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * this.retryBaseMs);
      await delay(backoff + jitter, ac);
    }

    throw new ChunkedUploadError(
      `part ${args.partNumber} failed after ${this.maxRetries + 1} attempts`,
      { code: "PART_FAILED", cause: lastError }
    );
  }
}
