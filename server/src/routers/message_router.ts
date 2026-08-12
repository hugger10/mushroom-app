import { Router } from "express";
import { MessageController } from "../controller/message_controller";

const router = Router();

router.post("/sync", MessageController.sync);
router.get("/delta", MessageController.delta);
router.get("/list", MessageController.list);
router.get("/around", MessageController.around);
router.get("/state/sync", MessageController.syncState);
router.post("/state", MessageController.updateState);
router.post("/recall", MessageController.recall);
router.post("/reaction", MessageController.setReaction);
router.get("/reactions", MessageController.listReactions);
router.get("/reactions/delta", MessageController.listReactionDeltas);

export default router;
