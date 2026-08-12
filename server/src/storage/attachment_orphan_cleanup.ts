/**
 * Phase 3：附件孤儿清扫后台任务。
 *
 * 场景：客户端拿到预签名 URL 上传完成后，可能因网络/崩溃未及时发送消息，
 * 导致 `attachment_uploads` 行长期处于 `status=0 && bound_message_id IS NULL`
 * 状态，MinIO 对象同步漏在 bucket 中。
 *
 * 策略：周期性扫描超过 TTL 的孤儿记录，按以下顺序回收：
 *   1) markOrphanDeleted CAS：UPDATE ... WHERE status=0 AND bound_message_id IS NULL。
 *      失败（行已被绑定 / 已被其它工作器处理）→ 直接跳过，不触碰 MinIO；
 *   2) 若 upload_mode='multipart' 且持有 multipart_upload_id → abortMultipart（best-effort warn）；
 *   3) 删主对象 object_name（容忍 NotFound）；
 *   4) 尝试删 thumb_object_key / preview_object_key（best-effort warn）。
 *
 * 副作用：步骤 1 成功而后续 MinIO 调用失败时，DB 行已是 deleted，MinIO 中可能残留对象，
 * 由 bucket lifecycle / 人工巡检兜底；落 error 日志以便监控告警。
 */

import { config } from "../utils/config";
import logger from "../utils/logger";
import pg from "../db/pg";
import {
  bucketNameAttachments,
  getSharedMinioService,
  isMinioNotFound,
  type MinioService
} from "./minio";
import AttachmentRepository from "../repository/attachment_repository";

async function safeDeleteObject(
  minio: MinioService,
  objectName: string,
  context: Record<string, unknown>
): Promise<void> {
  try {
    await minio.deleteFile(bucketNameAttachments, objectName);
  } catch (err) {
    if (isMinioNotFound(err)) {
      return;
    }
    logger.warn(
      { err, objectName, ...context },
      "Attachment orphan cleanup: delete object failed (object may be leaked)"
    );
  }
}

async function processOrphanBatch(batchSize: number, olderThan: Date) {
  const records = await AttachmentRepository.findOrphanUploads(
    olderThan,
    batchSize
  );
  if (records.length === 0) {
    return { scanned: 0, removed: 0 };
  }

  const minio = getSharedMinioService();
  let removed = 0;

  for (const record of records) {
    // 1) CAS：仅当行仍然是 pending_bind 且未绑定消息时才取得清扫所有权。
    //    若并发 bind/complete 抢先把 status 翻成 1/2，跳过该行，绝不触碰 MinIO。
    let owned = false;
    try {
      owned = await AttachmentRepository.markOrphanDeleted(pg, record.id);
    } catch (err) {
      logger.warn(
        { err, uploadId: record.id },
        "Attachment orphan cleanup: markOrphanDeleted failed"
      );
      continue;
    }
    if (!owned) {
      continue;
    }

    // 2) multipart abort（best-effort）。即便失败也继续删主对象，MinIO 会把
    //    残留分片标记为孤儿等待 bucket lifecycle 清理。
    if (record.upload_mode === "multipart" && record.multipart_upload_id) {
      try {
        await minio.abortMultipart(
          record.object_name,
          record.multipart_upload_id
        );
      } catch (err) {
        if (!isMinioNotFound(err)) {
          logger.warn(
            {
              err,
              uploadId: record.id,
              objectName: record.object_name,
              multipartUploadId: record.multipart_upload_id
            },
            "Attachment orphan cleanup: abortMultipart failed (ignored)"
          );
        }
      }
    }

    // 3) 主对象删除（容忍 NotFound）。
    await safeDeleteObject(minio, record.object_name, {
      uploadId: record.id,
      stage: "main"
    });

    // 4) thumb / preview（best-effort）。
    if (record.thumb_object_key) {
      await safeDeleteObject(minio, record.thumb_object_key, {
        uploadId: record.id,
        stage: "thumb"
      });
    }
    if (record.preview_object_key) {
      await safeDeleteObject(minio, record.preview_object_key, {
        uploadId: record.id,
        stage: "preview"
      });
    }

    removed += 1;
  }

  return { scanned: records.length, removed };
}

/**
 * 启动孤儿清扫定时器，返回 stop 函数（由 shutdown 调用）。
 * 失败只 warn 不抛，确保后台任务不会拖垮主进程。
 */
export function startAttachmentOrphanCleanup(): () => void {
  const { ttlHours, intervalMs, batchSize } = config.attachmentOrphanCleanup;

  const tick = async () => {
    try {
      const olderThan = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
      const { scanned, removed } = await processOrphanBatch(
        batchSize,
        olderThan
      );
      if (scanned > 0) {
        logger.info(
          { scanned, removed, ttlHours },
          "Attachment orphan cleanup tick"
        );
      }
    } catch (err) {
      logger.warn({ err }, "Attachment orphan cleanup failed");
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  (timer as { unref?: () => void }).unref?.();
  void tick();
  return () => clearInterval(timer);
}
