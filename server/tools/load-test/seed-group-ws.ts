/**
 * 群聊 WS 路径：HTTP 登录 N 人 + 群主创群；发送阶段走 WS，并采样接收端 chat 下行延时。
 *
 * 用法:
 *   pnpm loadtest:ws:group -- alice bob carol [...] [--count=500]
 *     [--password=123456] [--name=loadtest-group] [--start=now-1h] [--yes]
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
import { ensureLoggedIn, createGroupConversationViaApi } from "./_lib/http";
import { buildSendingPlan } from "./_lib/sequencer";
import { sendPlanOverWs } from "./_lib/ws_sender";

async function main() {
  ensureNotProduction();
  const { positionals, options } = parseArgs();
  if (positionals.length < 3) {
    console.error(
      "用法: seed-group-ws <owner> <member1> <member2> [...] [--count=500] [--password=123456] [--name=loadtest-group] [--start=now-1h] [--yes]"
    );
    process.exit(1);
  }
  if (positionals.length > 100) {
    console.error("成员数量上限 100");
    process.exit(1);
  }
  const count = getNumber(options, "count", 500);
  const password = getString(options, "password", DEFAULT_PASSWORD);
  const name = getString(options, "name", `loadtest-group-${positionals[0]}`);
  const startMs = parseStartTime(
    typeof options.start === "string" ? options.start : "now-1h"
  );

  console.log("[seed-group-ws] config", {
    baseUrl,
    wsBaseUrl,
    members: positionals,
    count,
    name,
    startMs: new Date(startMs).toISOString()
  });
  await confirmOrExit(
    options,
    `将通过 WS 端到端在群【${name}】(成员 ${positionals.length} 人) 发送 ${count} 条文字消息`
  );

  await ensureUsers(positionals, password);
  const sessions = [];
  for (const u of positionals) {
    sessions.push(await ensureLoggedIn(u, password));
  }
  const owner = sessions[0];
  const conv = await createGroupConversationViaApi(
    owner,
    sessions.map(s => s.userId),
    name
  );
  console.log("[seed-group-ws] conversation", conv);

  const plan = buildSendingPlan({
    memberIds: sessions.map(s => s.userId),
    count,
    startMs
  });
  await sendPlanOverWs({
    label: "seed-group-ws",
    conversationId: conv.id,
    conversationType: 2,
    sessions,
    plan,
    collectReceiverLatency: true
  });
}

main()
  .catch(err => {
    console.error("[seed-group-ws] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.$pool.end().catch(() => undefined);
  });
