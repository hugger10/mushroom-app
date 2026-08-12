import test from "node:test";
import assert from "node:assert/strict";
import {
  CALL_MEDIA_TYPE_AUDIO,
  CALL_MEDIA_TYPE_VIDEO,
  CALL_SCOPE_DIRECT,
  CALL_SCOPE_GROUP,
  CALL_STATUS_ENDED,
  CALL_STATUS_ONGOING,
  buildCallMediaPreparationNotice,
  getCallPhaseFromMessage,
  resolveCallMediaPreparationPlan,
  resolveCallParticipationMode,
  shouldAutoDismissCallSessionForPhase,
  shouldDismissCallSessionAfterMessage,
  shouldLocalUserCreateCallOffer
} from "../dist/index.mjs";

test("getCallPhaseFromMessage prefers explicit terminal event classes", () => {
  assert.equal(
    getCallPhaseFromMessage({
      messageClassify: "call.rejected",
      session: { status: CALL_STATUS_ONGOING }
    }),
    "rejected"
  );
  assert.equal(
    getCallPhaseFromMessage({
      messageClassify: "call.timeout",
      session: { status: CALL_STATUS_ONGOING }
    }),
    "timeout"
  );
  assert.equal(
    getCallPhaseFromMessage({
      messageClassify: "call.ended",
      session: { status: CALL_STATUS_ONGOING }
    }),
    "ongoing"
  );
  assert.equal(
    getCallPhaseFromMessage({
      messageClassify: "call.ended",
      session: { status: CALL_STATUS_ENDED }
    }),
    "ended"
  );
});

test("getCallPhaseFromMessage derives ongoing and ended from session status", () => {
  assert.equal(
    getCallPhaseFromMessage({
      messageClassify: "call.state-sync",
      session: { status: CALL_STATUS_ONGOING }
    }),
    "ongoing"
  );
  assert.equal(
    getCallPhaseFromMessage({
      messageClassify: "call.state-sync",
      session: { status: CALL_STATUS_ENDED }
    }),
    "ended"
  );
});

test("resolveCallParticipationMode maps track availability to the expected mode", () => {
  assert.equal(resolveCallParticipationMode(true, true), "audio_video");
  assert.equal(resolveCallParticipationMode(true, false), "audio_only");
  assert.equal(resolveCallParticipationMode(false, true), "video_only");
  assert.equal(resolveCallParticipationMode(false, false), "receive_only");
});

test("buildCallMediaPreparationNotice describes video fallback and receive-only join", () => {
  assert.equal(
    buildCallMediaPreparationNotice(
      CALL_MEDIA_TYPE_VIDEO,
      CALL_MEDIA_TYPE_AUDIO,
      true,
      false,
      "start"
    ),
    "当前摄像头不可用，将改为语音通话发起"
  );
  assert.equal(
    buildCallMediaPreparationNotice(
      CALL_MEDIA_TYPE_AUDIO,
      CALL_MEDIA_TYPE_AUDIO,
      false,
      false,
      "accept"
    ),
    "当前麦克风不可用，将以只听模式接听语音通话"
  );
});

test("resolveCallMediaPreparationPlan blocks audio start when microphone is unavailable", () => {
  const plan = resolveCallMediaPreparationPlan({
    requestedMediaType: CALL_MEDIA_TYPE_AUDIO,
    context: "start",
    localAudioEnabled: false,
    localVideoEnabled: false
  });

  assert.equal(plan.errorMessage, "当前未检测到可用麦克风，无法发起语音通话");
});

test("resolveCallMediaPreparationPlan blocks video start when neither microphone nor camera is available", () => {
  const plan = resolveCallMediaPreparationPlan({
    requestedMediaType: CALL_MEDIA_TYPE_VIDEO,
    context: "start",
    localAudioEnabled: false,
    localVideoEnabled: false
  });

  assert.equal(
    plan.errorMessage,
    "当前未检测到可用麦克风或摄像头，无法发起视频通话"
  );
});

test("resolveCallMediaPreparationPlan downgrades video start to audio when only microphone is available", () => {
  const plan = resolveCallMediaPreparationPlan({
    requestedMediaType: CALL_MEDIA_TYPE_VIDEO,
    context: "start",
    localAudioEnabled: true,
    localVideoEnabled: false
  });

  assert.equal(plan.errorMessage, undefined);
  assert.equal(plan.effectiveMediaType, CALL_MEDIA_TYPE_AUDIO);
  assert.equal(plan.localParticipationMode, "audio_only");
});

test("resolveCallMediaPreparationPlan allows video-only start when microphone is unavailable", () => {
  const plan = resolveCallMediaPreparationPlan({
    requestedMediaType: CALL_MEDIA_TYPE_VIDEO,
    context: "start",
    localAudioEnabled: false,
    localVideoEnabled: true
  });

  assert.equal(plan.errorMessage, undefined);
  assert.equal(plan.effectiveMediaType, CALL_MEDIA_TYPE_VIDEO);
  assert.equal(plan.localParticipationMode, "video_only");
});

test("resolveCallMediaPreparationPlan allows receive-only audio acceptance", () => {
  const plan = resolveCallMediaPreparationPlan({
    requestedMediaType: CALL_MEDIA_TYPE_AUDIO,
    context: "accept",
    localAudioEnabled: false,
    localVideoEnabled: false
  });

  assert.equal(plan.errorMessage, undefined);
  assert.equal(plan.effectiveMediaType, CALL_MEDIA_TYPE_AUDIO);
  assert.equal(plan.localParticipationMode, "receive_only");
});

test("resolveCallMediaPreparationPlan downgrades device-less video acceptance to receive-only audio", () => {
  const plan = resolveCallMediaPreparationPlan({
    requestedMediaType: CALL_MEDIA_TYPE_VIDEO,
    context: "accept",
    localAudioEnabled: false,
    localVideoEnabled: false
  });

  assert.equal(plan.errorMessage, undefined);
  assert.equal(plan.effectiveMediaType, CALL_MEDIA_TYPE_AUDIO);
  assert.equal(plan.localParticipationMode, "receive_only");
});

test("shouldDismissCallSessionAfterMessage keeps non-terminal busy calls open", () => {
  assert.equal(
    shouldDismissCallSessionAfterMessage({
      messageClassify: "call.busy",
      session: { status: CALL_STATUS_ONGOING }
    }),
    false
  );
  assert.equal(
    shouldDismissCallSessionAfterMessage({
      messageClassify: "call.busy",
      session: { status: CALL_STATUS_ENDED }
    }),
    true
  );
});

test("shouldDismissCallSessionAfterMessage dismisses terminal call messages", () => {
  assert.equal(
    shouldDismissCallSessionAfterMessage({
      messageClassify: "call.rejected",
      session: { status: CALL_STATUS_ONGOING }
    }),
    true
  );
  assert.equal(
    shouldDismissCallSessionAfterMessage({
      messageClassify: "call.timeout",
      session: { status: CALL_STATUS_ONGOING }
    }),
    true
  );
  assert.equal(
    shouldDismissCallSessionAfterMessage({
      messageClassify: "call.ended",
      session: { status: CALL_STATUS_ONGOING }
    }),
    false
  );
  assert.equal(
    shouldDismissCallSessionAfterMessage({
      messageClassify: "call.ended",
      session: { status: CALL_STATUS_ENDED }
    }),
    true
  );
});

test("shouldAutoDismissCallSessionForPhase only dismisses terminal phases", () => {
  assert.equal(shouldAutoDismissCallSessionForPhase("ringing"), false);
  assert.equal(shouldAutoDismissCallSessionForPhase("ongoing"), false);
  assert.equal(shouldAutoDismissCallSessionForPhase("busy"), false);
  assert.equal(shouldAutoDismissCallSessionForPhase("rejected"), true);
  assert.equal(shouldAutoDismissCallSessionForPhase("timeout"), true);
  assert.equal(shouldAutoDismissCallSessionForPhase("ended"), true);
});

test("shouldLocalUserCreateCallOffer only allows direct-call initiator to create offers", () => {
  assert.equal(
    shouldLocalUserCreateCallOffer({
      callScope: CALL_SCOPE_DIRECT,
      initiatorUserId: 52,
      localUserId: 52
    }),
    true
  );
  assert.equal(
    shouldLocalUserCreateCallOffer({
      callScope: CALL_SCOPE_DIRECT,
      initiatorUserId: 52,
      localUserId: 88
    }),
    false
  );
  assert.equal(
    shouldLocalUserCreateCallOffer({
      callScope: CALL_SCOPE_GROUP,
      initiatorUserId: 52,
      localUserId: 52
    }),
    false
  );
});
