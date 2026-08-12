/**
 * 图片缩略图 / 预览图异步生成 worker。
 *
 * - 由 `complete` 端点在事务提交后入队（内存队列，无持久化）。
 * - 并发上限 2，避免大尺寸图片同时解码占用大量内存。
 * - 生成 thumb（256² cover, jpeg q70）与 preview（长边 1280, jpeg q80）。
 * - 写回 attachment_uploads.thumb_object_key / preview_object_key / thumb_status / width / height。
 * - 完成后通过 wsServer.dispatchToUser 推送 `attachment_updated`，让客户端把气泡占位替换为真实链接。
 *
 * 失败时只把 thumb_status 标记为 failed，原图依然可用。
 */

import path from "path";
import sharp from "sharp";
import AttachmentRepository from "../repository/attachment_repository";
import { logger } from "../utils/logger";
import { MinioService } from "../storage/minio";
import { wsServer } from "../websocket";

interface ThumbnailJob {
  uploadId: string;
  objectName: string;
  uploaderId: number;
}

const MAX_CONCURRENCY = 2;
const THUMB_DIMENSION = 256;
const PREVIEW_MAX_DIMENSION = 1280;
const ATTACHMENTS_BUCKET = "attachments";

const queue: ThumbnailJob[] = [];
let running = 0;
let minioService: MinioService | null = null;

function getMinio(): MinioService {
  if (!minioService) {
    minioService = new MinioService();
  }
  return minioService;
}

export function enqueueThumbnail(job: ThumbnailJob): void {
  queue.push(job);
  pump();
}

function pump(): void {
  while (running < MAX_CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!;
    running += 1;
    void processJob(job)
      .catch(err => {
        logger.error(
          { err, uploadId: job.uploadId },
          "thumbnail worker job crashed"
        );
      })
      .finally(() => {
        running -= 1;
        pump();
      });
  }
}

async function processJob(job: ThumbnailJob): Promise<void> {
  const minio = getMinio();
  let buffer: Buffer;

  try {
    buffer = await downloadObject(minio, job.objectName);
  } catch (err) {
    logger.warn(
      { err, uploadId: job.uploadId },
      "thumbnail: failed to download source object"
    );
    await markFailed(job);
    return;
  }

  try {
    const image = sharp(buffer, { failOn: "none" });
    const metadata = await image.metadata();
    const width = metadata.width ?? null;
    const height = metadata.height ?? null;

    const thumbBuffer = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize(THUMB_DIMENSION, THUMB_DIMENSION, {
        fit: "cover",
        position: "center"
      })
      .jpeg({ quality: 70, progressive: true })
      .toBuffer();

    const previewBuffer = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize(PREVIEW_MAX_DIMENSION, PREVIEW_MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true
      })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();

    const baseDir = path.posix.dirname(job.objectName) || ".";
    const baseName = path.posix.basename(
      job.objectName,
      path.posix.extname(job.objectName)
    );
    const thumbObjectKey = `${baseDir}/${baseName}.thumb.jpg`;
    const previewObjectKey = `${baseDir}/${baseName}.preview.jpg`;

    await putObject(minio, thumbObjectKey, thumbBuffer, "image/jpeg");
    await putObject(minio, previewObjectKey, previewBuffer, "image/jpeg");

    await AttachmentRepository.updateThumbnails({
      id: job.uploadId,
      thumb_object_key: thumbObjectKey,
      preview_object_key: previewObjectKey,
      width,
      height,
      thumb_status: "ready"
    });

    const thumbUrl = await minio.getFileUrl(ATTACHMENTS_BUCKET, thumbObjectKey);
    const previewUrl = await minio.getFileUrl(
      ATTACHMENTS_BUCKET,
      previewObjectKey
    );

    await wsServer.dispatchToUser(job.uploaderId, {
      messageClassify: "attachment_updated",
      upload_id: job.uploadId,
      thumb_url: thumbUrl,
      preview_url: previewUrl,
      width: width ?? undefined,
      height: height ?? undefined,
      thumb_status: "ready"
    });
  } catch (err) {
    logger.warn(
      { err, uploadId: job.uploadId },
      "thumbnail: image processing failed"
    );
    await markFailed(job);
  }
}

async function markFailed(job: ThumbnailJob): Promise<void> {
  try {
    await AttachmentRepository.updateThumbnails({
      id: job.uploadId,
      thumb_status: "failed"
    });
    await wsServer.dispatchToUser(job.uploaderId, {
      messageClassify: "attachment_updated",
      upload_id: job.uploadId,
      thumb_status: "failed"
    });
  } catch (err) {
    logger.warn(
      { err, uploadId: job.uploadId },
      "thumbnail: markFailed dispatch failed (ignored)"
    );
  }
}

async function downloadObject(
  minio: MinioService,
  objectName: string
): Promise<Buffer> {
  const stream = await minio.minioClient.getObject(
    ATTACHMENTS_BUCKET,
    objectName
  );
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function putObject(
  minio: MinioService,
  objectName: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  await minio.minioClient.putObject(
    ATTACHMENTS_BUCKET,
    objectName,
    buffer,
    buffer.length,
    {
      "Content-Type": contentType
    }
  );
}

export const _internal = {
  pendingCount: () => queue.length
};

/**
 * 进程启动时调用：扫描 attachment_uploads 中 thumb_status='pending' 的图片记录，
 * 重新入内存队列。覆盖服务进程被 kill 时丢失的 in-flight 任务。
 *
 * @param limit 单次扫描上限（默认 500），避免冷启动时一次性占用过多内存。
 */
export async function recoverPendingThumbnails(limit = 500): Promise<number> {
  try {
    const records = await AttachmentRepository.findPendingThumbnails(limit);
    let enqueued = 0;
    for (const record of records) {
      enqueueThumbnail({
        uploadId: record.id,
        objectName: record.object_name,
        uploaderId: Number(record.uploader_id)
      });
      enqueued += 1;
    }
    if (enqueued > 0) {
      logger.info(
        { enqueued, limit },
        "thumbnail worker: recovered pending jobs on bootstrap"
      );
    }
    return enqueued;
  } catch (err) {
    logger.error(
      { err },
      "thumbnail worker: failed to recover pending jobs on bootstrap"
    );
    return 0;
  }
}
