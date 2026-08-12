import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const conversationRepositoryModule = require("../dist/server/src/repository/conversation/conversation_read_state_repository.js");

const ConversationRepository = conversationRepositoryModule.default;

test("applyMessageDeliveryStates uses bigint conversation ids for bulk upsert", async () => {
  let capturedQuery = null;
  let capturedParams = null;
  const tx = {
    none: async (query, params) => {
      capturedQuery = query;
      capturedParams = params;
    }
  };

  await ConversationRepository.applyMessageDeliveryStates(tx, [
    {
      conversation_id: "171132209812475904",
      user_id: 2,
      last_read_seq: 0,
      last_delivered_seq: 8,
      unread_count: 8,
      peer_id: 1,
      settings: null,
      should_unarchive: true,
      clear_draft: true
    }
  ]);

  assert.match(capturedQuery, /\$1::BIGINT\[\]/);
  assert.equal(capturedParams[0][0], "171132209812475904");
  assert.equal(typeof capturedParams[0][0], "string");
});

test("applyMessageDeliveryStates casts string settings payloads to jsonb", async () => {
  let capturedQuery = null;
  let capturedParams = null;
  const tx = {
    none: async (query, params) => {
      capturedQuery = query;
      capturedParams = params;
    }
  };

  await ConversationRepository.applyMessageDeliveryStates(tx, [
    {
      conversation_id: "171132209812475904",
      user_id: 2,
      last_read_seq: 0,
      last_delivered_seq: 8,
      unread_count: 8,
      peer_id: 1,
      settings: JSON.stringify({ mute_all: false }),
      should_unarchive: true,
      clear_draft: true
    }
  ]);

  assert.match(capturedQuery, /incoming\.settings::jsonb/);
  assert.equal(capturedParams[6][0], '{"mute_all":false}');
  assert.equal(typeof capturedParams[6][0], "string");
});
