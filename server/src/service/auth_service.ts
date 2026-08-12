import crypto from "crypto";
import type { Request } from "express";
import type { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import type { LoginResponse } from "@mushroom/shared";
import { config } from "../utils/config";
import UserRepository from "../repository/user_repository";
import UserDeviceRepository from "../repository/user_device_repository";
import UserSessionRepository from "../repository/user_session_repository";
import AuthAuditRepository from "../repository/auth_audit_repository";
import { BusinessError } from "../handler/business_error";
import type { JwtPayload } from "../handler/jwt";
import { getRequestLogger } from "../utils/log_context";

function getForwardedIp(value: string | string[] | undefined) {
  if (!value) {
    return null;
  }

  const raw = Array.isArray(value) ? value[0] : value;
  return raw.split(",")[0]?.trim() || null;
}

function getRequestIp(req: Request | IncomingMessage) {
  return (
    getForwardedIp(req.headers["x-forwarded-for"]) ??
    req.socket.remoteAddress ??
    null
  );
}

function getUserAgent(req: Request | IncomingMessage) {
  const userAgent = req.headers["user-agent"];
  if (Array.isArray(userAgent)) {
    return userAgent[0] ?? null;
  }
  return userAgent ?? null;
}

function createOpaqueToken(size = 32) {
  return crypto.randomBytes(size).toString("base64url");
}

function hashToken(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

class AuthService {
  async ensureDeviceAllowedForLogin(userId: number, deviceId?: string | null) {
    if (!deviceId) {
      return;
    }

    const existingDevice = await UserDeviceRepository.findByUserAndDevice(
      userId,
      deviceId
    );
    if (existingDevice && Number(existingDevice.status) === 0) {
      throw new BusinessError("Device has been disabled", 403);
    }
  }

  async createLoginSession(input: {
    userId: number;
    username: string;
    nickname: string;
    deviceId?: string | null;
    req: Request;
  }): Promise<LoginResponse> {
    const sessionId = createOpaqueToken(24);
    const accessJti = createOpaqueToken(18);
    const refreshToken = createOpaqueToken(48);
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + config.auth.refreshTokenTtlSeconds * 1000
    );

    await UserSessionRepository.create({
      session_id: sessionId,
      user_id: input.userId,
      device_id: input.deviceId ?? null,
      refresh_token_hash: refreshTokenHash,
      access_jti: accessJti,
      expires_at: expiresAt,
      last_ip: getRequestIp(input.req),
      user_agent: getUserAgent(input.req)
    });

    await this.recordAudit(input.req, {
      userId: input.userId,
      deviceId: input.deviceId ?? null,
      sessionId,
      action: "login",
      actionStatus: 0,
      details: {
        auth_type: "password"
      }
    });

    getRequestLogger().info(
      {
        userId: input.userId,
        deviceId: input.deviceId ?? null,
        sessionId,
        username: input.username
      },
      "Login session created"
    );

    return this.buildTokenResponse({
      userId: input.userId,
      username: input.username,
      nickname: input.nickname,
      deviceId: input.deviceId ?? null,
      sessionId,
      accessJti,
      refreshToken
    });
  }

  async refreshTokens(
    refreshToken: string,
    req: Request
  ): Promise<LoginResponse> {
    const currentRefreshTokenHash = hashToken(refreshToken);
    const session = await UserSessionRepository.findByRefreshTokenHash(
      currentRefreshTokenHash
    );

    // Grace window replay: if the caller is presenting the *previous*
    // refresh token (e.g. a concurrent or retried refresh racing with
    // a successful rotation), re-issue an access token without rotating
    // the refresh token again. This eliminates the noisy 401 storms
    // observed on mobile/web when several requests trigger refresh
    // simultaneously.
    //
    // Trade-off (intentional): we hand the caller back the same stale
    // refresh token they presented. Within the grace window the caller
    // has a valid access token and can re-fetch the rotated refresh
    // token via normal flows; outside the grace window this stale RT
    // will 401 and the client must re-login. This keeps the wire
    // contract stable and avoids re-rotating in a way that would
    // ping-pong the "current" slot under genuine concurrency. Single-
    // process clients (mobile/web) eliminate the concurrency at the
    // source via single-flight refresh; this branch is the cross-
    // process / cross-device safety net only.
    if (!session) {
      const previousSession =
        await UserSessionRepository.findByPreviousRefreshTokenHash(
          currentRefreshTokenHash
        );
      if (
        previousSession &&
        Number(previousSession.status) === 0 &&
        previousSession.previous_refresh_rotated_at &&
        Date.now() - previousSession.previous_refresh_rotated_at.getTime() <=
          config.auth.refreshGraceSeconds * 1000
      ) {
        const user = await UserRepository.findById(previousSession.user_id);
        if (
          user &&
          !user.is_deleted &&
          Number(user.status) === 0 &&
          previousSession.access_jti
        ) {
          await this.recordAudit(req, {
            userId: previousSession.user_id,
            deviceId: previousSession.device_id ?? null,
            sessionId: previousSession.session_id,
            action: "token.refresh",
            actionStatus: 0,
            details: {
              reason: "refresh_grace_replay"
            }
          });
          getRequestLogger().debug(
            {
              userId: previousSession.user_id,
              deviceId: previousSession.device_id ?? null,
              sessionId: previousSession.session_id,
              reason: "refresh_grace_replay"
            },
            "Refresh grace replay served"
          );
          return this.buildTokenResponse({
            userId: user.id,
            username: user.username,
            nickname: user.nickname,
            deviceId: previousSession.device_id ?? null,
            sessionId: previousSession.session_id,
            accessJti: previousSession.access_jti,
            refreshToken
          });
        }
      }

      await this.recordAudit(req, {
        action: "token.refresh",
        actionStatus: 1,
        details: {
          reason: "refresh_token_not_found"
        }
      });
      getRequestLogger().warn(
        { reason: "refresh_token_not_found" },
        "Refresh token rejected"
      );
      throw new BusinessError("Refresh token is invalid", 401);
    }

    if (Number(session.status) !== 0) {
      await this.recordAudit(req, {
        userId: session.user_id,
        deviceId: session.device_id ?? null,
        sessionId: session.session_id,
        action: "token.refresh",
        actionStatus: 1,
        details: {
          reason: "session_inactive"
        }
      });
      getRequestLogger().warn(
        {
          userId: session.user_id,
          deviceId: session.device_id ?? null,
          sessionId: session.session_id,
          reason: "session_inactive"
        },
        "Refresh token rejected"
      );
      throw new BusinessError("Refresh token is invalid", 401);
    }

    if (session.expires_at.getTime() <= Date.now()) {
      await UserSessionRepository.revokeSession(
        session.session_id,
        "refresh_token_expired",
        2
      );
      await this.recordAudit(req, {
        userId: session.user_id,
        deviceId: session.device_id ?? null,
        sessionId: session.session_id,
        action: "token.refresh",
        actionStatus: 1,
        details: {
          reason: "refresh_token_expired"
        }
      });
      getRequestLogger().warn(
        {
          userId: session.user_id,
          deviceId: session.device_id ?? null,
          sessionId: session.session_id,
          reason: "refresh_token_expired"
        },
        "Refresh token rejected"
      );
      throw new BusinessError("Refresh token has expired", 401);
    }

    if (session.device_id) {
      await this.ensureDeviceAllowedForLogin(
        session.user_id,
        session.device_id
      );
      const device = await UserDeviceRepository.findByUserAndDevice(
        session.user_id,
        session.device_id
      );
      if (!device || Number(device.status) !== 1) {
        await this.recordAudit(req, {
          userId: session.user_id,
          deviceId: session.device_id,
          sessionId: session.session_id,
          action: "token.refresh",
          actionStatus: 1,
          details: {
            reason: "device_inactive"
          }
        });
        getRequestLogger().warn(
          {
            userId: session.user_id,
            deviceId: session.device_id,
            sessionId: session.session_id,
            reason: "device_inactive"
          },
          "Refresh token rejected"
        );
        throw new BusinessError("Device session has been revoked", 401);
      }
    }

    const user = await UserRepository.findById(session.user_id);
    if (!user) {
      throw new BusinessError("User not found", 404);
    }
    if (user.is_deleted || Number(user.status) !== 0) {
      await this.recordAudit(req, {
        userId: session.user_id,
        deviceId: session.device_id ?? null,
        sessionId: session.session_id,
        action: "token.refresh",
        actionStatus: 1,
        details: {
          reason: "user_inactive"
        }
      });
      getRequestLogger().warn(
        {
          userId: session.user_id,
          deviceId: session.device_id ?? null,
          sessionId: session.session_id,
          reason: "user_inactive"
        },
        "Refresh token rejected"
      );
      throw new BusinessError("User account is not active", 403);
    }

    const nextAccessJti = createOpaqueToken(18);
    const nextRefreshToken = createOpaqueToken(48);
    const nextRefreshTokenHash = hashToken(nextRefreshToken);
    const nextExpiresAt = new Date(
      Date.now() + config.auth.refreshTokenTtlSeconds * 1000
    );

    const rotated = await UserSessionRepository.rotateSession(
      session.session_id,
      {
        current_refresh_token_hash: currentRefreshTokenHash,
        refresh_token_hash: nextRefreshTokenHash,
        access_jti: nextAccessJti,
        expires_at: nextExpiresAt,
        last_ip: getRequestIp(req),
        user_agent: getUserAgent(req)
      }
    );
    if (!rotated) {
      throw new BusinessError("Refresh token is invalid", 401);
    }

    await this.recordAudit(req, {
      userId: session.user_id,
      deviceId: session.device_id ?? null,
      sessionId: session.session_id,
      action: "token.refresh",
      actionStatus: 0,
      details: {
        rotated: true
      }
    });

    return this.buildTokenResponse({
      userId: user.id,
      username: user.username,
      nickname: user.nickname,
      deviceId: session.device_id ?? null,
      sessionId: session.session_id,
      accessJti: nextAccessJti,
      refreshToken: nextRefreshToken
    });
  }

  async assertAccessContext(
    payload: Pick<JwtPayload, "userId" | "deviceId" | "sid" | "jti">,
    actualDeviceId?: string
  ) {
    const expectedDeviceId = actualDeviceId ?? payload.deviceId;
    if (
      payload.deviceId &&
      actualDeviceId &&
      payload.deviceId !== actualDeviceId
    ) {
      throw new BusinessError("Device session has been revoked", 401);
    }

    if (expectedDeviceId) {
      const device = await UserDeviceRepository.findByUserAndDevice(
        payload.userId,
        expectedDeviceId
      );
      if (!device || Number(device.status) !== 1) {
        throw new BusinessError("Device session has been revoked", 401);
      }
    }

    if (!payload.sid) {
      return;
    }

    const session = await UserSessionRepository.findBySessionId(payload.sid);
    if (!session || Number(session.user_id) !== Number(payload.userId)) {
      throw new BusinessError("Session has been revoked", 401);
    }
    if (Number(session.status) !== 0) {
      throw new BusinessError("Session has been revoked", 401);
    }
    if (session.expires_at.getTime() <= Date.now()) {
      await UserSessionRepository.revokeSession(
        session.session_id,
        "refresh_token_expired",
        2
      );
      throw new BusinessError("Session has expired", 401);
    }
    if (
      session.access_jti &&
      payload.jti &&
      session.access_jti !== payload.jti
    ) {
      // Grace replay (mirrors the refresh-token grace at L119-175): when
      // a client races multiple in-flight requests around a refresh, the
      // already-rotated previous access_jti remains valid for a short
      // window so that requests issued just before the rotation do not
      // get spuriously 401'd. Single-flight + post-refresh cooldown on
      // the client side eliminates this in normal operation; this branch
      // is the safety net for cross-process / cross-device or jittery
      // network scenarios.
      const inGrace =
        session.previous_access_jti === payload.jti &&
        session.previous_access_rotated_at &&
        Date.now() - session.previous_access_rotated_at.getTime() <=
          config.auth.accessGraceSeconds * 1000;
      if (!inGrace) {
        throw new BusinessError("Session has been superseded", 401);
      }
    }
  }

  async touchAccessContext(
    payload: Pick<JwtPayload, "sid">,
    req: Request | IncomingMessage
  ) {
    if (!payload.sid) {
      return;
    }

    await UserSessionRepository.touchSession(payload.sid, {
      last_ip: getRequestIp(req),
      user_agent: getUserAgent(req)
    }).catch(() => undefined);
  }

  async recordAudit(
    req: Request | IncomingMessage,
    input: {
      userId?: number | null;
      deviceId?: string | null;
      sessionId?: string | null;
      action: string;
      actionStatus: number;
      details?: Record<string, unknown> | null;
    }
  ) {
    await AuthAuditRepository.insert({
      user_id: input.userId ?? null,
      device_id: input.deviceId ?? null,
      session_id: input.sessionId ?? null,
      action: input.action,
      action_status: input.actionStatus,
      ip: getRequestIp(req),
      user_agent: getUserAgent(req),
      details: input.details ?? null
    }).catch(() => undefined);
  }

  private buildTokenResponse(input: {
    userId: number;
    username: string;
    nickname: string;
    deviceId?: string | null;
    sessionId: string;
    accessJti: string;
    refreshToken: string;
  }): LoginResponse {
    const accessToken = jwt.sign(
      {
        username: input.username,
        userId: input.userId,
        nickname: input.nickname,
        device_id: input.deviceId ?? undefined,
        sid: input.sessionId,
        jti: input.accessJti,
        token_type: "access"
      },
      config.SECRET,
      { expiresIn: config.auth.accessTokenTtlSeconds }
    );

    return {
      token: accessToken,
      access_token: accessToken,
      refresh_token: input.refreshToken,
      expires_in: config.auth.accessTokenTtlSeconds,
      refresh_expires_in: config.auth.refreshTokenTtlSeconds
    };
  }
}

export default new AuthService();
