/**
 * 群聊 DB 直插：直接批量 INSERT messages，第一个用户名为群主。
 *
 * 用法:
 *   pnpm loadtest:db:group -- alice bob carol [...] [--count=5000] [--batch=500]
 *     [--name=loadtest-group] [--start=now-7d] [--with-outbox] [--yes]
 */
import "./_lib/env";
import { ensureNotProduction, dbInfo, pg } from "./_lib/env";
import {
  parseArgs,
  getNumber,
  getString,
  getBool,
  parseStartTime,
  confirmOrExit
} from "./_lib/cli";
import { ensureUsers } from "./_lib/users";
import { ensureGroupConversation } from "./_lib/conversations";
import { buildSendingPlan } from "./_lib/sequencer";
import { ProgressLogger } from "./_lib/progress";
import { bulkInsertTextMessages } from "./_lib/db_writer";

async function main() {
  ensureNotProduction();
  const { positionals, options } = parseArgs();
  if (positionals.length < 3) {
    console.error(
      "用法: seed-group-db <owner> <member1> <member2> [...] [--count=5000] [--batch=500] [--name=loadtest-group] [--start=now-7d] [--with-outbox] [--yes]"
    );
    process.exit(1);
  }
  if (positionals.length > 100) {
    console.error("成员数量上限 100");
    process.exit(1);
  }
  const count = getNumber(options, "count", 5000);
  const batch = getNumber(options, "batch", 500);
  const startMs = parseStartTime(
    typeof options.start === "string" ? options.start : "now-7d"
  );
  const withOutbox = getBool(options, "with-outbox", false);
  const name = getString(options, "name", `loadtest-group-${positionals[0]}`);

  console.log("[seed-group-db] config", {
    db: dbInfo(),
    members: positionals,
    count,
    batch,
    name,
    startMs: new Date(startMs).toISOString(),
    withOutbox
  });
  await confirmOrExit(
    options,
    `将向群【${name}】(成员 ${positionals.length} 人) DB 直插 ${count} 条文字消息${withOutbox ? "（含 outbox）" : ""}`
  );

  const users = await ensureUsers(positionals);
  const owner = users[0];
  const others = users.slice(1);
  const conv = await ensureGroupConversation({ owner, members: others, name });
  console.log("[seed-group-db] conversation", conv);

  const memberIds = users.map(u => u.id);
  const nickMap = new Map<number, string>(users.map(u => [u.id, u.nickname]));

  const plan = buildSendingPlan({ memberIds, count, startMs });

  const logger = new ProgressLogger("seed-group-db", count, batch);
  logger.begin();
  const result = await bulkInsertTextMessages({
    conversationId: conv.id,
    conversationType: 2,
    memberUserIds: memberIds,
    memberNicknameMap: nickMap,
    plan,
    batchSize: batch,
    withOutbox,
    onBatchDone: n => logger.tick(n)
  });
  logger.finish({
    conversationId: conv.id,
    finalSequence: result.finalSequence,
    lastInsertedId: result.lastInsertedId
  });
}

main()
  .catch(err => {
    console.error("[seed-group-db] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.$pool.end().catch(() => undefined);
  });
