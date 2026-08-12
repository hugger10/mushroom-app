import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import type {
  ChangePasswordResponse,
  LoginResponse,
  RefreshTokenRequest,
  RegisterCurrentDeviceResponse,
  UserSecurityEventsResponse,
  UserSessionSummary
} from "@mushroom/shared";
import {
  NICKNAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  USERNAME_MAX_LENGTH
} from "@mushroom/shared";
import AuthService from "../service/auth_service";
import UserService from "../service/user_service";
import UserDeviceService from "../service/user_device_service";
import { wrapAsync } from "../handler/response_wrapper";
import { BusinessError } from "../handler/business_error";
import { toUserProfile } from "../utils/dto";
import {
  assertMaxLength,
  optionalQueryNumber,
  optionalStringField,
  requireStringField
} from "../handler/request_parser";
import { parseJsonObject } from "../utils/json";

function normalizePushProviderValue(
  value: unknown
): "fcm" | "huawei" | "xiaomi" | null {
  if (value === "xiaomi") {
    return "xiaomi";
  }

  if (value === "huawei") {
    return "huawei";
  }

  if (value === "fcm") {
    return "fcm";
  }

  return null;
}

export class AuthController {
  static login = wrapAsync(
    async (req: Request, res: Response): Promise<LoginResponse> => {
      void res;
      const username = requireStringField(
        req.body,
        "username",
        "Username is required"
      );
      const password = requireStringField(
        req.body,
        "password",
        "Password is required"
      );
      const deviceId = optionalStringField(req.body?.device, "device_id");
      const user = await UserService.findUserByUsername(username);
      if (!user) {
        await AuthService.recordAudit(req, {
          deviceId: deviceId ?? null,
          action: "login",
          actionStatus: 1,
          details: {
            username,
            reason: "user_not_found"
          }
        });
        throw new BusinessError("User not found");
      }

      if (user.is_deleted || Number(user.status) !== 0) {
        await AuthService.recordAudit(req, {
          userId: user.id,
          deviceId: deviceId ?? null,
          action: "login",
          actionStatus: 1,
          details: {
            username,
            reason: "user_inactive"
          }
        });
        throw new BusinessError("User account is not active", 403);
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        await AuthService.recordAudit(req, {
          userId: user.id,
          deviceId: deviceId ?? null,
          action: "login",
          actionStatus: 1,
          details: {
            username,
            reason: "password_incorrect"
          }
        });
        throw new BusinessError("Password is incorrect");
      }

      await AuthService.ensureDeviceAllowedForLogin(user.id, deviceId);
      await UserService.markLogin(user.id);
      await UserDeviceService.registerLoginDevice(
        user.id,
        req.body?.device,
        req
      );
      return AuthService.createLoginSession({
        userId: user.id,
        username,
        nickname: user.nickname,
        deviceId: deviceId ?? null,
        req
      });
    }
  );

  static refresh = wrapAsync(
    async (req: Request, res: Response): Promise<LoginResponse> => {
      void res;
      const refreshToken = requireStringField(
        req.body satisfies RefreshTokenRequest,
        "refresh_token",
        "refresh_token is required"
      );
      return AuthService.refreshTokens(refreshToken, req);
    }
  );

  static register = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const username = requireStringField(
      req.body,
      "username",
      "Username is required"
    );
    const password = requireStringField(
      req.body,
      "password",
      "Password is required"
    );
    const nickname = optionalStringField(req.body, "nickname");

    assertMaxLength("用户名", username, USERNAME_MAX_LENGTH);
    assertMaxLength("密码", password, PASSWORD_MAX_LENGTH);
    assertMaxLength("昵称", nickname, NICKNAME_MAX_LENGTH);

    const existingUser = await UserService.findUserByUsername(username);
    if (existingUser) {
      throw new BusinessError("User already exists");
    }

    const user = await UserService.createUser(username, password, nickname);
    return toUserProfile(user);
  });

  static registerCurrentDevice = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<RegisterCurrentDeviceResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const registered = await UserDeviceService.registerAuthenticatedDevice(
        userId,
        req.body?.device,
        req
      );

      if (!registered) {
        throw new BusinessError("device.device_id is required");
      }

      return {
        device_id: registered.device_id,
        push_provider: normalizePushProviderValue(registered.push_provider),
        push_token: registered.push_token ?? null,
        voip_token: registered.voip_token ?? null,
        push_app_id: registered.push_app_id ?? null,
        push_capabilities:
          (parseJsonObject(registered.metadata)?.push_capabilities as
            | string[]
            | undefined) ?? null,
        updated: true
      };
    }
  );

  static unregisterCurrentDevice = wrapAsync(
    async (req: Request, res: Response) => {
      void res;
      const userId = req.JwtPayload!.userId;
      const currentDeviceId = req.JwtPayload!.deviceId ?? null;
      if (!currentDeviceId) {
        return { updated: false };
      }
      const updated = await UserDeviceService.unregisterPushForCurrentDevice(
        userId,
        currentDeviceId
      );
      return { updated: updated != null };
    }
  );

  static logout = wrapAsync(async (req: Request, res: Response) => {
    void res;
    const userId = req.JwtPayload!.userId;
    const currentSessionId = req.JwtPayload!.sid ?? null;
    const currentDeviceId = req.JwtPayload!.deviceId ?? null;
    await UserDeviceService.logoutCurrentDevice(
      userId,
      currentSessionId,
      currentDeviceId
    );
    return null;
  });

  static changePassword = wrapAsync(
    async (req: Request, res: Response): Promise<ChangePasswordResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const currentSessionId = req.JwtPayload!.sid ?? null;
      const currentDeviceId = req.JwtPayload!.deviceId ?? null;
      const currentPassword = requireStringField(
        req.body,
        "current_password",
        "current_password is required"
      );
      const newPassword = requireStringField(
        req.body,
        "new_password",
        "new_password is required"
      );
      return UserService.changePassword(
        userId,
        currentPassword,
        newPassword,
        currentSessionId,
        currentDeviceId
      );
    }
  );

  static getSession = wrapAsync(
    async (req: Request, res: Response): Promise<UserSessionSummary> => {
      void res;
      const userId = req.JwtPayload!.userId;
      return UserService.getSessionSummary(userId);
    }
  );

  static getSecurityEvents = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<UserSecurityEventsResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const limit = optionalQueryNumber(req, "limit") ?? 20;
      return UserService.getSecurityEvents(userId, Math.min(limit, 100));
    }
  );
}
