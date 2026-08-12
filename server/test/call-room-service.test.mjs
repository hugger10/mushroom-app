import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jsonwebtoken = require("jsonwebtoken");
const callRoomServiceModule = require("../dist/server/src/service/call_room_service.js");
const callServiceModule = require("../dist/server/src/service/call_service.js");
const configModule = require("../dist/server/src/utils/config.js");
const wsModule = require("../dist/server/src/websocket/index.js");
const redisModule = require("../dist/server/src/cache/redis.js");

const CallRoomService = callRoomServiceModule.default;
const CallService = callServiceModule.default;
const { buildLiveKitParticipantIdentity } = callRoomServiceModule;
const { normalizeLiveKitServerUrl } = callRoomServiceModule;
const { config } = configModule;
const { wsServer } = wsModule;
const redis = redisModule.getRedis();

const originals = {
  getCallById: CallService.getCallById,
  liveKitUrl: config.call.liveKitUrl,
  liveKitApiKey: config.call.liveKitApiKey,
  liveKitApiSecret: config.call.liveKitApiSecret,
  liveKitTokenTtlSeconds: config.call.liveKitTokenTtlSeconds,
  groupMaxParticipants: config.call.groupMaxParticipants
};

test.afterEach(() => {
  CallService.getCallById = originals.getCallById;
  config.call.liveKitUrl = originals.liveKitUrl;
  config.call.liveKitApiKey = originals.liveKitApiKey;
  config.call.liveKitApiSecret = originals.liveKitApiSecret;
  config.call.liveKitTokenTtlSeconds = originals.liveKitTokenTtlSeconds;
  config.call.groupMaxParticipants = originals.groupMaxParticipants;
});

test.after(async () => {
  try {
    if (wsServer.heartbeatTimer) {
      clearInterval(wsServer.heartbeatTimer);
    }
  } catch (error) {
    void error;
  }
  try {
    if (wsServer.subscriber?.disconnect) {
      wsServer.subscriber.disconnect();
    }
  } catch (error) {
    void error;
  }
  try {
    if (wsServer.wss?.clients) {
      for (const client of wsServer.wss.clients) {
        client.close();
      }
    }
  } catch (error) {
    void error;
  }
  try {
    if (wsServer.wss?.close) {
      wsServer.wss.close();
    }
  } catch (error) {
    void error;
  }
  try {
    redis.disconnect();
  } catch (error) {
    void error;
  }
});

test("getGroupRoomConfig issues a verified LiveKit token for joined group participants", async () => {
  config.call.liveKitUrl = "wss://livekit.example.test";
  config.call.liveKitApiKey = "livekit-key";
  config.call.liveKitApiSecret = "livekit-secret";
  config.call.liveKitTokenTtlSeconds = 7200;
  config.call.groupMaxParticipants = 12;

  CallService.getCallById = async () => ({
    session: {
      call_id: "group-call-1",
      conversation_id: "conv-group-1",
      call_scope: 2,
      media_type: 2,
      status: 3
    },
    participants: [
      {
        user_id: 7,
        device_id: "device-1",
        participant_status: 4
      },
      {
        user_id: 8,
        device_id: "device-2",
        participant_status: 4
      }
    ]
  });

  const result = await CallRoomService.getGroupRoomConfig({
    callId: "group-call-1",
    userId: 7,
    deviceId: "device-1"
  });

  assert.equal(result.provider, "livekit");
  assert.equal(result.server_url, "wss://livekit.example.test");
  assert.equal(result.room_name, "group-call-1");
  assert.equal(result.max_participants, 12);
  assert.equal(
    result.participant_identity,
    buildLiveKitParticipantIdentity("group-call-1", 7, "device-1")
  );

  const decoded = jsonwebtoken.verify(
    result.access_token,
    config.call.liveKitApiSecret
  );
  assert.equal(decoded.iss, "livekit-key");
  assert.equal(
    decoded.sub,
    buildLiveKitParticipantIdentity("group-call-1", 7, "device-1")
  );
  assert.equal(decoded.video.room, "group-call-1");
  assert.equal(decoded.video.roomJoin, true);

  const metadata = JSON.parse(decoded.metadata);
  assert.deepEqual(metadata, {
    call_id: "group-call-1",
    conversation_id: "conv-group-1",
    user_id: 7,
    device_id: "device-1",
    media_type: 2
  });
});

test("getGroupRoomConfig rejects participants that are not joined yet", async () => {
  config.call.liveKitUrl = "wss://livekit.example.test";
  config.call.liveKitApiKey = "livekit-key";
  config.call.liveKitApiSecret = "livekit-secret";

  CallService.getCallById = async () => ({
    session: {
      call_id: "group-call-2",
      conversation_id: "conv-group-2",
      call_scope: 2,
      media_type: 1,
      status: 2
    },
    participants: [
      {
        user_id: 9,
        device_id: "device-9",
        participant_status: 2
      }
    ]
  });

  await assert.rejects(
    () =>
      CallRoomService.getGroupRoomConfig({
        callId: "group-call-2",
        userId: 9,
        deviceId: "device-9"
      }),
    /当前设备尚未接听群通话/
  );
});

test("normalizeLiveKitServerUrl normalizes bare host and http urls for client connect", () => {
  assert.equal(
    normalizeLiveKitServerUrl("118.25.26.5:7880"),
    "ws://118.25.26.5:7880"
  );
  assert.equal(
    normalizeLiveKitServerUrl("http://livekit.example.test"),
    "ws://livekit.example.test"
  );
  assert.equal(
    normalizeLiveKitServerUrl("https://livekit.example.test"),
    "wss://livekit.example.test"
  );
});
