import { ChatMessage, type ServerWsMessage } from "@mushroom/shared";
import logger from "../utils/logger";
import { config } from "../utils/config";
import pg from "../db/pg";
import OutboxRepository, {
  type OutboxQueueStats
} from "../repository/outbox_repository";
import type { MessageOutboxRecord } from "../repository/models";
import AttachmentRepository from "../repository/attachment_repository";
import PushNotificationService, {
  type PushNotificationEnvelope
} from "../service/push_notification_service";
import { wsServer } from "../websocket";
import { computeOutboxNextRetryAt, getOutboxHealthLevel } from "./policy";
import { parseJsonValue } from "../utils/json";
import { enrichMessageWithAttachmentUrls } from "../service/attachment_url_resolver";
import { logPayload } from "../utils/payload_logger";
import {
  bucketNameAttachments,
  getSharedMinioService,
  isMinioNotFound
} from "../storage/minio";

type AttachmentDeletePayload = {
  upload_id: string;
  object_name: string;
  thumb_object_key?: string | null;
  preview_object_key?: string | null;
};

type OutboxWorkerStatus = {
  running: boolean;
  processing: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
};

type DeliveryResult = {
  deliveredCount: number;
  deliveryMode: string;
};

type OutboxEventHandler = (job: MessageOutboxRecord) => Promise<DeliveryResult>;

function requireTargetUserId(job: MessageOutboxRecord) {
  if (!job.target_user_id) {
    throw new Error(`Outbox event ${job.id} is missing target_user_id`);
  }

  return job.target_user_id;
}

class OutboxWorker {
  /**
   * 哪些 event_type 属于"实时 WS 投递"事件（接收方在线时通过 socket 推送）。
   * 这些事件在 deliveredCount === 0 时应走"重连窗口"短重试；
   * 其他事件（如 push.notification、attachment.delete 等系统补偿作业）不适用。
   */
  private static readonly REALTIME_DELIVERY_EVENT_TYPES = new Set<string>([
    "chat.message.deliver",
    "conversation.read",
    "conversation.sync",
    "contact.changed",
    "message.recall",
    "message.reaction"
  ]);

  static isRealtimeDeliveryEvent(eventType: string): boolean {
    return OutboxWorker.REALTIME_DELIVERY_EVENT_TYPES.has(eventType);
  }

  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private lastStartedAt: Date | null = null;
  private lastCompletedAt: Date | null = null;
  private lastErrorAt: Date | null = null;
  private lastErrorMessage: string | null = null;
  private lastMonitorLogAt = 0;
  private readonly handlers: Record<string, OutboxEventHandler> = {
    "chat.message.deliver": job => this.deliverChatMessage(job),
    "conversation.read": job => this.deliverWsEvent(job),
    "conversation.sync": job => this.deliverWsEvent(job),
    "contact.changed": job => this.deliverWsEvent(job),
    "message.recall": job => this.deliverWsEvent(job),
    "message.reaction": job => this.deliverWsEvent(job),
    "push.notification": job => this.deliverPushNotification(job),
    // Phase 3：recall 删附件改为 outbox 补偿事件，失败走重试 / 死信。
    "attachment.delete": job => this.deleteAttachmentObject(job)
  };

  start() {
    if (this.timer) {
      return;
    }

    if (!config.outbox.enabled) {
      logger.info("Outbox worker is disabled by configuration");
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, config.outbox.pollIntervalMs);
    void this.tick();
    logger.info(
      {
        pollIntervalMs: config.outbox.pollIntervalMs,
        batchSize: config.outbox.batchSize,
        maxRetryCount: config.outbox.maxRetryCount
      },
      "Outbox worker started"
    );
  }

  async stop() {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
    while (this.processing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    logger.info("Outbox worker stopped");
  }

  async getSnapshot() {
    return {
      ...this.getStatus(),
      queue: await OutboxRepository.getStats()
    };
  }

  getStatus(): OutboxWorkerStatus {
    return {
      running: this.timer !== null,
      processing: this.processing,
      lastStartedAt: this.lastStartedAt?.toISOString() ?? null,
      lastCompletedAt: this.lastCompletedAt?.toISOString() ?? null,
      lastErrorAt: this.lastErrorAt?.toISOString() ?? null,
      lastErrorMessage: this.lastErrorMessage
    };
  }

  private async tick() {
    if (this.processing) {
      return;
    }
    this.processing = true;
    this.lastStartedAt = new Date();

    try {
      const jobs = await OutboxRepository.claimPending(
        config.outbox.batchSize,
        config.outbox.leaseMs
      );
      if (jobs.length > 0) {
        logger.debug(
          { claimed: jobs.length },
          "Outbox worker claimed pending jobs"
        );
      }
      for (const job of jobs) {
        try {
          const handler = this.handlers[job.event_type];
          if (!handler) {
            throw new Error(`Unsupported outbox event type: ${job.event_type}`);
          }
          const { deliveredCount, deliveryMode } = await handler(job);

          // 投递目标用户离线（无活跃 socket）时给一个短暂的"重连窗口"。
          // 业界 IM 标配做法：消息已 ack 给发送方，但接收方此刻可能正在
          // 切前后台 / 网络抖动 / 重连中（典型 1~10 秒），用 2/4/8s 指数退避
          // 重试 3 次再销账，避免对方恰好刚重连就错过这条消息。
          // 3 次仍 0 则视作长期离线，markDispatched 让客户端在重连后通过
          // syncNow / 历史拉取的方式补齐。
          //
          // 仅对真正的"实时投递"事件应用，attachment.delete 等系统作业不适用。
          //
          // 多节点修复：`deliveredCount` 仅统计本节点直投数；当目标用户
          // 仅连接在其他节点时本地永远为 0，若直接走重试会导致 publish
          // 反复广播 ⇒ 远程节点重复投递同一条消息。因此在 deliveredCount === 0
          // 时再走一次 presence 级集群在线判定：任一节点在线即视为已交付，
          // 仅集群全离线才进入重连窗口。单节点模式下 presence 数据等价于
          // localDeliveredCount > 0，无副作用。
          if (
            deliveredCount === 0 &&
            OutboxWorker.isRealtimeDeliveryEvent(job.event_type) &&
            job.target_user_id != null
          ) {
            const onlineElsewhere = await wsServer
              .hasAnyOnlineDevice(job.target_user_id)
              .catch(err => {
                // presence 查询失败时保守按"未确认在线"处理 → 走重试，
                // 宁可延迟也不丢消息。
                logger.warn(
                  {
                    err,
                    outboxId: job.id,
                    targetUserId: job.target_user_id
                  },
                  "Outbox presence probe failed; falling back to retry window"
                );
                return false;
              });
            if (onlineElsewhere) {
              logger.debug(
                {
                  outboxId: job.id,
                  eventType: job.event_type,
                  targetUserId: job.target_user_id,
                  deliveryMode
                },
                "Outbox event delivered by remote node (presence online); marking dispatched"
              );
              await OutboxRepository.markDispatched(job.id);
              continue;
            }

            const reconnectWindowRetryLimit = 3;
            const nextRetryCount = (job.retry_count ?? 0) + 1;
            if (nextRetryCount <= reconnectWindowRetryLimit) {
              await OutboxRepository.markRetry(
                job.id,
                nextRetryCount,
                computeOutboxNextRetryAt(nextRetryCount, {
                  baseDelayMs: 2_000,
                  maxRetryDelayMs: 8_000
                })
              );
              logger.info(
                {
                  outboxId: job.id,
                  eventType: job.event_type,
                  targetUserId: job.target_user_id,
                  attempt: `${nextRetryCount}/${reconnectWindowRetryLimit}`
                },
                "Outbox event has no active recipient; retrying briefly for reconnect window"
              );
              continue;
            }
            // 用户长期离线 —— 视作已交付（销账），靠客户端重连后通过
            // syncNow / 历史拉取的方式补齐离线消息。
            logger.info(
              {
                outboxId: job.id,
                eventType: job.event_type,
                targetUserId: job.target_user_id
              },
              "Outbox event recipient offline beyond reconnect window; marking dispatched (client will sync on reconnect)"
            );
          }

          logger.debug(
            {
              outboxId: job.id,
              eventType: job.event_type,
              targetUserId: job.target_user_id,
              deliveryMode,
              deliveredCount
            },
            "Outbox event delivered"
          );
          await OutboxRepository.markDispatched(job.id);
        } catch (error) {
          const nextRetryCount = (job.retry_count ?? 0) + 1;
          if (nextRetryCount >= config.outbox.maxRetryCount) {
            await OutboxRepository.markDead(job.id, nextRetryCount);
            logger.error(
              {
                err: error,
                outboxId: job.id,
                eventType: job.event_type,
                targetUserId: job.target_user_id,
                retryCount: nextRetryCount
              },
              "Outbox delivery reached retry limit"
            );
            continue;
          }

          await OutboxRepository.markRetry(
            job.id,
            nextRetryCount,
            computeOutboxNextRetryAt(nextRetryCount, {
              maxRetryDelayMs: config.outbox.maxRetryDelayMs
            })
          );
          logger.warn(
            {
              err: error,
              outboxId: job.id,
              eventType: job.event_type,
              targetUserId: job.target_user_id,
              retryCount: nextRetryCount
            },
            "Outbox delivery failed, scheduled retry"
          );
        }
      }
      this.lastCompletedAt = new Date();
      this.lastErrorAt = null;
      this.lastErrorMessage = null;
      await this.logHealthIfNeeded();
    } catch (error) {
      this.lastErrorAt = new Date();
      this.lastErrorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error({ err: error }, "Outbox worker tick failed");
    } finally {
      this.processing = false;
    }
  }

  private async deliverChatMessage(
    job: MessageOutboxRecord
  ): Promise<DeliveryResult> {
    const payload = parseJsonValue<ChatMessage>(job.payload);
    // Re-sign attachment URLs at dispatch time: the queue may be backed up beyond
    // the configured presigned URL expiry (default 1h, see
    // UPLOAD_PRESIGNED_EXPIRES_SECONDS), and clients persist `content.url` locally.
    await enrichMessageWithAttachmentUrls(payload);
    logPayload(
      {
        scope: "outbox.deliver.chat",
        userId: job.target_user_id ?? undefined,
        conversationId: payload?.server_conversation_id,
        messageId: payload?.client_message_id,
        outboxId: job.id
      },
      payload
    );
    const result = await wsServer.dispatchToUser(
      requireTargetUserId(job),
      payload,
      {
        excludeDeviceId: job.target_device_id ?? undefined
      }
    );
    return {
      deliveredCount: result.localDeliveredCount,
      deliveryMode: result.mode
    };
  }

  private async deliverWsEvent(
    job: MessageOutboxRecord
  ): Promise<DeliveryResult> {
    const result = await wsServer.dispatchToUser(
      requireTargetUserId(job),
      parseJsonValue<ServerWsMessage>(job.payload)
    );
    return {
      deliveredCount: result.localDeliveredCount,
      deliveryMode: result.mode
    };
  }

  private async deliverPushNotification(
    job: MessageOutboxRecord
  ): Promise<DeliveryResult> {
    const result = await PushNotificationService.deliverToUser(
      requireTargetUserId(job),
      parseJsonValue<PushNotificationEnvelope>(job.payload)
    );
    return {
      deliveredCount: result.delivered,
      deliveryMode: result.mode
    };
  }

  /**
   * Phase 3：删除 attachment_uploads 对应的 MinIO 对象，并把行置为 deleted。
   * 主对象删除失败会抛错走 outbox 重试 / 死信；缩略图与预览图失败仅 warn。
   */
  private async deleteAttachmentObject(
    job: MessageOutboxRecord
  ): Promise<DeliveryResult> {
    const payload = parseJsonValue<AttachmentDeletePayload>(job.payload);
    if (!payload || !payload.upload_id || !payload.object_name) {
      throw new Error(
        `Outbox event ${job.id} attachment.delete payload missing fields`
      );
    }

    const minio = getSharedMinioService();
    try {
      await minio.deleteFile(bucketNameAttachments, payload.object_name);
    } catch (err) {
      if (!isMinioNotFound(err)) {
        throw err;
      }
      // 主对象已不存在（典型场景：上一次重试已成功删除但 markDeleted 失败）。
      // 视为成功，继续走 thumb/preview 与 markDeleted，保证事件最终幂等收敛。
      logger.info(
        {
          uploadId: payload.upload_id,
          objectName: payload.object_name
        },
        "attachment.delete: main object already gone, treating as success"
      );
    }

    if (payload.thumb_object_key) {
      try {
        await minio.deleteFile(bucketNameAttachments, payload.thumb_object_key);
      } catch (err) {
        logger.warn(
          {
            err,
            uploadId: payload.upload_id,
            objectName: payload.thumb_object_key
          },
          "attachment.delete: thumb object delete failed (ignored)"
        );
      }
    }
    if (payload.preview_object_key) {
      try {
        await minio.deleteFile(
          bucketNameAttachments,
          payload.preview_object_key
        );
      } catch (err) {
        logger.warn(
          {
            err,
            uploadId: payload.upload_id,
            objectName: payload.preview_object_key
          },
          "attachment.delete: preview object delete failed (ignored)"
        );
      }
    }

    await AttachmentRepository.markDeleted(pg, payload.upload_id);

    return {
      deliveredCount: 1,
      deliveryMode: "internal"
    };
  }

  private async logHealthIfNeeded() {
    const now = Date.now();
    if (
      now - this.lastMonitorLogAt <
      Math.max(config.outbox.monitorLogIntervalMs, config.outbox.pollIntervalMs)
    ) {
      return;
    }

    this.lastMonitorLogAt = now;
    const queue: OutboxQueueStats = await OutboxRepository.getStats();
    const summary = {
      ...queue,
      running: this.timer !== null,
      processing: this.processing,
      wsConnections: wsServer.getStats().connections
    };

    if (getOutboxHealthLevel(queue) === "warning") {
      logger.warn(summary, "Outbox queue health warning");
      return;
    }

    logger.info(summary, "Outbox queue health");
  }
}

export default new OutboxWorker();
export { OutboxWorker };
