import test from "node:test";
import assert from "node:assert/strict";
import {
  createSystemMessageContent,
  getSystemMessageText
} from "../dist/index.mjs";

test("conversation created system message uses inviter copy (fallback / server-side)", () => {
  const payload = createSystemMessageContent("conversation_created", {
    actor: { user_id: 1, nickname: "Alice" }
  });

  // 服务端落库 / 缺省 fallback 文案与其它 kind 一致，使用中文
  assert.equal(payload.text, "Alice 邀请你加入群聊");
  assert.equal(getSystemMessageText(payload), "Alice 邀请你加入群聊");
});

test("conversation created system message renders via i18n translate", () => {
  const payload = createSystemMessageContent("conversation_created", {
    actor: { user_id: 1, nickname: "Alice" }
  });

  const dict = {
    "systemMessage.conversationCreated": "{{actor}} 邀请你加入群聊",
    "systemMessage.conversationCreatedFallback": "你被邀请加入群聊",
    "systemMessage.defaultActor": "成员"
  };
  const translate = (key, vars) => {
    const tpl = dict[key] ?? key;
    if (!vars) return tpl;
    return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      vars[k] == null ? "" : String(vars[k])
    );
  };

  assert.equal(
    getSystemMessageText(payload, translate),
    "Alice 邀请你加入群聊"
  );
});

test("group_member_removed renders both actor and target via translate", () => {
  const payload = createSystemMessageContent("group_member_removed", {
    actor: { user_id: 1, nickname: "Owner" },
    target: { user_id: 2, nickname: "Bob" }
  });

  const dict = {
    "systemMessage.groupMemberRemoved": "{{target}} 被{{actor}}移出群聊",
    "systemMessage.defaultActor": "成员",
    "systemMessage.defaultTarget": "成员"
  };
  const translate = (key, vars) => {
    const tpl = dict[key] ?? key;
    if (!vars) return tpl;
    return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      vars[k] == null ? "" : String(vars[k])
    );
  };

  assert.equal(getSystemMessageText(payload, translate), "Bob 被Owner移出群聊");
});
