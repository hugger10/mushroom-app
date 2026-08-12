/**
 * Backwards-compatible re-export shim.
 *
 * The MinIO module has been split into focused files. New code should import
 * directly from the dedicated modules listed below; this shim exists only to
 * keep existing internal consumers (outbox worker, thumbnail worker,
 * attachment URL resolver) working without churn.
 *
 *   - Constants / small utils: ./minio_client
 *   - Generic client wrapper:  ./minio_service
 *   - Avatar processing:       ./avatar_storage
 *   - HTTP controllers:        ../controller/{avatar,attachment}_controller
 *   - Router wiring:           ../routers/file_router
 */

export {
  bucketNameAttachments,
  bucketNameAvatars,
  isMinioNotFound
} from "./minio_client";
export { MinioService, getSharedMinioService } from "./minio_service";
