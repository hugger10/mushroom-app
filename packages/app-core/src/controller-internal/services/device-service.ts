import type {
  UserDevicesResponse,
  UserSecurityEventsResponse
} from "@mushroom/shared";
import type { ControllerContext } from "../context";

export class DeviceService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async getManagedDevices(): Promise<UserDevicesResponse> {
    const result = await this.ctx.api.getDevices();
    return result.data;
  }

  async getSecurityEvents(limit = 20): Promise<UserSecurityEventsResponse> {
    const result = await this.ctx.api.getSecurityEvents({ limit });
    return result.data;
  }

  async disableDevice(deviceId: string) {
    const result = await this.ctx.api.disableDevice({ device_id: deviceId });
    return result.data;
  }

  async restoreDevice(deviceId: string) {
    const result = await this.ctx.api.restoreDevice({ device_id: deviceId });
    return result.data;
  }

  async logoutManagedDevice(deviceId: string) {
    const result = await this.ctx.api.logoutDevice({ device_id: deviceId });
    return result.data;
  }

  async logoutOtherDevices() {
    const result = await this.ctx.api.logoutAllDevices({ keep_current: 1 });
    return result.data;
  }

  async logoutAllManagedDevices() {
    const result = await this.ctx.api.logoutAllDevices({ keep_current: 0 });
    return result.data;
  }
}
