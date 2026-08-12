import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const userSessionRepositoryModule = require("../dist/server/src/repository/user_session_repository.js");

const UserSessionRepository = userSessionRepositoryModule.default;

test("rotateSession guards the update with the current refresh token hash", async () => {
  let capturedQuery = null;
  let capturedParams = null;
  const tx = {
    oneOrNone: async (query, params) => {
      capturedQuery = query;
      capturedParams = params;
      return null;
    }
  };

  await UserSessionRepository.rotateSession(
    "sid-1",
    {
      current_refresh_token_hash: "old-hash",
      refresh_token_hash: "new-hash",
      access_jti: "new-jti",
      expires_at: new Date("2026-04-30T00:00:00.000Z"),
      last_ip: null,
      user_agent: null
    },
    tx
  );

  assert.match(capturedQuery, /AND refresh_token_hash = \$7/);
  assert.equal(capturedParams[6], "old-hash");
});
