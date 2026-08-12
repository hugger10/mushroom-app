import { Request, Response } from "express";
import type {
  LogoutDevicesResponse,
  UpdateDeviceStatusResponse,
  UserDevicesResponse
} from "@mushroom/shared";
import UserDeviceService from "../service/user_device_service";
import { wrapAsync } from "../handler/response_wrapper";
import {
  optionalNumberField,
  requireStringField
} from "../handler/request_parser";

export class DeviceController {
  static getDevices = wrapAsync(
    async (req: Request, res: Response): Promise<UserDevicesResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const currentDeviceId = req.JwtPayload!.deviceId ?? null;
      return UserDeviceService.getManagedDevices(userId, currentDeviceId);
    }
  );

  static logoutDevice = wrapAsync(
    async (req: Request, res: Response): Promise<LogoutDevicesResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const currentSessionId = req.JwtPayload!.sid ?? null;
      const currentDeviceId = req.JwtPayload!.deviceId ?? null;
      const deviceId = requireStringField(
        req.body,
        "device_id",
        "device_id is required"
      );
      return UserDeviceService.logoutDevice(
        userId,
        deviceId,
        currentDeviceId,
        currentSessionId
      );
    }
  );

  static logoutAll = wrapAsync(
    async (req: Request, res: Response): Promise<LogoutDevicesResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const currentSessionId = req.JwtPayload!.sid ?? null;
      const currentDeviceId = req.JwtPayload!.deviceId ?? null;
      const keepCurrent =
        Number(optionalNumberField(req.body, "keep_current") ?? 0) === 1;
      return UserDeviceService.logoutAllDevices(
        userId,
        currentSessionId,
        currentDeviceId,
        keepCurrent
      );
    }
  );

  static disableDevice = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<UpdateDeviceStatusResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const currentSessionId = req.JwtPayload!.sid ?? null;
      const currentDeviceId = req.JwtPayload!.deviceId ?? null;
      const deviceId = requireStringField(
        req.body,
        "device_id",
        "device_id is required"
      );
      return UserDeviceService.disableDevice(
        userId,
        deviceId,
        currentDeviceId,
        currentSessionId
      );
    }
  );

  static restoreDevice = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<UpdateDeviceStatusResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const currentSessionId = req.JwtPayload!.sid ?? null;
      const currentDeviceId = req.JwtPayload!.deviceId ?? null;
      const deviceId = requireStringField(
        req.body,
        "device_id",
        "device_id is required"
      );
      return UserDeviceService.restoreDevice(
        userId,
        deviceId,
        currentDeviceId,
        currentSessionId
      );
    }
  );
}
