import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  calculateContiguousSyncSequence,
  calculateTailWindow,
  reconcileProgress,
  normalizeProgress,
  JobScheduler,
  nextBackoffMs,
  reconcileConversation
} = require("../dist/index.js");

test("calculateContiguousSyncSequence advances over a contiguous run", () => {
  assert.equal(calculateContiguousSyncSequence(10, [11, 12, 13]), 13);
});

test("calculateContiguousSyncSequence stops at first gap", () => {
  assert.equal(calculateContiguousSyncSequence(10, [11, 12, 14, 15]), 12);
});

test("calculateContiguousSyncSequence ignores rows <= base", () => {
  assert.equal(calculateContiguousSyncSequence(10, [9, 10, 11]), 11);
});

test("calculateContiguousSyncSequence handles empty list", () => {
  assert.equal(calculateContiguousSyncSequence(7, []), 7);
});

test("calculateTailWindow returns zero-tuple on empty", () => {
  assert.deepEqual(calculateTailWindow([]), {
    tail_loaded_from_seq: 0,
    tail_loaded_to_seq: 0
  });
});

test("calculateTailWindow walks backwards over contiguous run", () => {
  assert.deepEqual(calculateTailWindow([20, 19, 18, 16, 15]), {
    tail_loaded_from_seq: 18,
    tail_loaded_to_seq: 20
  });
});

test("normalizeProgress fills defaults", () => {
  assert.deepEqual(normalizeProgress(null), {
    last_sync_sequence: 0,
    last_server_sequence: 0,
    tail_loaded_from_seq: 0,
    tail_loaded_to_seq: 0,
    local_hidden_before_seq: 0,
    history_complete: 0
  });
});

test("reconcileProgress: empty conversation -> history_complete=1", () => {
  const result = reconcileProgress({
    last_sync_sequence: 0,
    last_server_sequence: 0,
    tail_loaded_from_seq: 0,
    tail_loaded_to_seq: 0,
    local_hidden_before_seq: 0,
    history_complete: 0,
    next_contiguous_sequence: 0,
    observed_server_sequence: 0
  });
  assert.equal(result.history_complete, 1);
  assert.equal(result.needs_backfill, 0);
  assert.equal(result.sync_gap_detected, 0);
});

test("reconcileProgress: server signal reachedHistoryStart converges history_complete", () => {
  // Group-join at seq=100; tail covers 100..120; server says we reached start.
  const result = reconcileProgress({
    last_sync_sequence: 120,
    last_server_sequence: 120,
    tail_loaded_from_seq: 100,
    tail_loaded_to_seq: 120,
    local_hidden_before_seq: 0,
    history_complete: 0,
    next_contiguous_sequence: 120,
    observed_server_sequence: 120,
    reached_history_start: true,
    visible_from_sequence: 100
  });
  assert.equal(result.history_complete, 1);
  assert.equal(result.needs_backfill, 0);
});

test("reconcileProgress: gap detected when server seq ahead of contiguous", () => {
  const result = reconcileProgress({
    last_sync_sequence: 50,
    last_server_sequence: 60,
    tail_loaded_from_seq: 55,
    tail_loaded_to_seq: 60,
    local_hidden_before_seq: 0,
    history_complete: 0,
    next_contiguous_sequence: 50,
    observed_server_sequence: 60
  });
  assert.equal(result.sync_gap_detected, 1);
  assert.equal(result.needs_backfill, 1);
  assert.equal(result.history_complete, 0);
});

test("reconcileProgress: hidden_before_seq pulls history_complete=1 when tail reaches floor", () => {
  const result = reconcileProgress({
    last_sync_sequence: 200,
    last_server_sequence: 200,
    tail_loaded_from_seq: 151,
    tail_loaded_to_seq: 200,
    local_hidden_before_seq: 150,
    history_complete: 0,
    next_contiguous_sequence: 200,
    observed_server_sequence: 200
  });
  assert.equal(result.history_complete, 1);
});

test("nextBackoffMs: ladder", () => {
  assert.equal(nextBackoffMs(1), 30_000);
  assert.equal(nextBackoffMs(2), 120_000);
  assert.equal(nextBackoffMs(3), 600_000);
  assert.equal(nextBackoffMs(4), 3_600_000);
  assert.equal(nextBackoffMs(5), null);
});

test("JobScheduler: coalesces duplicate jobs, takes earlier deadline", () => {
  const sched = new JobScheduler();
  sched.enqueue({
    client_conversation_id: "c1",
    kind: "delta",
    trigger: "fallback-delta",
    not_before_ms: 1_000,
    attempts: 0
  });
  sched.enqueue({
    client_conversation_id: "c1",
    kind: "delta",
    trigger: "ws-gap",
    not_before_ms: 500,
    attempts: 0
  });
  assert.equal(sched.size(), 1);
  const snap = sched.snapshot();
  assert.equal(snap[0].not_before_ms, 500);
  assert.equal(snap[0].trigger, "ws-gap");
});

test("JobScheduler: drainReady returns only due jobs", () => {
  const sched = new JobScheduler();
  sched.enqueue({
    client_conversation_id: "c1",
    kind: "delta",
    trigger: "manual",
    not_before_ms: 100,
    attempts: 0
  });
  sched.enqueue({
    client_conversation_id: "c2",
    kind: "history",
    trigger: "manual",
    not_before_ms: 500,
    attempts: 0
  });
  const ready = sched.drainReady(200);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].client_conversation_id, "c1");
  assert.equal(sched.size(), 1);
});

test("JobScheduler: reschedule applies backoff and gives up after ladder", () => {
  const sched = new JobScheduler();
  const job = {
    client_conversation_id: "c1",
    kind: "delta",
    trigger: "manual",
    not_before_ms: 0,
    attempts: 0
  };
  assert.equal(sched.reschedule(job, 1_000), true);
  assert.equal(sched.snapshot()[0].not_before_ms, 31_000);
  assert.equal(sched.reschedule({ ...job, attempts: 4 }, 1_000), false);
});

test("reconcileConversation: writes back via repository", async () => {
  const writes = [];
  const repo = {
    loadProgress: async () => ({
      last_sync_sequence: 10,
      last_server_sequence: 12,
      tail_loaded_from_seq: 11,
      tail_loaded_to_seq: 12,
      local_hidden_before_seq: 0,
      history_complete: 0
    }),
    listSequencesAscFrom: async () => [11, 12],
    listSequencesDesc: async () => [12, 11],
    saveProgress: async (cid, next) => writes.push({ cid, next }),
    upsertBackfillJob: async cid => writes.push({ upsert: cid })
  };
  const result = await reconcileConversation(repo, "c1", {
    observedServerSequence: 12,
    reachedHistoryStart: true,
    visibleFromSequence: 11
  });
  assert.ok(result);
  assert.equal(result.last_sync_sequence, 12);
  assert.equal(result.history_complete, 1);
  assert.equal(result.needs_backfill, 0);
  assert.equal(writes.length, 1); // only save, no backfill upsert
});

test("reconcileConversation: returns null when no row", async () => {
  const repo = {
    loadProgress: async () => null,
    listSequencesAscFrom: async () => [],
    listSequencesDesc: async () => [],
    saveProgress: async () => {}
  };
  assert.equal(await reconcileConversation(repo, "missing"), null);
});
