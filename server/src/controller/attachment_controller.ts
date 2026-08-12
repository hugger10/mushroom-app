import type { Request, Response } from "express";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  detectAttachmentCategory,
  type AttachmentCategory
} from "@mushroom/shared";

import { BusinessError } from "../handler/business_error";
import { wrapAsync } from "../handler/response_wrapper";
import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { generateId } from "../utils/id_generator";
import pg from "../db/pg";
import AttachmentRepository from "../repository/attachment_repository";
import { resolveAttachmentUrls } from "../service/attachment_url_resolver";
import { enqueueThumbnail } from "../service/thumbnail_worker";
import {
  bucketNameAttachments,
  isMinioNotFound
} from "../storage/minio_client";
import { MinioService } from "../storage/minio_service";

/**
 * 附件上传 HTTP 控制器：initiate / part-url / complete / abort / refresh-urls。
 * attachments bucket 是私有的，仅通过 presigned URL 访问；初始化在构造时一次性触发。
 */
export class AttachmentController {
  private readonly minioService: MinioService;

  constructor() {
    this.minioService = new MinioService();
    // Attachments bucket is intentionally private; clients use presigned URLs.
    void this.minioService.initBucketName(bucketNameAttachments);
  }

  initiateAttachmentUpload = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const userId = Number(req.JwtPayload!.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new BusinessError("User is not authenticated");
    }

    const body = (req.body ?? {}) as {
      filename?: string;
      size?: number;
      mime_type?: string;
      category?: AttachmentCategory;
      prefer_multipart?: boolean;
      width?: number;
      height?: number;
      duration_ms?: number;
      chunk_size?: number;
    };

    const filename = String(body.filename ?? "").trim();
    if (!filename) {
      throw new BusinessError("filename is required");
    }
    const size = Number(body.size);
    if (!Number.isFinite(size) || size <= 0) {
      throw new BusinessError("size must be a positive integer");
    }

    // Server-side authoritative category + size enforcement.
    const category: AttachmentCategory =
      body.category ??
      detectAttachmentCategory({
        mimeType: body.mime_type ?? null,
        name: filename,
        isVoice: false
      });
    const maxBytes = config.limits.attachment[category];
    if (size > maxBytes) {
      const mb = Math.max(1, Math.round(maxBytes / 1024 / 1024));
      throw new BusinessError(`附件大小超过限制（${category}）：最大 ${mb}MB`);
    }

    const ext = path.extname(filename) || "";
    const objectName = `${userId}/${uuidv4()}${ext}`;
    const expires = config.limits.upload.presignedExpiresSeconds;
    const threshold = config.limits.upload.multipartThreshold;
    const useMultipart = body.prefer_multipart === true || size >= threshold;

    const uploadId = generateId();
    let mode: "single" | "multipart" = "single";
    let putUrl: string | undefined;
    let multipartUploadId: string | undefined;

    if (useMultipart) {
      mode = "multipart";
      multipartUploadId = await this.minioService.createMultipart(
        objectName,
        body.mime_type ?? null
      );
    } else {
      putUrl = await this.minioService.presignedPutForObject(
        objectName,
        expires
      );
    }

    await AttachmentRepository.createUpload(pg, {
      id: uploadId,
      uploader_id: userId,
      object_name: objectName,
      original_name: filename,
      size,
      mime_type: body.mime_type ?? null,
      file_url: null,
      category,
      upload_mode: mode,
      multipart_upload_id: multipartUploadId ?? null,
      width: body.width ?? null,
      height: body.height ?? null,
      duration_ms: body.duration_ms ?? null,
      thumb_status: category === "image" ? "pending" : "none"
    });

    return {
      upload_id: uploadId,
      object_name: objectName,
      mode,
      put_url: putUrl,
      multipart_upload_id: multipartUploadId,
      chunk_size: config.limits.upload.chunkSize,
      expires_in: expires
    };
  });

  attachmentPartUrl = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const userId = Number(req.JwtPayload!.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new BusinessError("User is not authenticated");
    }
    const { upload_id, part_number } = (req.body ?? {}) as {
      upload_id?: string;
      part_number?: number;
    };
    if (!upload_id || !Number.isFinite(Number(part_number))) {
      throw new BusinessError("upload_id and part_number are required");
    }
    const pn = Number(part_number);
    if (pn < 1 || pn > 10000) {
      throw new BusinessError("part_number out of range");
    }

    const record = await AttachmentRepository.findById(upload_id);
    if (!record || Number(record.uploader_id) !== userId) {
      throw new BusinessError("Upload not found");
    }
    if (record.upload_mode !== "multipart" || !record.multipart_upload_id) {
      throw new BusinessError("Upload is not a multipart upload");
    }
    if (record.status !== 0) {
      throw new BusinessError("Upload is not in pending state");
    }

    const expires = config.limits.upload.presignedExpiresSeconds;
    const url = await this.minioService.presignedPartUrl(
      record.object_name,
      record.multipart_upload_id,
      pn,
      expires
    );

    return {
      upload_id,
      part_number: pn,
      put_url: url,
      expires_in: expires
    };
  });

  completeAttachmentUpload = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const userId = Number(req.JwtPayload!.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new BusinessError("User is not authenticated");
    }
    const { upload_id, parts } = (req.body ?? {}) as {
      upload_id?: string;
      parts?: Array<{ part_number: number; etag: string }>;
    };
    if (!upload_id) {
      throw new BusinessError("upload_id is required");
    }

    // 1) 预检（无锁）。所有 MinIO 网络调用都不能持 DB 行锁，避免拖垮连接池。
    const record = await AttachmentRepository.findById(upload_id);
    if (!record || Number(record.uploader_id) !== userId) {
      throw new BusinessError("Upload not found");
    }
    if (record.status !== 0) {
      throw new BusinessError("Upload is not in pending state");
    }
    if (record.upload_mode === "multipart") {
      if (!record.multipart_upload_id) {
        throw new BusinessError("Multipart upload id missing");
      }
      if (!Array.isArray(parts) || parts.length === 0) {
        throw new BusinessError("parts are required for multipart upload");
      }
    }

    // 2) MinIO 网络 IO（无事务）。
    if (record.upload_mode === "multipart") {
      await this.minioService.completeMultipart(
        record.object_name,
        record.multipart_upload_id!,
        parts!
      );
    }

    const stat = await this.minioService.statAttachment(record.object_name);
    const realSize = Number(stat.size);
    const maxBytes = config.limits.attachment[record.category];
    if (realSize > maxBytes) {
      // 对象超限——best-effort 清理，再抛错。
      await this.minioService
        .deleteFile(bucketNameAttachments, record.object_name)
        .catch(() => undefined);
      throw new BusinessError("Uploaded object exceeds size limit");
    }

    const url = await this.minioService.getFileUrl(
      bucketNameAttachments,
      record.object_name
    );

    // 3) 短事务：持锁二次校验 + 落库。
    // 若并发 abort 把 status 改成 2（或其它非 0 状态），事务返回 stateChanged=true，
    // 由事务外主动删除已上传的 MinIO 对象，避免永久孤儿（DB 行已 status=2，
    // 不会被 orphan cleanup 扫到）。
    const txResult = await pg.tx(async t => {
      const locked = await AttachmentRepository.findByIdForUpdate(t, upload_id);
      if (!locked || Number(locked.uploader_id) !== userId) {
        throw new BusinessError("Upload not found");
      }
      if (locked.status !== 0) {
        return {
          stateChanged: true as const,
          objectName: locked.object_name,
          status: locked.status
        };
      }

      const updated = await AttachmentRepository.markUploaded(t, {
        id: locked.id,
        uploader_id: userId,
        file_url: url,
        size: realSize,
        thumb_status: locked.category === "image" ? "pending" : "none"
      });
      if (!updated) {
        throw new BusinessError("Failed to mark upload as completed");
      }

      return {
        stateChanged: false as const,
        upload_id: locked.id,
        url,
        object_name: locked.object_name,
        size: realSize,
        mime_type: locked.mime_type ?? undefined,
        width: locked.width ?? undefined,
        height: locked.height ?? undefined,
        duration_ms: locked.duration_ms ?? undefined,
        thumb_status: updated.thumb_status,
        category: locked.category
      };
    });

    if (txResult.stateChanged) {
      logger.warn(
        { uploadId: upload_id, status: txResult.status },
        "complete: state changed concurrently, reclaiming MinIO object"
      );
      await this.minioService
        .deleteFile(bucketNameAttachments, txResult.objectName)
        .catch(err => {
          if (isMinioNotFound(err)) return;
          logger.warn(
            { err, uploadId: upload_id, objectName: txResult.objectName },
            "complete: reclaim MinIO object failed (object may be leaked)"
          );
        });
      throw new BusinessError("Upload state changed");
    }

    const result = txResult;

    // Enqueue thumbnail generation for images (outside the tx).
    if (result.category === "image") {
      enqueueThumbnail({
        uploadId: result.upload_id,
        objectName: result.object_name,
        uploaderId: userId
      });
    }

    return {
      upload_id: result.upload_id,
      url: result.url,
      object_name: result.object_name,
      size: result.size,
      mime_type: result.mime_type,
      width: result.width,
      height: result.height,
      duration_ms: result.duration_ms,
      thumb_status: result.thumb_status
    };
  });

  abortAttachmentUpload = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const userId = Number(req.JwtPayload!.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new BusinessError("User is not authenticated");
    }
    const { upload_id } = (req.body ?? {}) as { upload_id?: string };
    if (!upload_id) {
      throw new BusinessError("upload_id is required");
    }

    // 1) 预检（无锁）。
    const record = await AttachmentRepository.findById(upload_id);
    if (
      !record ||
      Number(record.uploader_id) !== userId ||
      record.status !== 0
    ) {
      return { upload_id, aborted: false };
    }

    // 2) MinIO 网络 IO（无事务）。失败按现有策略容忍。
    if (record.upload_mode === "multipart" && record.multipart_upload_id) {
      await this.minioService
        .abortMultipart(record.object_name, record.multipart_upload_id)
        .catch(err =>
          logger.warn(
            { err, uploadId: upload_id },
            "abortMultipart failed (ignored)"
          )
        );
    } else if (record.upload_mode === "single") {
      // R3: single 模式 abort 无条件清理对象，捕获 NotFound（complete 前 PUT 可能未完成）。
      await this.minioService
        .deleteFile(bucketNameAttachments, record.object_name)
        .catch(err => {
          if (isMinioNotFound(err)) return;
          logger.warn(
            { err, uploadId: upload_id },
            "abort: removeObject failed (ignored)"
          );
        });
    }

    // 3) 短事务：持锁二次校验 + 幂等 markDeleted。
    let aborted = false;
    await pg.tx(async t => {
      const locked = await AttachmentRepository.findByIdForUpdate(t, upload_id);
      if (
        !locked ||
        Number(locked.uploader_id) !== userId ||
        locked.status !== 0
      ) {
        return;
      }
      await AttachmentRepository.markDeleted(t, locked.id);
      aborted = true;
    });

    return { upload_id, aborted };
  });

  refreshAttachmentUrls = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const userId = Number(req.JwtPayload!.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new BusinessError("User is not authenticated");
    }
    const body = (req.body ?? {}) as { upload_ids?: unknown };
    const ids = Array.isArray(body.upload_ids)
      ? body.upload_ids
          .map(id => (typeof id === "string" ? id.trim() : ""))
          .filter(id => id.length > 0)
          .slice(0, 100)
      : [];
    if (ids.length === 0) {
      return { items: {} as Record<string, unknown> };
    }
    const map = await resolveAttachmentUrls(ids);
    const items: Record<string, unknown> = {};
    for (const [uploadId, info] of map.entries()) {
      items[uploadId] = {
        upload_id: uploadId,
        url: info.url,
        thumb_url: info.thumb_url,
        preview_url: info.preview_url,
        thumb_status: info.thumb_status
      };
    }
    return { items };
  });
}
