import type {
  PrivacySyncMessage,
  UserPrivacySettings,
  UserPrivacySettingsEnvelope
} from "@mushroom/shared";
import { BusinessError } from "../handler/business_error";
import PrivacyRepository from "../repository/privacy_repository";
import type { UserPrivacySettingsRecord } from "../repository/models";
import { wsServer } from "../websocket";
import { getRequestLogger } from "../utils/log_context";

function validateRule(value: number | undefined) {
  return value === undefined || value === 0 || value === 1 || value === 2;
}

function toDto(settings: UserPrivacySettingsRecord): UserPrivacySettings {
  return {
    discoverable_by_username: settings.discoverable_by_username,
    discoverable_by_phone: settings.discoverable_by_phone,
    message_permission: settings.message_permission,
    presence_visibility: settings.presence_visibility,
    read_receipts_visibility: settings.read_receipts_visibility
  };
}

function toEnvelope(
  settings: UserPrivacySettingsRecord
): UserPrivacySettingsEnvelope {
  return {
    settings: toDto(settings),
    version: settings.version,
    updated_at: settings.updated_at.toISOString()
  };
}

class PrivacyService {
  async getPrivacySettings(
    userId: number
  ): Promise<UserPrivacySettingsEnvelope> {
    const settings = await PrivacyRepository.findByUserId(userId);
    return toEnvelope(settings);
  }

  async updatePrivacySettings(
    userId: number,
    patch: Partial<UserPrivacySettings>
  ): Promise<UserPrivacySettingsEnvelope> {
    if (
      !validateRule(patch.discoverable_by_username) ||
      !validateRule(patch.discoverable_by_phone) ||
      !validateRule(patch.message_permission) ||
      !validateRule(patch.presence_visibility) ||
      !validateRule(patch.read_receipts_visibility)
    ) {
      throw new BusinessError("Privacy setting must be 0, 1, or 2");
    }

    const settings = await PrivacyRepository.update(userId, patch);
    const envelope = toEnvelope(settings);

    // 非持久化 WS 推送：用户其他在线设备/会话立刻同步隐私变更。
    // 失败仅记日志：客户端登录/重连时通过 GET /api/user/privacy 自愈。
    const payload: PrivacySyncMessage = {
      messageClassify: "privacy_sync",
      settings: envelope.settings,
      version: envelope.version,
      updated_at: envelope.updated_at
    };
    wsServer.dispatchToUser(userId, payload).catch(err => {
      getRequestLogger().warn(
        { err, userId, version: envelope.version },
        "privacy_sync dispatch failed"
      );
    });

    return envelope;
  }
}

export default new PrivacyService();
