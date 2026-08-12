import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const conversationRepositoryModule = require("../dist/server/src/repository/conversation/conversation_read_state_repository.js");

const ConversationRepository = conversationRepositoryModule.default;

test("applyMessageDeliveryStates must NOT reset hidden_before_seq on conflict", async () => {
  // Regression: previously the ON CONFLICT branch unconditionally set
  // hidden_before_seq = 0, which wiped the delete-watermark whenever the peer
  // sent a new message after the user soft-deleted the conversation.
  let capturedQuery = null;
  const tx = {
    none: async query => {
      capturedQuery = query;
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

  assert.ok(capturedQuery, "expected query to be issued");
  // The forbidden pattern that caused the bug.
  assert.doesNotMatch(
    capturedQuery,
    /hidden_before_seq\s*=\s*0/,
    "applyMessageDeliveryStates must not reset hidden_before_seq to 0"
  );
  // hidden_before_seq must not appear in the SET clause of the ON CONFLICT.
  const onConflictIdx = capturedQuery.indexOf("ON CONFLICT");
  assert.ok(onConflictIdx >= 0, "expected ON CONFLICT clause");
  const conflictTail = capturedQuery.slice(onConflictIdx);
  assert.doesNotMatch(
    conflictTail,
    /\bhidden_before_seq\s*=/,
    "applyMessageDeliveryStates must leave hidden_before_seq untouched on conflict"
  );
});

test("upsertConversationUserStates monotonically raises hidden_before_seq (never clears)", async () => {
  // Regression: the previous CASE WHEN EXCLUDED.hidden_before_seq = 0 THEN 0
  // branch let any caller passing 0 wipe an existing watermark. Only allow
  // GREATEST() so the value can only move forward.
  let capturedQuery = null;
  const tx = {
    none: async query => {
      capturedQuery = query;
    }
  };

  await ConversationRepository.upsertConversationUserStates(tx, [
    {
      conversation_id: "171132209812475904",
      user_id: 2,
      is_pinned: false,
      is_muted: false,
      is_archived: false,
      draft: null,
      hidden_before_seq: 0,
      last_read_seq: 0,
      last_delivered_seq: 0,
      unread_count: 0,
      peer_id: 1,
      settings: null
    }
  ]);

  assert.ok(capturedQuery, "expected query to be issued");
  const onConflictIdx = capturedQuery.indexOf("ON CONFLICT");
  assert.ok(onConflictIdx >= 0, "expected ON CONFLICT clause");
  const conflictTail = capturedQuery.slice(onConflictIdx);

  // Must not contain the dangerous "= 0 THEN 0" branch.
  assert.doesNotMatch(
    conflictTail,
    /EXCLUDED\.hidden_before_seq\s*=\s*0\s*THEN\s*0/i,
    "upsertConversationUserStates must not clear hidden_before_seq when EXCLUDED is 0"
  );

  // Must use GREATEST to monotonically raise the watermark.
  assert.match(
    conflictTail,
    /hidden_before_seq\s*=\s*GREATEST\(\s*conversation_user_state\.hidden_before_seq\s*,\s*EXCLUDED\.hidden_before_seq\s*\)/i,
    "upsertConversationUserStates must use GREATEST for hidden_before_seq"
  );
});
