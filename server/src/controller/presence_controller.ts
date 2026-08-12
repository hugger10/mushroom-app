import { Request, Response } from "express";
import type { UserPresenceEntry, UserPresenceSummary } from "@mushroom/shared";
import PresenceService from "../service/presence_service";
import { wrapAsync } from "../handler/response_wrapper";
import { optionalQueryString } from "../handler/request_parser";

export class PresenceController {
  static getPresenceSummary = wrapAsync(
    async (req: Request, res: Response): Promise<UserPresenceSummary> => {
      void res;
      const userId = req.JwtPayload!.userId;
      return PresenceService.getPresenceSummary(userId);
    }
  );

  static getUsersPresence = wrapAsync(
    async (req: Request, res: Response): Promise<UserPresenceEntry[]> => {
      void res;
      const rawUserIds = optionalQueryString(req, "user_ids");
      const userIds = String(rawUserIds ?? "")
        .split(",")
        .map(value => Number(value.trim()))
        .filter(value => Number.isFinite(value) && value > 0);

      if (userIds.length === 0) {
        return [];
      }

      return PresenceService.getUsersPresence(req.JwtPayload!.userId, userIds);
    }
  );
}
