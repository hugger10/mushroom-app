import type {
  ChangePasswordRequest,
  RegisterRequest,
  UpdateUserProfileRequest,
  UserProfile
} from "@mushroom/shared";
import {
  buildDeviceRegistrationPayload,
  buildLoginUserFromAccessToken,
  extractUidFromAccessToken,
  isJwtExpired
} from "../../auth";
import type { ControllerContext } from "../context";
import { emptyMetrics, isUnauthorizedError } from "../internal-helpers";

/**
 * AuthService 负责：
 *   - bindUser：切换 per-uid 存储句柄
 *   - login / register / refreshAuth / refreshProfile / updateProfile / changePassword
 *   - bootstrap：冷启动流程
 *   - persistTokens / clearLocalSession / applyProfile（私有底座）
 *
 * 由 SyncService.logout / handleUnauthorizedSession 复用 clearLocalSession。
 */
export class AuthService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async bindUser(uid: string) {
    if (!uid) {
      throw new Error("uid is required to bind a user");
    }
    if (!this.ctx.onUserBound) {
      return;
    }
    const nextStores = await this.ctx.onUserBound(uid);
    this.ctx.rebindStores(nextStores);
  }

  async bootstrap() {
    try {
      const auth = await this.ctx.getAuthStore().read();
      if (!auth.accessToken && !auth.refreshToken) {
        return this.ctx.publishSnapshot();
      }

      if (
        (!auth.accessToken || isJwtExpired(auth.accessToken)) &&
        auth.refreshToken
      ) {
        await this.refreshAuth();
      }

      const latestAuth = await this.ctx.getAuthStore().read();
      if (!latestAuth.accessToken) {
        return this.ctx.publishSnapshot();
      }

      try {
        const profileResult = await this.ctx.api.profile();
        const nextAuth = await this.ctx.getAuthStore().read();
        await this.ctx.getAuthStore().write({
          ...nextAuth,
          profile: profileResult.data,
          user: nextAuth.user
            ? {
                ...nextAuth.user,
                nickname: profileResult.data.nickname,
                avatar: profileResult.data.avatar_url,
                signature: profileResult.data.signature
              }
            : nextAuth.user
        });
      } catch (error) {
        if (isUnauthorizedError(error)) {
          throw error;
        }
        // Ignore profile fetch failures during bootstrap; sync can still proceed.
      }

      await this.ctx.services.sync.syncNow();
      return this.ctx.publishSnapshot();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        return this.ctx.services.sync.handleUnauthorizedSession();
      }
      throw error;
    }
  }

  async login(input: { username: string; password: string }) {
    const result = await this.ctx.api.login({
      ...input,
      device: buildDeviceRegistrationPayload(this.ctx.deviceInfo)
    });
    const accessToken = result.data.access_token;
    const uid = extractUidFromAccessToken(accessToken);
    if (!uid) {
      throw new Error("Login response did not contain a valid user identifier");
    }
    await this.bindUser(uid);
    await this.persistTokens({
      accessToken,
      refreshToken: result.data.refresh_token
    });
    // Commit the "this uid is the cold-start entry" marker as soon as
    // authStore has been persisted. See historical notes in controller for
    // why this must happen before bootstrap().
    if (this.ctx.onLoginCommitted) {
      await this.ctx.onLoginCommitted(uid);
    }
    await this.bootstrap();
    return this.ctx.publishSnapshot();
  }

  async register(input: RegisterRequest) {
    await this.ctx.api.register(input);
    return this.login({
      username: input.username,
      password: input.password
    });
  }

  async refreshAuth() {
    const auth = await this.ctx.getAuthStore().read();
    if (!auth.refreshToken) {
      return this.ctx.publishSnapshot();
    }

    try {
      const result = await this.ctx.api.refreshTokens({
        refresh_token: auth.refreshToken
      });
      await this.persistTokens({
        accessToken: result.data.access_token,
        refreshToken: result.data.refresh_token
      });
      return this.ctx.publishSnapshot();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        return this.ctx.services.sync.handleUnauthorizedSession();
      }
      throw error;
    }
  }

  async refreshProfile() {
    const result = await this.ctx.api.profile();
    await this.applyProfile(result.data);
    return this.ctx.publishSnapshot();
  }

  async updateProfile(patch: UpdateUserProfileRequest) {
    const result = await this.ctx.api.updateProfile(patch);
    await this.applyProfile(result.data);
    return this.ctx.publishSnapshot();
  }

  async changePassword(input: ChangePasswordRequest) {
    const result = await this.ctx.api.changePassword(input);
    return result.data;
  }

  async persistTokens(tokens: {
    accessToken: string;
    refreshToken?: string | null;
  }) {
    const current = await this.ctx.getAuthStore().read();
    const nextUser = buildLoginUserFromAccessToken({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null
    });

    await this.ctx.getAuthStore().write({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      user:
        nextUser ??
        (current.user
          ? {
              ...current.user,
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken ?? undefined
            }
          : null),
      profile: current.profile
    });
  }

  async clearLocalSession(options?: { wipeLocalData?: boolean }) {
    const wipeLocalData = options?.wipeLocalData === true;
    this.ctx.setActiveConversationId(null);
    this.ctx.setMetrics(emptyMetrics());
    this.ctx.visibleMessageLimits.clear();
    for (const timer of this.ctx.pendingReadTimers.values()) {
      clearTimeout(timer);
    }
    this.ctx.pendingReadTimers.clear();
    // See historical notes: drop credentials so UI immediately reroutes;
    // keep sync checkpoints + repository unless caller asks for a full wipe.
    const cleanups: Promise<unknown>[] = [this.ctx.getAuthStore().clear()];
    if (wipeLocalData) {
      cleanups.push(
        this.ctx.getCheckpoints().clear(),
        this.ctx.getRepository().clear()
      );
    }
    await Promise.all(cleanups);

    return this.ctx.publishSnapshot();
  }

  private async applyProfile(profile: UserProfile) {
    const current = await this.ctx.getAuthStore().read();
    await this.ctx.getAuthStore().write({
      ...current,
      profile,
      user: current.user
        ? {
            ...current.user,
            nickname: profile.nickname,
            avatar: profile.avatar_url,
            signature: profile.signature
          }
        : current.user
    });
  }
}
