import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";
import multer from "multer";

import { AttachmentController } from "../controller/attachment_controller";
import { AvatarController } from "../controller/avatar_controller";
import { BusinessError } from "../handler/business_error";

const router = express.Router();
const avatarCtrl = new AvatarController();
const attachmentCtrl = new AttachmentController();

router.post(
  "/avatar",
  (req: Request, res: Response, next: NextFunction) => {
    avatarCtrl.avatar.single("avatar")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        return next(new BusinessError(err.message));
      }
      if (err) {
        return next(err);
      }
      next();
    });
  },
  avatarCtrl.uploadAvatar
);

router.post("/attachment/initiate", attachmentCtrl.initiateAttachmentUpload);
router.post("/attachment/part-url", attachmentCtrl.attachmentPartUrl);
router.post("/attachment/complete", attachmentCtrl.completeAttachmentUpload);
router.post("/attachment/abort", attachmentCtrl.abortAttachmentUpload);
router.post("/attachment/refresh-urls", attachmentCtrl.refreshAttachmentUrls);

router.delete("/delete", avatarCtrl.deleteAvatar);
router.get("/get", avatarCtrl.getUserAvatars);

export { router as fileRouter };
