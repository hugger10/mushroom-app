/**
 * 私聊 HTTP 路径：通过 HTTP 登录两个用户、创建会话；发送阶段走 WS（仅等 ack）。
 *
 * 用法:
 *   pnpm loadtest:http:direct -- alice bob [--count=1000] [--password=123456]
 *     [--start=now-1d] [--yes]
 */
import "./_lib/env";
import { ensureNotProduction, baseUrl, wsBaseUrl, pg } from "./_lib/env";
import {
  parseArgs,
  getNumber,
  getString,
  parseStartTime,
  confirmOrExit
} from "./_lib/cli";
import { ensureUsers, DEFAULT_PASSWORD } from "./_lib/users";
import { ensureLoggedIn, createDirectConversationViaApi } from "./_lib/http";
import { buildSendingPlan } from "./_lib/sequencer";
import { sendPlanOverWs } from "./_lib/ws_sender";

async function main() {
  ensureNotProduction();
  const { positionals, options } = parseArgs();
  if (positionals.length < 2) {
    console.error(
      "用法: seed-direct-http <userA> <userB> [--count=1000] [--password=123456] [--start=now-1d] [--yes]"
    );
    process.exit(1);
  }
  const [usernameA, usernameB] = positionals;
  const count = getNumber(options, "count", 1000);
  const password = getString(options, "password", DEFAULT_PASSWORD);
  const startMs = parseStartTime(
    typeof options.start === "string" ? options.start : "now-1d"
  );

  console.log("[seed-direct-http] config", {
    baseUrl,
    wsBaseUrl,
    users: [usernameA, usernameB],
    count,
    startMs: new Date(startMs).toISOString()
  });
  await confirmOrExit(
    options,
    `将通过 HTTP+WS 在【${usernameA} <-> ${usernameB}】私聊发送 ${count} 条文字消息`
  );

  // 确保用户存在（密码统一）
  await ensureUsers([usernameA, usernameB], password);
  const sessA = await ensureLoggedIn(usernameA, password);
  const sessB = await ensureLoggedIn(usernameB, password);
  console.log("[seed-direct-http] sessions ok", {
    A: sessA.userId,
    B: sessB.userId
  });

  const conv = await createDirectConversationViaApi(sessA, sessB.userId);
  console.log("[seed-direct-http] conversation", conv);

  const plan = buildSendingPlan({
    memberIds: [sessA.userId, sessB.userId],
    count,
    startMs
  });
  await sendPlanOverWs({
    label: "seed-direct-http",
    conversationId: conv.id,
    conversationType: 1,
    sessions: [sessA, sessB],
    plan,
    collectReceiverLatency: false
  });
}

main()
  .catch(err => {
    console.error("[seed-direct-http] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.$pool.end().catch(() => undefined);
  });
