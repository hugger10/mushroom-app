import fs from "fs";
import path from "path";
import * as Minio from "minio";
import { v4 as uuidv4 } from "uuid";

import { config } from "../utils/config";
import { logger } from "../utils/logger";
import {
  bucketNameAttachments,
  bucketNameAvatars,
  type BucketPolicy
} from "./minio_client";

/**
 * 通用 MinIO 客户端封装：bucket 初始化、单/多分片上传、预签名 URL、删除等。
 * 头像专属处理（多尺寸压缩、按用户聚合）请使用 `AvatarStorageService`。
 */
export class MinioService {
  minioClient: Minio.Client;

  constructor() {
    this.minioClient = new Minio.Client({
      endPoint: config.minio.host,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
      pathStyle: true
    });
  }

  async initBucketName(bucketName: string, policy?: BucketPolicy) {
    try {
      const bucketExists = await this.minioClient.bucketExists(bucketName);
      if (!bucketExists) {
        await this.minioClient.makeBucket(bucketName);
        logger.info(`Bucket ${bucketName} created successfully`);
      }

      if (policy) {
        await this.minioClient.setBucketPolicy(
          bucketName,
          JSON.stringify(policy)
        );
      }
    } catch (error: unknown) {
      logger.error(
        { err: error, bucketName },
        "Initialize MinIO bucket failed"
      );
    }
  }

  async uploadFile(
    bucketName: string,
    originalname: string,
    buffer: Buffer,
    metadata: Record<string, string> = {},
    options?: {
      mimeType?: string;
    }
  ) {
    const objectName = uuidv4() + path.extname(originalname);
    const uploadMetadata = {
      ...metadata,
      "Content-Type": options?.mimeType || "application/octet-stream"
    };
    await this.minioClient.putObject(
      bucketName,
      objectName,
      buffer,
      buffer.length,
      uploadMetadata
    );
    const url = await this.getFileUrl(bucketName, objectName);
    return {
      url,
      object_name: objectName,
      originalname,
      size: buffer.length,
      mime_type: options?.mimeType
    };
  }

  async uploadFileStream(
    bucketName: string,
    originalname: string,
    filePath: string,
    size: number,
    metadata: Record<string, string> = {},
    options?: {
      mimeType?: string;
    }
  ) {
    const objectName = uuidv4() + path.extname(originalname);
    const uploadMetadata = {
      ...metadata,
      "Content-Type": options?.mimeType || "application/octet-stream"
    };
    const stream = fs.createReadStream(filePath);
    await this.minioClient.putObject(
      bucketName,
      objectName,
      stream,
      size,
      uploadMetadata
    );
    const url = await this.getFileUrl(bucketName, objectName);
    return {
      url,
      object_name: objectName,
      originalname,
      size,
      mime_type: options?.mimeType
    };
  }

  async getFileUrl(bucketName: string, objectName: string) {
    // Avatars bucket is public; attachments bucket is private (presigned only).
    if (bucketName === bucketNameAvatars && config.minio.publicUrl) {
      return `${config.minio.publicUrl}/${bucketName}/${objectName}`;
    }

    return this.minioClient.presignedGetObject(
      bucketName,
      objectName,
      bucketName === bucketNameAvatars
        ? 7 * 24 * 60 * 60
        : config.limits.upload.presignedExpiresSeconds
    );
  }

  async presignedPutForObject(objectName: string, expiresSeconds: number) {
    return this.minioClient.presignedPutObject(
      bucketNameAttachments,
      objectName,
      expiresSeconds
    );
  }

  async createMultipart(objectName: string, mimeType?: string | null) {
    const headers: Record<string, string> = {
      "Content-Type": mimeType || "application/octet-stream"
    };
    return this.minioClient.initiateNewMultipartUpload(
      bucketNameAttachments,
      objectName,
      headers
    );
  }

  async presignedPartUrl(
    objectName: string,
    multipartUploadId: string,
    partNumber: number,
    expiresSeconds: number
  ) {
    return this.minioClient.presignedUrl(
      "PUT",
      bucketNameAttachments,
      objectName,
      expiresSeconds,
      { partNumber: String(partNumber), uploadId: multipartUploadId }
    );
  }

  async completeMultipart(
    objectName: string,
    multipartUploadId: string,
    parts: Array<{ part_number: number; etag: string }>
  ) {
    const etags = parts
      .slice()
      .sort((a, b) => a.part_number - b.part_number)
      .map(p => ({ part: p.part_number, etag: p.etag.replace(/^"|"$/g, "") }));
    return this.minioClient.completeMultipartUpload(
      bucketNameAttachments,
      objectName,
      multipartUploadId,
      etags
    );
  }

  async abortMultipart(objectName: string, multipartUploadId: string) {
    await this.minioClient.abortMultipartUpload(
      bucketNameAttachments,
      objectName,
      multipartUploadId
    );
  }

  async statAttachment(objectName: string) {
    return this.minioClient.statObject(bucketNameAttachments, objectName);
  }

  async deleteFile(bucketName: string, objectNames: string | string[]) {
    if (Array.isArray(objectNames)) {
      await this.minioClient.removeObjects(bucketName, objectNames);
      return;
    }

    await this.minioClient.removeObject(bucketName, objectNames);
  }

  extractObjectNameFromUrl(bucketName: string, fileUrl: string) {
    try {
      const parsedUrl = new URL(fileUrl);
      const pathname = decodeURIComponent(parsedUrl.pathname || "");
      const bucketPrefix = `/${bucketName}/`;
      if (!pathname.startsWith(bucketPrefix)) {
        return null;
      }

      const objectName = pathname.slice(bucketPrefix.length);
      return objectName || null;
    } catch {
      return null;
    }
  }

  async deleteAttachmentByUrl(fileUrl: string) {
    const objectName = this.extractObjectNameFromUrl(
      bucketNameAttachments,
      fileUrl
    );

    if (!objectName) {
      return false;
    }

    await this.deleteFile(bucketNameAttachments, objectName);
    return true;
  }
}

/**
 * 共享的 MinioService 单例。outbox worker / 后台清扫等内部组件统一通过此入口
 * 复用同一个 client，避免每次实例化重复初始化与连接开销。Express handler 仍
 * 通过控制器内的实例使用。
 */
let sharedMinioService: MinioService | null = null;
export function getSharedMinioService(): MinioService {
  if (!sharedMinioService) {
    sharedMinioService = new MinioService();
  }
  return sharedMinioService;
}
