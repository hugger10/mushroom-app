import path from "path";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

import { BusinessError } from "../handler/business_error";
import { bucketNameAvatars, toErrorMessage } from "./minio_client";
import { MinioService, getSharedMinioService } from "./minio_service";

type UploadedImageInfo = {
  size: string;
  url: string;
  objectName: string;
};

export type AvatarUploadResult = {
  original: string;
  large?: string;
  medium?: string;
  small?: string;
  originalname: string;
};

/**
 * 头像专属存储服务：负责多尺寸压缩、按用户目录聚合上传、列举用户历史头像等。
 * 通用 MinIO 能力通过依赖注入的 `MinioService` 复用，避免重复建立连接。
 */
export class AvatarStorageService {
  private readonly minio: MinioService;

  constructor(minio: MinioService = getSharedMinioService()) {
    this.minio = minio;
  }

  async uploadAvatar(
    buffer: Buffer,
    originalname: string,
    username: string
  ): Promise<AvatarUploadResult> {
    try {
      const processedImages = await this.processImage(buffer);
      const fileExtension = path.extname(originalname).toLowerCase() || ".jpg";
      const fileName = `${username}/${uuidv4()}`;
      const metadata = {
        "upload-time": new Date().toISOString(),
        "uploaded-by": username,
        "original-name": encodeURIComponent(originalname)
      };

      const uploadPromises = Object.entries(processedImages).map(
        async ([size, imageBuffer]): Promise<UploadedImageInfo> => {
          const objectName = `${fileName}_${size}${fileExtension}`;
          await this.minio.minioClient.putObject(
            bucketNameAvatars,
            objectName,
            imageBuffer,
            imageBuffer.length,
            metadata
          );

          return {
            size,
            url: await this.minio.getFileUrl(bucketNameAvatars, objectName),
            objectName
          };
        }
      );

      const results = await Promise.all(uploadPromises);
      const originalObjectName = `${fileName}_original${fileExtension}`;
      await this.minio.minioClient.putObject(
        bucketNameAvatars,
        originalObjectName,
        buffer,
        buffer.length,
        metadata
      );
      const originalUrl = await this.minio.getFileUrl(
        bucketNameAvatars,
        originalObjectName
      );

      return {
        original: originalUrl,
        large: results.find(result => result.size === "large")?.url,
        medium: results.find(result => result.size === "medium")?.url,
        small: results.find(result => result.size === "small")?.url,
        originalname
      };
    } catch (error: unknown) {
      throw new BusinessError(`Upload avatar failed: ${toErrorMessage(error)}`);
    }
  }

  async processImage(buffer: Buffer): Promise<Record<string, Buffer>> {
    const sizes = {
      large: 200,
      medium: 100,
      small: 50
    };

    const processed: Record<string, Buffer> = {};

    for (const [sizeName, dimension] of Object.entries(sizes)) {
      processed[sizeName] = await sharp(buffer)
        .resize(dimension, dimension, {
          fit: "cover",
          position: "center"
        })
        .jpeg({
          quality: 85,
          progressive: true
        })
        .toBuffer();
    }

    return processed;
  }

  async getUserAvatars(username: string) {
    try {
      const objectsList: Array<{
        name: string;
        lastModified?: Date;
        size?: number;
        url: string;
      }> = [];
      const objectsStream = this.minio.minioClient.listObjects(
        bucketNameAvatars,
        `${username}/`,
        true
      );

      for await (const objectInfo of objectsStream) {
        objectsList.push({
          name: objectInfo.name,
          lastModified: objectInfo.lastModified,
          size: objectInfo.size,
          url: await this.minio.getFileUrl(bucketNameAvatars, objectInfo.name)
        });
      }

      return objectsList;
    } catch (error: unknown) {
      throw new BusinessError(
        `Get user avatars failed: ${toErrorMessage(error)}`
      );
    }
  }
}
