/**
 * 共享的 MinIO 常量与小工具。所有与 MinIO 桶 / 错误判定 / 策略相关的常量
 * 集中于此，便于 service / controller / worker 复用而无需互相依赖。
 */

export const bucketNameAvatars = "avatars";
export const bucketNameAttachments = "attachments";

export const avatarsPolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: ["*"] },
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${bucketNameAvatars}/*`]
    }
  ]
};

export type BucketPolicy = typeof avatarsPolicy;

/**
 * 判定 MinIO/S3 错误是否为对象不存在。删除路径需要将该错误视为成功，
 * 以便撤回 / 清扫等幂等动作可以安全重试。
 */
export function isMinioNotFound(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  return code === "NoSuchKey" || code === "NotFound";
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
