import test from "node:test";
import assert from "node:assert/strict";
import {
  computeExponentialBackoffMs,
  getFileMessageKindLabel,
  getMessageSummaryText,
  getConversationContentPreview,
  createSystemMessageContent,
  getMessageMentions,
  getSystemMessageText,
  isAudioFileMessageContent,
  isImageFileMessageContent,
  isVideoFileMessageContent,
  isMentioningAll,
  isMentioningUser,
  normalizeMentionDraft,
  isSystemMessageContent
} from "../dist/index.mjs";

test("computeExponentialBackoffMs grows exponentially and respects cap", () => {
  assert.equal(computeExponentialBackoffMs(0), 1000);
  assert.equal(computeExponentialBackoffMs(1), 2000);
  assert.equal(computeExponentialBackoffMs(2), 4000);
  assert.equal(computeExponentialBackoffMs(20, { maxDelayMs: 10_000 }), 10_000);
});

test("computeExponentialBackoffMs supports custom exponent offset", () => {
  assert.equal(
    computeExponentialBackoffMs(1, {
      baseDelayMs: 2000,
      exponentOffset: -1
    }),
    2000
  );
  assert.equal(
    computeExponentialBackoffMs(2, {
      baseDelayMs: 2000,
      exponentOffset: -1
    }),
    4000
  );
});

test("createSystemMessageContent returns normalized system payload", () => {
  const payload = createSystemMessageContent("message_recalled");
  assert.deepEqual(payload, {
    type: 0,
    kind: "message_recalled",
    text: "消息已撤回"
  });
  assert.equal(isSystemMessageContent(payload), true);
});

test("getSystemMessageText formats group event payloads", () => {
  const payload = createSystemMessageContent("group_member_removed", {
    actor: { user_id: 1, nickname: "管理员" },
    target: { user_id: 2, nickname: "小李" }
  });

  assert.equal(getSystemMessageText(payload), "小李 被管理员移出群聊");
});

test("getSystemMessageText formats group owner transfer payloads", () => {
  const payload = createSystemMessageContent("group_owner_transferred", {
    actor: { user_id: 1, nickname: "老王" },
    target: { user_id: 2, nickname: "小周" }
  });

  assert.equal(getSystemMessageText(payload), "老王 将群主转让给了 小周");
});

test("getSystemMessageText falls back to user ids and default role text", () => {
  const payload = createSystemMessageContent("group_role_updated", {
    target: { user_id: 9 },
    role: ""
  });

  assert.equal(getSystemMessageText(payload), "用户 9 的角色已更新为 成员");
});

test("mention helpers detect explicit and all mentions", () => {
  const content = {
    type: 1,
    text: "@小李 @所有人 开个会",
    mention_all: true,
    mentions: [
      {
        user_id: 2,
        nickname: "小李"
      }
    ]
  };

  assert.deepEqual(getMessageMentions(content), [
    {
      user_id: 2,
      nickname: "小李"
    }
  ]);
  assert.equal(isMentioningAll(content), true);
  assert.equal(isMentioningUser(content, 2), true);
  assert.equal(isMentioningUser(content, 99), true);
});

test("normalizeMentionDraft removes deleted mention metadata", () => {
  const normalized = normalizeMentionDraft(
    "@小李 大家开个会",
    [
      {
        user_id: 2,
        nickname: "小李"
      },
      {
        user_id: 3,
        nickname: "小王"
      },
      {
        user_id: 2,
        nickname: "小李"
      }
    ],
    true
  );

  assert.deepEqual(normalized, {
    mentions: [
      {
        user_id: 2,
        nickname: "小李"
      }
    ],
    mentionAll: false
  });
});

test("normalizeMentionDraft keeps mention all and deduplicates repeated mentions", () => {
  const normalized = normalizeMentionDraft(
    "@所有人 @小李 @小李 明早同步",
    [
      {
        user_id: 2,
        nickname: "小李"
      },
      {
        user_id: 2,
        nickname: "小李"
      }
    ],
    true
  );

  assert.deepEqual(normalized, {
    mentions: [
      {
        user_id: 2,
        nickname: "小李"
      }
    ],
    mentionAll: true
  });
});

test("isSystemMessageContent rejects non-system payloads", () => {
  assert.equal(isSystemMessageContent({ type: 1, text: "hello" }), false);
  assert.equal(isSystemMessageContent({ type: 0 }), false);
  assert.equal(isSystemMessageContent(null), false);
});

test("getConversationContentPreview prioritizes draft over message preview", () => {
  assert.equal(
    getConversationContentPreview({
      type: 1,
      draft: "  待发送草稿  ",
      mention_unread_count: 3,
      last_message_content: { type: 1, text: "正式消息" },
      display_name: "小李"
    }),
    "[草稿] 待发送草稿"
  );
});

test("getConversationContentPreview formats mention and group sender prefix", () => {
  assert.equal(
    getConversationContentPreview({
      type: 2,
      mention_unread_count: 1,
      last_message_content: { type: 1, text: "今晚同步" },
      display_name: "产品组"
    }),
    "[有人@你] 产品组: 今晚同步"
  );
});

test("getConversationContentPreview formats system messages", () => {
  assert.equal(
    getConversationContentPreview({
      type: 2,
      mention_unread_count: 0,
      last_message_content: createSystemMessageContent("group_member_joined", {
        actor: { user_id: 3, nickname: "小周" }
      }),
      display_name: "项目群"
    }),
    "小周 加入了群聊"
  );
});

test("getMessageSummaryText formats file messages", () => {
  assert.equal(
    getMessageSummaryText({
      type: 2,
      name: "需求文档.pdf",
      url: "https://example.com/file.pdf",
      size: 1024,
      mime_type: "application/pdf"
    }),
    "[文件] 需求文档.pdf"
  );
});

test("image file helpers detect image messages and summarize as picture", () => {
  const content = {
    type: 2,
    name: "现场照片.png",
    url: "https://example.com/photo.png",
    size: 2048,
    mime_type: "image/png"
  };

  assert.equal(isImageFileMessageContent(content), true);
  assert.equal(getMessageSummaryText(content), "[图片]");
});

test("media file helpers detect video and audio messages", () => {
  const video = {
    type: 2,
    name: "演示视频.mp4",
    url: "https://example.com/demo.mp4",
    size: 4096,
    mime_type: "video/mp4"
  };
  const audio = {
    type: 2,
    name: "语音留言.m4a",
    url: "https://example.com/voice.m4a",
    size: 1024,
    mime_type: "audio/mp4"
  };

  assert.equal(isVideoFileMessageContent(video), true);
  assert.equal(isAudioFileMessageContent(audio), true);
  assert.equal(getFileMessageKindLabel(video), "视频");
  assert.equal(getFileMessageKindLabel(audio), "音频");
  assert.equal(getMessageSummaryText(video), "[视频]");
  assert.equal(getMessageSummaryText(audio), "[音频]");
});
