import multer, { type FileFilterCallback } from "multer";
import type { Request, Response } from "express";

import { BusinessError } from "../handler/business_error";
import { wrapAsync } from "../handler/response_wrapper";
import { config } from "../utils/config";
import { AvatarStorageService } from "../storage/avatar_storage";
import { avatarsPolicy, bucketNameAvatars } from "../storage/minio_client";
import { MinioService } from "../storage/minio_service";

/**
 * 头像 HTTP 控制器：上传 / 删除 / 列举用户历史头像。
 * bucket 初始化（含 public-read policy）在构造时触发一次，行为与历史一致。
 */
export class AvatarController {
  private readonly minioService: MinioService;
  private readonly avatarStorage: AvatarStorageService;
  readonly avatar: ReturnType<typeof multer>;

  constructor() {
    this.minioService = new MinioService();
    this.avatarStorage = new AvatarStorageService(this.minioService);
    void this.minioService.initBucketName(bucketNameAvatars, avatarsPolicy);

    this.avatar = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: config.limits.avatarMaxBytes
      },
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: FileFilterCallback
      ) => {
        const allowedMimes = [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/gif"
        ];

        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
          return;
        }

        cb(new Error("Only jpeg, jpg, png and gif files are supported"));
      }
    });
  }

  uploadAvatar = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const username = req.JwtPayload!.username;
    const file = req.file;
    if (!username) {
      throw new BusinessError("User is not authenticated");
    }
    if (!file) {
      throw new BusinessError("Avatar file is required");
    }

    return this.avatarStorage.uploadAvatar(
      file.buffer,
      file.originalname,
      username
    );
  });

  deleteAvatar = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const username = req.JwtPayload!.username;
    if (!username) {
      throw new BusinessError("User is not authenticated");
    }
    const { objectNames } = req.body as { objectNames: string | string[] };
    const names = Array.isArray(objectNames) ? objectNames : [objectNames];
    const prefix = `${username}/`;
    for (const name of names) {
      if (!name.startsWith(prefix)) {
        throw new BusinessError("无权删除他人的头像文件", 403);
      }
    }
    await this.minioService.deleteFile(bucketNameAvatars, objectNames);
    return {};
  });

  getUserAvatars = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const username = req.JwtPayload!.username;
    if (!username) {
      throw new BusinessError("User is not authenticated");
    }
    return this.avatarStorage.getUserAvatars(username);
  });
}
