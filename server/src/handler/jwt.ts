import express from "express";
import jwt, { type VerifyErrors } from "jsonwebtoken";
import { logger } from "../utils/logger";
import { BusinessError } from "./business_error";
import { config } from "../utils/config";
import AuthService from "../service/auth_service";

export type JwtPayload = {
  userId: number;
  iat: number;
  exp: number;
  sub?: number;
  username?: string;
  sid?: string;
  jti?: string;
  token_type?: string;
  deviceId?: string;
  device_id?: string;
};

export function verifyAccessToken(token: string): JwtPayload {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.SECRET) as JwtPayload;
  } catch (error) {
    const err = error as VerifyErrors;
    // Token 校验失败属于日常事件（过期、刷新窗口外重放等），降为 warn，
    // 否则生产环境 error.log 会被刷屏，淹没真正的异常。
    logger.warn(
      { err: err.message, name: err.name },
      "Token verification failed"
    );
    throw new BusinessError("Token verification failed: " + err.message, 403);
  }

  const normalizedPayload: JwtPayload = {
    ...payload,
    userId: Number(payload.userId ?? payload.sub),
    deviceId: payload.deviceId ?? payload.device_id
  };

  if (!Number.isFinite(normalizedPayload.userId)) {
    throw new BusinessError("Invalid token subject", 401);
  }

  if (
    normalizedPayload.token_type &&
    normalizedPayload.token_type !== "access"
  ) {
    throw new BusinessError("Invalid token type", 401);
  }

  return normalizedPayload;
}

export function authenticateToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  void res;
  void (async () => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      throw new BusinessError("not Found token", 401);
    }

    const normalizedPayload = verifyAccessToken(token);

    await AuthService.assertAccessContext(normalizedPayload);
    void AuthService.touchAccessContext(normalizedPayload, req);

    req.JwtPayload = normalizedPayload;
    next();
  })().catch(next);
}
