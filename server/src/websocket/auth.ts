import http from "http";
import { parse } from "url";
import { verifyAccessToken } from "../handler/jwt";

export interface WebSocketAuthContext {
  userId: number;
  username: string;
  sessionId?: string;
  authContext: {
    userId: number;
    deviceId?: string;
    sid?: string;
    jti?: string;
  };
}

export function extractAuth(request: http.IncomingMessage) {
  let token: string | undefined;
  let deviceId: string | undefined;

  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (request.url) {
    const parsedUrl = parse(request.url, true);
    token = token ?? (parsedUrl.query.token as string | undefined);
    deviceId = parsedUrl.query.deviceId as string | undefined;
  }

  return { token, deviceId };
}

export function verifyWebSocketToken(token: string): WebSocketAuthContext {
  const payload = verifyAccessToken(token);
  const userId = payload.userId;

  return {
    userId,
    username: payload.username ?? String(userId),
    sessionId: payload.sid,
    authContext: {
      userId,
      deviceId: payload.deviceId ?? payload.device_id,
      sid: payload.sid,
      jti: payload.jti
    }
  };
}
