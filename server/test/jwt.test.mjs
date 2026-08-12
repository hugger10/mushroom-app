import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const authServiceModule = require("../dist/server/src/service/auth_service.js");
const configModule = require("../dist/server/src/utils/config.js");
const jsonwebtoken = require("jsonwebtoken");
const jwtHandlerModule = require("../dist/server/src/handler/jwt.js");
const wsAuthModule = require("../dist/server/src/websocket/auth.js");

const AuthService = authServiceModule.default;
const { config } = configModule;
const { authenticateToken, verifyAccessToken } = jwtHandlerModule;
const { verifyWebSocketToken } = wsAuthModule;

const originalAssertAccessContext = AuthService.assertAccessContext;
const originalTouchAccessContext = AuthService.touchAccessContext;

test.afterEach(() => {
  AuthService.assertAccessContext = originalAssertAccessContext;
  AuthService.touchAccessContext = originalTouchAccessContext;
});

test("authenticateToken normalizes payload and delegates auth context checks", async () => {
  let assertArgs = null;
  let touchArgs = null;

  AuthService.assertAccessContext = async payload => {
    assertArgs = payload;
  };
  AuthService.touchAccessContext = async (payload, req) => {
    touchArgs = { payload, req };
  };

  const token = jsonwebtoken.sign(
    {
      userId: 12,
      username: "alice",
      device_id: "dev-1",
      sid: "sid-1",
      jti: "jti-1",
      token_type: "access"
    },
    config.SECRET,
    { expiresIn: 3600 }
  );

  const req = {
    headers: {
      authorization: `Bearer ${token}`
    }
  };

  await new Promise((resolve, reject) => {
    authenticateToken(req, {}, error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  assert.equal(req.JwtPayload.userId, 12);
  assert.equal(req.JwtPayload.deviceId, "dev-1");
  assert.deepEqual(assertArgs, {
    userId: 12,
    iat: req.JwtPayload.iat,
    exp: req.JwtPayload.exp,
    username: "alice",
    device_id: "dev-1",
    sid: "sid-1",
    jti: "jti-1",
    token_type: "access",
    deviceId: "dev-1"
  });
  assert.equal(touchArgs.payload.sid, "sid-1");
  assert.equal(touchArgs.req, req);
});

test("authenticateToken rejects non-access token types", async () => {
  const token = jsonwebtoken.sign(
    {
      userId: 12,
      username: "alice",
      token_type: "refresh"
    },
    config.SECRET,
    { expiresIn: 3600 }
  );

  await assert.rejects(
    () =>
      new Promise((resolve, reject) => {
        authenticateToken(
          {
            headers: {
              authorization: `Bearer ${token}`
            }
          },
          {},
          error => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          }
        );
      }),
    /Invalid token type/
  );
});

test("verifyWebSocketToken reuses access token validation", () => {
  const token = jsonwebtoken.sign(
    {
      sub: 12,
      username: "alice",
      device_id: "dev-1",
      sid: "sid-1",
      jti: "jti-1",
      token_type: "access"
    },
    config.SECRET,
    { expiresIn: 3600 }
  );

  const auth = verifyWebSocketToken(token);
  assert.equal(auth.userId, 12);
  assert.equal(auth.username, "alice");
  assert.deepEqual(auth.authContext, {
    userId: 12,
    deviceId: "dev-1",
    sid: "sid-1",
    jti: "jti-1"
  });
});

test("verifyAccessToken rejects invalid subjects", () => {
  const token = jsonwebtoken.sign(
    {
      username: "missing-id",
      token_type: "access"
    },
    config.SECRET,
    { expiresIn: 3600 }
  );

  assert.throws(() => verifyAccessToken(token), /Invalid token subject/);
});
