import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const xiaomiModule = require("../dist/server/src/service/push/xiaomi_push_provider.js");

const resolveXiaomiRegion = xiaomiModule.resolveXiaomiRegion;
const buildXiaomiCliArgs = xiaomiModule.buildXiaomiCliArgs;

test("xiaomi region normalizes canonical values verbatim", () => {
  assert.equal(resolveXiaomiRegion("china"), "china");
  assert.equal(resolveXiaomiRegion("global"), "global");
  assert.equal(resolveXiaomiRegion("europe"), "europe");
  assert.equal(resolveXiaomiRegion("russia"), "russia");
  assert.equal(resolveXiaomiRegion("india"), "india");
});

test("xiaomi region is case-insensitive and trims whitespace", () => {
  assert.equal(resolveXiaomiRegion("China"), "china");
  assert.equal(resolveXiaomiRegion("  GLOBAL  "), "global");
});

test("xiaomi region maps legacy mainland/singapore to china/global", () => {
  assert.equal(resolveXiaomiRegion("mainland"), "china");
  assert.equal(resolveXiaomiRegion("singapore"), "global");
});

test("xiaomi region falls back to china for unknown or empty values", () => {
  assert.equal(resolveXiaomiRegion("antarctica"), "china");
  assert.equal(resolveXiaomiRegion(""), "china");
});

function baseArgs(overrides = {}) {
  return buildXiaomiCliArgs({
    classpath: "/classes:/sdk/*",
    appSecret: "secret",
    packageName: "com.example.app",
    region: "china",
    regId: "reg123",
    title: "title",
    body: "body",
    data: "eyJ0eXBlIjoiY2hhdCJ9",
    messageType: "notification",
    channelId: "",
    templateId: "",
    templateParam: "",
    retries: 1,
    ...overrides
  });
}

test("buildXiaomiCliArgs emits -cp and main class first", () => {
  const args = baseArgs();
  assert.equal(args[0], "-cp");
  assert.equal(args[1], "/classes:/sdk/*");
  assert.equal(args[2], "com.mushroom.push.xiaomi.XiaomiPushCli");
});

test("buildXiaomiCliArgs passes retries as the last arg", () => {
  const args = baseArgs({ retries: 2 });
  assert.equal(args[args.length - 1], "2");
});

test("buildXiaomiCliArgs carries channel/template/param slots", () => {
  const args = baseArgs({
    channelId: "ch1",
    templateId: "M12762",
    templateParam: '{"keywords1":"a"}'
  });
  // order: [cp, classpath, Main, secret, package, region, regId, title, body, data, type, channel, template, param, retries]
  assert.equal(args[11], "ch1");
  assert.equal(args[12], "M12762");
  assert.equal(args[13], '{"keywords1":"a"}');
});
