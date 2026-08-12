import pg from "../db/pg";
import type { DbTx } from "./conversation/conversation_core_repository";
import type { AttachmentUploadRecord } from "./models";

const STATUS_PENDING_BIND = 0;
const STATUS_BOUND = 1;
const STATUS_DELETED = 2;

// Phase 3：显式列清单，对应 AttachmentUploadRecord，避免 SELECT * 在表演进时类型漂移。
const ATTACHMENT_UPLOAD_COLUMNS = `
  id, uploader_id, object_name, original_name, size, mime_type, file_url,
  status, bound_message_id, parent_upload_id, category, upload_mode, multipart_upload_id,
  width, height, duration_ms, thumb_object_key, preview_object_key,
  thumb_status, created_at, updated_at
`;

export type AttachmentCategory = "image" | "video" | "audio" | "voice" | "file";

export type AttachmentUploadMode = "single" | "multipart";

class AttachmentRepository {
  async createUpload(
    t: DbTx | typeof pg,
    params: {
      id: string;
      uploader_id: number;
      object_name: string;
      original_name: string;
      size: number;
      mime_type?: string | null;
      /** 旧 single-PUT (multer 路径) 时直接传入；分片直传初始化阶段为 null。 */
      file_url: string | null;
      category?: AttachmentCategory;
      upload_mode?: AttachmentUploadMode;
      multipart_upload_id?: string | null;
      width?: number | null;
      height?: number | null;
      duration_ms?: number | null;
      thumb_status?: "none" | "pending" | "ready" | "failed";
    }
  ) {
    return t.one<AttachmentUploadRecord>(
      `
      INSERT INTO attachment_uploads (
        id,
        uploader_id,
        object_name,
        original_name,
        size,
        mime_type,
        file_url,
        status,
        category,
        upload_mode,
        multipart_upload_id,
        width,
        height,
        duration_ms,
        thumb_status,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        NOW(), NOW()
      )
      RETURNING *
      `,
      [
        params.id,
        params.uploader_id,
        params.object_name,
        params.original_name,
        params.size,
        params.mime_type ?? null,
        params.file_url,
        STATUS_PENDING_BIND,
        params.category ?? "file",
        params.upload_mode ?? "single",
        params.multipart_upload_id ?? null,
        params.width ?? null,
        params.height ?? null,
        params.duration_ms ?? null,
        params.thumb_status ?? "none"
      ]
    );
  }

  /** 上传完成后回写 file_url / 尺寸等元数据，并把 thumb_status 置为 pending（图片）或 none。 */
  async markUploaded(
    t: DbTx,
    params: {
      id: string;
      uploader_id: number;
      file_url: string;
      size?: number;
      width?: number | null;
      height?: number | null;
      duration_ms?: number | null;
      thumb_status?: "none" | "pending";
    }
  ) {
    return t.oneOrNone<AttachmentUploadRecord>(
      `
      UPDATE attachment_uploads
      SET file_url = $3,
          size = COALESCE($4, size),
          width = COALESCE($5, width),
          height = COALESCE($6, height),
          duration_ms = COALESCE($7, duration_ms),
          thumb_status = COALESCE($8, thumb_status),
          updated_at = NOW()
      WHERE id = $1
        AND uploader_id = $2
        AND status = $9
      RETURNING *
      `,
      [
        params.id,
        params.uploader_id,
        params.file_url,
        params.size ?? null,
        params.width ?? null,
        params.height ?? null,
        params.duration_ms ?? null,
        params.thumb_status ?? null,
        STATUS_PENDING_BIND
      ]
    );
  }

  /** 缩略图 / 预览图生成完成后回写对象 key 与状态。 */
  async updateThumbnails(params: {
    id: string;
    thumb_object_key?: string | null;
    preview_object_key?: string | null;
    width?: number | null;
    height?: number | null;
    thumb_status: "ready" | "failed";
  }) {
    return pg.oneOrNone<AttachmentUploadRecord>(
      `
      UPDATE attachment_uploads
      SET thumb_object_key = COALESCE($2, thumb_object_key),
          preview_object_key = COALESCE($3, preview_object_key),
          width = COALESCE($4, width),
          height = COALESCE($5, height),
          thumb_status = $6,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        params.id,
        params.thumb_object_key ?? null,
        params.preview_object_key ?? null,
        params.width ?? null,
        params.height ?? null,
        params.thumb_status
      ]
    );
  }

  async findById(uploadId: string) {
    return pg.oneOrNone<AttachmentUploadRecord>(
      `
      SELECT ${ATTACHMENT_UPLOAD_COLUMNS}
      FROM attachment_uploads
      WHERE id = $1
      `,
      [uploadId]
    );
  }

  /** 批量加载，用于消息出口处即时签发对象 URL（A 方案核心入口）。 */
  async findManyByIds(uploadIds: string[]) {
    if (uploadIds.length === 0) {
      return [];
    }
    return pg.any<AttachmentUploadRecord>(
      `
      SELECT ${ATTACHMENT_UPLOAD_COLUMNS}
      FROM attachment_uploads
      WHERE id IN ($1:csv)
      `,
      [uploadIds]
    );
  }

  /**
   * 启动恢复：扫描所有图片类、上传完成（status<2）但缩略图状态仍为 pending 的记录。
   * 用于服务进程重启后把内存队列丢失的任务重新派发给 worker。
   */
  async findPendingThumbnails(limit: number) {
    return pg.any<AttachmentUploadRecord>(
      `
      SELECT ${ATTACHMENT_UPLOAD_COLUMNS}
      FROM attachment_uploads
      WHERE category = 'image'
        AND thumb_status = 'pending'
        AND status < 2
      ORDER BY created_at ASC
      LIMIT $1
      `,
      [Math.max(1, Math.min(limit, 5000))]
    );
  }

  async findByIdForUpdate(t: DbTx, uploadId: string) {
    return t.oneOrNone<AttachmentUploadRecord>(
      `
      SELECT ${ATTACHMENT_UPLOAD_COLUMNS}
      FROM attachment_uploads
      WHERE id = $1
      FOR UPDATE
      `,
      [uploadId]
    );
  }

  async findPendingUploadForBind(
    t: DbTx,
    uploadId: string,
    uploaderId: number
  ) {
    return t.oneOrNone<AttachmentUploadRecord>(
      `
      SELECT ${ATTACHMENT_UPLOAD_COLUMNS}
      FROM attachment_uploads
      WHERE id = $1
        AND uploader_id = $2
        AND status = $3
      FOR UPDATE
      `,
      [uploadId, uploaderId, STATUS_PENDING_BIND]
    );
  }

  async findBoundUploadForMessage(t: DbTx, messageId: string) {
    return t.oneOrNone<AttachmentUploadRecord>(
      `
      SELECT ${ATTACHMENT_UPLOAD_COLUMNS}
      FROM attachment_uploads
      WHERE bound_message_id = $1
        AND status = $2
      `,
      [messageId, STATUS_BOUND]
    );
  }

  /**
   * Phase 3：扫描超过 TTL 仍未绑定到消息的孤儿上传记录。乐观并发：
   * 不在事务里锁行，由后续 `markOrphanDeleted` 的
   * `WHERE status = 0 AND bound_message_id IS NULL` 兜底，避免 IO 与长事务交叠。
   */
  async findOrphanUploads(olderThan: Date, limit: number) {
    return pg.manyOrNone<
      Pick<
        AttachmentUploadRecord,
        | "id"
        | "object_name"
        | "thumb_object_key"
        | "preview_object_key"
        | "upload_mode"
        | "multipart_upload_id"
      >
    >(
      `
      SELECT id, object_name, thumb_object_key, preview_object_key,
             upload_mode, multipart_upload_id
      FROM attachment_uploads
      WHERE status = $1
        AND bound_message_id IS NULL
        AND created_at < $2
      ORDER BY created_at ASC
      LIMIT $3
      `,
      [STATUS_PENDING_BIND, olderThan, Math.max(1, Math.min(limit, 5000))]
    );
  }

  async bindUploadToMessage(
    t: DbTx,
    params: {
      upload_id: string;
      uploader_id: number;
      message_id: string;
    }
  ) {
    return t.oneOrNone<AttachmentUploadRecord>(
      `
      UPDATE attachment_uploads
      SET status = $4,
          bound_message_id = $3,
          updated_at = NOW()
      WHERE id = $1
        AND uploader_id = $2
        AND status = $5
        AND bound_message_id IS NULL
        AND file_url IS NOT NULL
      RETURNING *
      `,
      [
        params.upload_id,
        params.uploader_id,
        params.message_id,
        STATUS_BOUND,
        STATUS_PENDING_BIND
      ]
    );
  }

  /**
   * 视频首帧缩略图绑定：缩略图是独立 upload，不能占用 bound_message_id
   * 唯一槽位（那是主附件的），改为写 parent_upload_id 指向主附件，并置
   * status=BOUND 防止孤儿清理误删与复用。CAS 条件要求原行处于
   * 待绑定且未归属任何父附件。
   */
  async bindThumbnailUploadToMessage(
    t: DbTx,
    params: {
      upload_id: string;
      uploader_id: number;
      parent_upload_id: string;
    }
  ) {
    return t.oneOrNone<AttachmentUploadRecord>(
      `
      UPDATE attachment_uploads
      SET status = $4,
          parent_upload_id = $3,
          updated_at = NOW()
      WHERE id = $1
        AND uploader_id = $2
        AND status = $5
        AND bound_message_id IS NULL
        AND parent_upload_id IS NULL
        AND file_url IS NOT NULL
      RETURNING *
      `,
      [
        params.upload_id,
        params.uploader_id,
        params.parent_upload_id,
        STATUS_BOUND,
        STATUS_PENDING_BIND
      ]
    );
  }

  async markDeleted(t: DbTx | typeof pg, uploadId: string) {
    await t.none(
      `
      UPDATE attachment_uploads
      SET status = $2,
          updated_at = NOW()
      WHERE id = $1
        AND status <> $2
      `,
      [uploadId, STATUS_DELETED]
    );
  }

  /**
   * Phase 3：orphan cleanup 专用的 CAS 标记。
   * 严格要求 status = pending_bind 且未绑定消息，避免清扫流程与并发 bind/complete
   * 同时执行导致已绑定消息的附件被误删。返回 true 表示本进程持有了这条行
   * 的"清扫所有权"，应继续 MinIO 侧的删除；false 表示行已被其他流程改写，跳过。
   */
  async markOrphanDeleted(
    t: DbTx | typeof pg,
    uploadId: string
  ): Promise<boolean> {
    const row = await t.oneOrNone<{ ok: number }>(
      `
      UPDATE attachment_uploads
      SET status = $2,
          updated_at = NOW()
      WHERE id = $1
        AND status = $3
        AND bound_message_id IS NULL
      RETURNING 1 AS ok
      `,
      [uploadId, STATUS_DELETED, STATUS_PENDING_BIND]
    );
    return row !== null;
  }
}

export const attachmentUploadStatus = {
  pending: STATUS_PENDING_BIND,
  bound: STATUS_BOUND,
  deleted: STATUS_DELETED
};

export default new AttachmentRepository();
