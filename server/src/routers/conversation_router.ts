import { Router } from "express";
import { ConversationController } from "../controller/conversation_controller";

const router = Router();

router.get("/sync", ConversationController.sync);
router.get("/members", ConversationController.getMember);
router.post("/create", ConversationController.create);
router.post("/direct", ConversationController.direct);
router.post("/profile", ConversationController.updateProfile);
router.post("/announcement", ConversationController.updateAnnouncement);
router.post("/settings", ConversationController.updateSettings);
router.post("/state", ConversationController.updateState);
router.post("/delete", ConversationController.deleteForSelf);
router.post("/disband", ConversationController.disband);
router.post("/members/add", ConversationController.addMembers);
router.post("/members/mute", ConversationController.updateMemberMute);
router.post("/members/remove", ConversationController.removeMember);
router.post("/members/role", ConversationController.updateMemberRole);
router.post("/owner/transfer", ConversationController.transferOwner);
router.post("/leave", ConversationController.leave);
router.post("/read", ConversationController.markRead);
router.get("/:id/read-state", ConversationController.getReadState);

export default router;
