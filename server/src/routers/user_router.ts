import { Router } from "express";
import { AuthController } from "../controller/auth_controller";
import { CallController } from "../controller/call_controller";
import { ContactController } from "../controller/contact_controller";
import { DeviceController } from "../controller/device_controller";
import { PresenceController } from "../controller/presence_controller";
import { ProfileController } from "../controller/profile_controller";

const router = Router();

// auth / session
router.post("/login", AuthController.login);
router.post("/register", AuthController.register);
router.post("/refresh", AuthController.refresh);
router.post("/logout", AuthController.logout);
router.post("/password", AuthController.changePassword);
router.get("/session", AuthController.getSession);
router.get("/security-events", AuthController.getSecurityEvents);

// device lifecycle
router.post("/device/register", AuthController.registerCurrentDevice);
router.post("/device/unregister", AuthController.unregisterCurrentDevice);
router.post("/logout-device", DeviceController.logoutDevice);
router.post("/logout-all", DeviceController.logoutAll);
router.post("/device/disable", DeviceController.disableDevice);
router.post("/device/restore", DeviceController.restoreDevice);
router.get("/devices", DeviceController.getDevices);

// profile / privacy / notifications / search
router.get("/profile", ProfileController.getProfile);
router.get("/user", ProfileController.getUserProfile);
router.post("/profile", ProfileController.updateProfile);
router.get("/search", ProfileController.search);
router.get("/privacy", ProfileController.getPrivacy);
router.put("/privacy", ProfileController.updatePrivacy);
router.get("/notification-settings", ProfileController.getNotificationSettings);
router.put(
  "/notification-settings",
  ProfileController.updateNotificationSettings
);

// presence
router.get("/presence-summary", PresenceController.getPresenceSummary);
router.get("/presence-batch", PresenceController.getUsersPresence);

// contacts / blocks
router.get("/contacts", ContactController.getContacts);
router.post("/contacts/match", ContactController.matchContacts);
router.post("/contacts/lookup-phone", ContactController.lookupContactByPhone);
router.post("/contacts", ContactController.saveContact);
router.put("/contacts/:contactUserId", ContactController.updateContact);
router.delete(
  "/contacts/:contactUserId",
  ContactController.deleteContactByParam
);
router.get("/blocks", ContactController.getBlocks);
router.post("/block", ContactController.block);
router.post("/unblock", ContactController.unblock);

// call helpers
router.get("/call/ice", CallController.getCallIceConfig);
router.get("/call/room", CallController.getCallRoomConfig);
router.get("/call/state", CallController.getCallState);

export default router;
