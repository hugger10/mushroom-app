import bcrypt from "bcryptjs";
import type { ConversationSyncMessage } from "@mushroom/shared";
import {
  classifyUserSearchInput,
  isValidPhoneInput,
  PASSWORD_MAX_LENGTH,
  type UserSearchMode
} from "@mushroom/shared";
import pg from "../db/pg";
import { BusinessError } from "../handler/business_error";
import AuthAuditRepository from "../repository/auth_audit_repository";
import ContactRepository from "../repository/contact_repository";
import ConversationCoreRepository, {
  type DbTx
} from "../repository/conversation/conversation_core_repository";
import ConversationMemberRepository from "../repository/conversation/conversation_member_repository";
import OutboxRepository from "../repository/outbox_repository";
import PrivacyRepository from "../repository/privacy_repository";
import UserSessionRepository from "../repository/user_session_repository";
import UserRepository from "../repository/user_repository";
import type { UserRecord as User } from "../repository/models";
import { wsServer } from "../websocket";
import ContactService from "./contact_service";
import PresenceService from "./presence_service";
import { parseJsonObject } from "../utils/json";

// Phase 3：last_login_at 节流的进程内缓存，记录最后写入时间戳（ms）。
// 配合 UserRepository.updateLastLoginAt 的 SQL 条件做双层节流，避免高频登录场景下
// users 表 hot row 频繁 UPDATE 拖累 HOT chain / autovacuum。
const LAST_LOGIN_THROTTLE_MS = 60_000;
const LAST_LOGIN_THROTTLE_MAX = 1000;
const lastLoginThrottleCache = new Map<number, number>();

function validatePhoneE164(phone: string) {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

class UserService {
  async findUserById(userId: number): Promise<User | null> {
    return UserRepository.findById(userId);
  }

  async findUserByUsername(username: string): Promise<User | null> {
    return UserRepository.findByUsername(username);
  }

  async createUser(
    username: string,
    plainPassword: string,
    nickname?: string
  ): Promise<User> {
    const hashed = await bcrypt.hash(plainPassword, 10);
    return pg.tx(async (t: DbTx) => {
      const user = await UserRepository.create(
        username,
        hashed,
        nickname || username,
        t
      );
      await PrivacyRepository.ensureForUser(user.id, t);
      return user;
    });
  }

  async updateProfile(
    userId: number,
    patch: {
      nickname?: string;
      avatar_url?: string | null;
      email?: string | null;
      phone?: string | null;
      gender?: number | null;
      birthday?: string | null;
      signature?: string | null;
    }
  ): Promise<User> {
    const { user, syncTargets } = await pg.tx(async (t: DbTx) => {
      const user = await UserRepository.updateProfile(userId, patch, t);
      if (typeof patch.phone === "string" && validatePhoneE164(patch.phone)) {
        await ContactRepository.upsertPhoneIdentity(userId, patch.phone, t);
      }

      const shouldSyncConversationMembers =
        patch.nickname !== undefined || patch.avatar_url !== undefined;

      if (!shouldSyncConversationMembers) {
        return {
          user,
          syncTargets: [] as Array<{
            conversation_id: string;
            user_id: number;
          }>
        };
      }

      const conversationIds = (
        await ConversationCoreRepository.findActiveConversationIdsByUser(
          t,
          userId
        )
      ).map(item => item.conversation_id);

      if (conversationIds.length === 0) {
        return {
          user,
          syncTargets: [] as Array<{
            conversation_id: string;
            user_id: number;
          }>
        };
      }

      await ConversationMemberRepository.refreshMemberProfileCache(t, userId, {
        nickname: patch.nickname,
        avatar_url: patch.avatar_url
      });
      await ConversationCoreRepository.touchConversations(t, conversationIds);

      const syncTargets =
        await ConversationCoreRepository.findConversationSyncTargets(
          t,
          conversationIds
        );

      await OutboxRepository.insertEvents(
        t,
        syncTargets.map(target => ({
          event_type: "conversation.sync",
          conversation_id: target.conversation_id,
          target_user_id: target.user_id,
          payload: {
            messageClassify: "conversation_sync" as const,
            action: "upsert" as const,
            conversation_id: target.conversation_id
          } satisfies ConversationSyncMessage
        }))
      );

      return { user, syncTargets };
    });

    if (syncTargets.length > 0) {
      await Promise.allSettled(
        syncTargets.map(target =>
          wsServer.dispatchToUser(target.user_id, {
            messageClassify: "conversation_sync",
            action: "upsert",
            conversation_id: target.conversation_id
          })
        )
      );
    }

    return user;
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    currentSessionId?: string | null,
    currentDeviceId?: string | null
  ) {
    if (newPassword.length < 6) {
      throw new BusinessError("New password must be at least 6 characters");
    }
    if (newPassword.length > PASSWORD_MAX_LENGTH) {
      throw new BusinessError(`密码不能超过 ${PASSWORD_MAX_LENGTH} 个字符`);
    }

    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new BusinessError("User not found");
    }

    const currentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!currentPasswordValid) {
      await AuthAuditRepository.insert({
        user_id: userId,
        device_id: currentDeviceId ?? null,
        session_id: currentSessionId ?? null,
        action: "password.change",
        action_status: 1,
        details: {
          reason: "current_password_incorrect"
        }
      });
      throw new BusinessError("Current password is incorrect");
    }

    if (await bcrypt.compare(newPassword, user.password)) {
      throw new BusinessError(
        "New password must be different from current password"
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    const revokedSessions = await pg.tx(async (t: DbTx) => {
      await UserRepository.updatePassword(userId, hashed, t);
      return UserSessionRepository.revokeSessionsByUser(userId, {
        excludeSessionId: currentSessionId ?? null,
        reason: "password_changed"
      });
    });

    await wsServer.disconnectUserDevices(userId, {
      excludeDeviceId: currentDeviceId ?? undefined,
      reason: "password_changed"
    });
    await AuthAuditRepository.insert({
      user_id: userId,
      device_id: currentDeviceId ?? null,
      session_id: currentSessionId ?? null,
      action: "password.change",
      action_status: 0,
      details: {
        revoked_session_count: revokedSessions.length
      }
    });

    return {
      updated: true,
      revoked_count: revokedSessions.length
    };
  }

  async markLogin(userId: number): Promise<void> {
    // Phase 3：进程内节流。窗口 60s + 最多 1000 条 LRU；DB 侧还有 SQL 条件兜底。
    const now = Date.now();
    const last = lastLoginThrottleCache.get(userId);
    if (last !== undefined && now - last < LAST_LOGIN_THROTTLE_MS) {
      return;
    }
    lastLoginThrottleCache.set(userId, now);
    if (lastLoginThrottleCache.size > LAST_LOGIN_THROTTLE_MAX) {
      const firstKey = lastLoginThrottleCache.keys().next().value;
      if (firstKey !== undefined) {
        lastLoginThrottleCache.delete(firstKey);
      }
    }
    await UserRepository.updateLastLoginAt(userId);
  }

  async getSessionSummary(userId: number) {
    const [user, presenceSummary] = await Promise.all([
      UserRepository.findById(userId),
      PresenceService.getPresenceSummary(userId)
    ]);

    return {
      ...presenceSummary,
      last_login_at: user?.last_login_at?.toISOString()
    };
  }

  async getSecurityEvents(userId: number, limit = 20) {
    const events = await AuthAuditRepository.listByUser(userId, limit);

    return {
      events: events.map(event => ({
        id: event.id,
        action: event.action,
        action_status: event.action_status,
        device_id: event.device_id ?? null,
        session_id: event.session_id ?? null,
        ip: event.ip ?? null,
        user_agent: event.user_agent ?? null,
        details: parseJsonObject(event.details),
        created_at: event.created_at.toISOString()
      }))
    };
  }

  async searchUsers(
    keyword: string,
    selfId?: number,
    options?: { mode?: UserSearchMode; defaultCountryCode?: string }
  ): Promise<User[]> {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) {
      return [];
    }

    const mode =
      options?.mode ??
      (classifyUserSearchInput(normalizedKeyword) === "username"
        ? "username"
        : "phone");

    if (mode === "phone") {
      // 手机号整号精确匹配：前端已做格式校验，这里兜底，避免短串 / 非法串查库。
      if (!selfId || !isValidPhoneInput(normalizedKeyword)) {
        return [];
      }
      try {
        const result = await ContactService.lookupUserByPhone(
          selfId,
          normalizedKeyword,
          options?.defaultCountryCode
        );
        return result.matched && result.user ? [result.user] : [];
      } catch {
        return [];
      }
    }

    const users = await UserRepository.search(normalizedKeyword, selfId);
    if (!selfId) {
      return users;
    }

    const filtered: User[] = [];
    for (const user of users) {
      const allowed = await ContactService.canDiscoverUser(
        selfId,
        user.id,
        "username"
      );
      if (allowed) {
        filtered.push(user);
      }
    }
    return filtered;
  }
}

export type { User };
export default new UserService();
