import type {
  UpdateUserNotificationSettingsRequest,
  UserNotificationSettings
} from "@mushroom/shared";
import type { ControllerContext } from "../context";

export class NotificationService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async getNotificationSettings(): Promise<UserNotificationSettings> {
    const result = await this.ctx.api.getNotificationSettings();
    return result.data;
  }

  async updateNotificationSettings(
    patch: UpdateUserNotificationSettingsRequest
  ): Promise<UserNotificationSettings> {
    const result = await this.ctx.api.updateNotificationSettings(patch);
    return result.data;
  }
}
