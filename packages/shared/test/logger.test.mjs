import test from "node:test";
import assert from "node:assert/strict";
import {
  createLogger,
  createConsoleTransport,
  formatRecordLine,
  formatDateOnly,
  compareLogLevel
} from "../dist/logger/index.mjs";

function makeRecordingTransport(name = "rec", level) {
  const records = [];
  return {
    name,
    level,
    records,
    write(record) {
      records.push(record);
    }
  };
}

test("logger writes records to all transports above the configured level", () => {
  const a = makeRecordingTransport("a");
  const b = makeRecordingTransport("b");
  const log = createLogger({ level: "debug", transports: [a, b] });
  log.debug("d");
  log.info("i", { k: 1 });
  log.warn("w");
  log.error("e");
  assert.equal(a.records.length, 4);
  assert.equal(b.records.length, 4);
  assert.equal(a.records[0].level, "debug");
  assert.deepEqual(a.records[1].args, [{ k: 1 }]);
});

test("setLevel filters out lower-priority records", () => {
  const t = makeRecordingTransport();
  const log = createLogger({ level: "debug", transports: [t] });
  log.setLevel("warn");
  log.debug("d");
  log.info("i");
  log.warn("w");
  log.error("e");
  assert.equal(t.records.length, 2);
  assert.equal(t.records[0].level, "warn");
  assert.equal(t.records[1].level, "error");
});

test("transport-specific level overrides logger level", () => {
  const t = makeRecordingTransport("limited", "error");
  const log = createLogger({ level: "debug", transports: [t] });
  log.info("i");
  log.warn("w");
  log.error("e");
  assert.equal(t.records.length, 1);
  assert.equal(t.records[0].level, "error");
});

test("scope() derives a child logger sharing transports and level", () => {
  const t = makeRecordingTransport();
  const log = createLogger({ level: "debug", transports: [t] });
  const a = log.scope("a");
  const ab = a.scope("b");
  a.info("hi");
  ab.warn("yo");
  log.setLevel("warn");
  a.info("filtered out");
  assert.equal(t.records.length, 2);
  assert.equal(t.records[0].scope, "a");
  assert.equal(t.records[1].scope, "a:b");
});

test("transport that throws does not affect other transports", () => {
  const bad = {
    name: "bad",
    write() {
      throw new Error("boom");
    }
  };
  const good = makeRecordingTransport("good");
  const log = createLogger({ level: "debug", transports: [bad, good] });
  log.info("still works");
  assert.equal(good.records.length, 1);
});

test("addTransport/removeTransport mutate transport list", () => {
  const t = makeRecordingTransport("t");
  const log = createLogger({ level: "debug" });
  log.addTransport(t);
  log.info("x");
  assert.equal(t.records.length, 1);
  log.removeTransport("t");
  log.info("y");
  assert.equal(t.records.length, 1);
});

test("flush awaits all transports", async () => {
  let flushed = 0;
  const t = {
    name: "t",
    write() {},
    async flush() {
      await new Promise(r => setTimeout(r, 5));
      flushed += 1;
    }
  };
  const log = createLogger({ level: "debug", transports: [t, t] });
  await log.flush();
  assert.equal(flushed, 2);
});

test("flush ignores failing transports", async () => {
  const bad = {
    name: "bad",
    write() {},
    async flush() {
      throw new Error("boom");
    }
  };
  const log = createLogger({ level: "debug", transports: [bad] });
  await log.flush();
});

test("console transport routes records to console-like object", () => {
  const calls = [];
  const fake = {
    debug: (...args) => calls.push(["debug", ...args]),
    info: (...args) => calls.push(["info", ...args]),
    warn: (...args) => calls.push(["warn", ...args]),
    error: (...args) => calls.push(["error", ...args]),
    log: (...args) => calls.push(["log", ...args])
  };
  const log = createLogger({
    level: "debug",
    transports: [createConsoleTransport({ console: fake })]
  });
  log.scope("svc").info("hello", { a: 1 });
  log.error("boom");
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], "info");
  assert.equal(calls[0][1], "[svc] hello");
  assert.deepEqual(calls[0][2], { a: 1 });
  assert.equal(calls[1][0], "error");
  assert.equal(calls[1][1], "boom");
});

test("formatRecordLine produces stable single-line output", () => {
  const line = formatRecordLine({
    level: "info",
    scope: "scope",
    message: "hello",
    args: [{ k: 1 }, "world"],
    timestamp: new Date("2024-05-21T03:04:05.678Z").getTime()
  });
  assert.match(
    line,
    /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[INFO\] \[scope\] hello /
  );
  assert.ok(line.includes('{"k":1}'));
  assert.ok(line.includes("world"));
});

test("formatDateOnly returns YYYY-MM-DD", () => {
  const s = formatDateOnly(Date.now());
  assert.match(s, /^\d{4}-\d{2}-\d{2}$/);
});

test("compareLogLevel orders levels", () => {
  assert.ok(compareLogLevel("debug", "info") < 0);
  assert.ok(compareLogLevel("warn", "info") > 0);
  assert.equal(compareLogLevel("error", "error"), 0);
});
