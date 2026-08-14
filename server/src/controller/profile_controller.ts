import { Request, Response } from "express";
import type {
  UpdateUserNotificationSettingsRequest,
  UpdateUserPrivacySettingsRequest,
  UpdateUserProfileRequest,
  UserNotificationSettings,
  UserPrivacySettingsEnvelope,
  UserProfile,
  UserSearchResult
} from "@mushroom/shared";
import {
  EMAIL_MAX_LENGTH,
  NICKNAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  SIGNATURE_MAX_LENGTH
} from "@mushroom/shared";
import NotificationSettingsService from "../service/notification_settings_service";
import PrivacyService from "../service/privacy_service";
import UserService from "../service/user_service";
import ContactService from "../service/contact_service";
import { wrapAsync } from "../handler/response_wrapper";
import { BusinessError } from "../handler/business_error";
import { toUserProfile, toUserSearchResult } from "../utils/dto";
import {
  assertMaxLength,
  optionalNumberField,
  optionalQueryNumber,
  optionalQueryString,
  optionalStringField
} from "../handler/request_parser";

export class ProfileController {
  static getProfile = wrapAsync(
    async (req: Request, res: Response): Promise<UserProfile> => {
      void res;
      const username = req.JwtPayload!.username;
      if (!username) {
        throw new BusinessError("Username not found in token");
      }
      const user = await UserService.findUserByUsername(username);
      if (!user) {
        throw new BusinessError("User not found");
      }
      return toUserProfile(user);
    }
  );

  static getUserProfile = wrapAsync(
    async (req: Request, res: Response): Promise<UserProfile> => {
      void res;
      const userId = optionalQueryNumber(req, "userId");
      if (userId === undefined) {
        throw new BusinessError("userId is required");
      }

      const user = await UserService.findUserById(userId);
      if (!user) {
        throw new BusinessError("User not found");
      }

      return toUserProfile(user);
    }
  );

  static updateProfile = wrapAsync(
    async (req: Request, res: Response): Promise<UserProfile> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const nickname = optionalStringField(req.body, "nickname");
      const avatarUrl = optionalStringField(req.body, "avatar_url");
      const email = optionalStringField(req.body, "email");
      const phone = optionalStringField(req.body, "phone");
      const gender = optionalNumberField(req.body, "gender");
      const birthday = optionalStringField(req.body, "birthday");
      const signature = optionalStringField(req.body, "signature");
      const patch: UpdateUserProfileRequest = {
        nickname,
        avatar_url: avatarUrl,
        email,
        phone,
        gender,
        birthday,
        signature
      };

      assertMaxLength("昵称", nickname, NICKNAME_MAX_LENGTH);
      assertMaxLength("邮箱", email, EMAIL_MAX_LENGTH);
      assertMaxLength("手机号", phone, PHONE_MAX_LENGTH);
      assertMaxLength("个性签名", signature, SIGNATURE_MAX_LENGTH);

      if (gender !== undefined && ![0, 1, 2].includes(gender)) {
        throw new BusinessError("gender must be 0, 1, or 2");
      }
      if (birthday !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
        throw new BusinessError("birthday must use YYYY-MM-DD format");
      }

      if (
        patch.nickname === undefined &&
        patch.avatar_url === undefined &&
        patch.email === undefined &&
        patch.phone === undefined &&
        patch.gender === undefined &&
        patch.birthday === undefined &&
        patch.signature === undefined
      ) {
        throw new BusinessError("At least one profile field is required");
      }

      const user = await UserService.updateProfile(userId, patch);
      return toUserProfile(user);
    }
  );

  static search = wrapAsync(
    async (req: Request, res: Response): Promise<UserSearchResult[]> => {
      void res;
      const keyword =
        optionalQueryString(req, "q") ?? optionalQueryString(req, "keyword");
      const userId = req.JwtPayload!.userId;
      if (!keyword) {
        throw new BusinessError("Keyword is required");
      }
      const mode = optionalQueryString(req, "mode");
      const defaultCountryCode = optionalQueryString(
        req,
        "default_country_code"
      );
      const users = await UserService.searchUsers(keyword, userId, {
        mode: mode === "phone" || mode === "username" ? mode : undefined,
        defaultCountryCode
      });
      const savedContactIds = new Set(
        await ContactService.listSavedContactIds(
          userId,
          users.map(user => user.id)
        )
      );
      return users.map(user => ({
        ...toUserSearchResult(user),
        is_already_contact: savedContactIds.has(user.id)
      }));
    }
  );

  static getPrivacy = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<UserPrivacySettingsEnvelope> => {
      void res;
      return PrivacyService.getPrivacySettings(req.JwtPayload!.userId);
    }
  );

  static updatePrivacy = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<UserPrivacySettingsEnvelope> => {
      void res;
      const body = req.body as UpdateUserPrivacySettingsRequest;
      return PrivacyService.updatePrivacySettings(req.JwtPayload!.userId, {
        discoverable_by_username: body.discoverable_by_username,
        discoverable_by_phone: body.discoverable_by_phone,
        message_permission: body.message_permission,
        presence_visibility: body.presence_visibility,
        read_receipts_visibility: body.read_receipts_visibility
      });
    }
  );

  static getNotificationSettings = wrapAsync(
    async (req: Request, res: Response): Promise<UserNotificationSettings> => {
      void res;
      return NotificationSettingsService.getNotificationSettings(
        req.JwtPayload!.userId
      );
    }
  );

  static updateNotificationSettings = wrapAsync(
    async (req: Request, res: Response): Promise<UserNotificationSettings> => {
      void res;
      return NotificationSettingsService.updateNotificationSettings(
        req.JwtPayload!.userId,
        req.body as UpdateUserNotificationSettingsRequest
      );
    }
  );
}
