import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const conversationRepositoryModule = require("../dist/server/src/repository/conversation/conversation_core_repository.js");

const ConversationRepository = conversationRepositoryModule.default;

// Repo-level guarantee: updateConversationSettings must do a jsonb merge
// (`||`) so callers can pass a PATCH instead of the full settings object.
// Previously the SQL was `SET settings = $2::jsonb`, which overwrote unrelated
// fields when two concurrent writers (settings vs. announcement) both did a
// read-modify-write on the same row.
test("updateConversationSettings issues a jsonb merge, not a full overwrite", async () => {
  let capturedQuery = null;
  let capturedParams = null;
  const tx = {
    oneOrNone: async (query, params) => {
      capturedQuery = query;
      capturedParams = params;
      return null;
    }
  };

  await ConversationRepository.updateConversationSettings(tx, {
    conversationId: "171132209812475904",
    settings: { mute_all: true }
  });

  // Must use the jsonb merge operator || against the existing settings column.
  assert.match(
    capturedQuery,
    /settings\s*=\s*COALESCE\(\s*settings,\s*'\{\}'::jsonb\s*\)\s*\|\|\s*\$2::jsonb/i,
    "expected jsonb merge SQL, got:\n" + capturedQuery
  );
  // Must NOT be a plain full overwrite.
  assert.doesNotMatch(
    capturedQuery,
    /settings\s*=\s*\$2::jsonb\s*,/i,
    "settings must not be overwritten as a whole jsonb value"
  );
  assert.equal(capturedParams[0], "171132209812475904");
  assert.equal(capturedParams[1], JSON.stringify({ mute_all: true }));
});

// Guarantee: `undefined` fields in a patch must be dropped at the JSON
// boundary so the jsonb merge cannot accidentally erase existing keys.
// JSON.stringify naturally omits `undefined`-valued properties; this test
// pins that behavior so future refactors (e.g. switching to a custom
// serializer) don't silently regress.
test("updateConversationSettings drops undefined fields from the merged patch", async () => {
  let capturedParams = null;
  const tx = {
    oneOrNone: async (_query, params) => {
      capturedParams = params;
      return null;
    }
  };

  await ConversationRepository.updateConversationSettings(tx, {
    conversationId: "171132209812475904",
    settings: {
      mute_all: true,
      invite_permission: undefined,
      profile_edit_permission: undefined
    }
  });

  const serialized = capturedParams[1];
  const parsed = JSON.parse(serialized);
  assert.deepEqual(
    parsed,
    { mute_all: true },
    "undefined fields must not appear in the merged jsonb payload"
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(parsed, "invite_permission"),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(parsed, "profile_edit_permission"),
    false
  );
});
