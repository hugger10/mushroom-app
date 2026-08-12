/**
 * 私聊 DB 直插：跳过 HTTP/WS，直接批量 INSERT messages 并维护指针/未读。
 *
 * 用法:
 *   pnpm loadtest:db:direct -- alice bob [--count=5000] [--batch=500]
 *     [--start=now-7d] [--with-outbox] [--yes]
 */
import "./_lib/env";
import { ensureNotProduction, dbInfo, pg } from "./_lib/env";
import {
  parseArgs,
  getNumber,
  getBool,
  parseStartTime,
  confirmOrExit
} from "./_lib/cli";
import { ensureUsers } from "./_lib/users";
import { ensureDirectConversation } from "./_lib/conversations";
import { buildSendingPlan } from "./_lib/sequencer";
import { ProgressLogger } from "./_lib/progress";
import { bulkInsertTextMessages } from "./_lib/db_writer";

async function main() {
  ensureNotProduction();
  const { positionals, options } = parseArgs();
  if (positionals.length < 2) {
    console.error(
      "用法: seed-direct-db <userA> <userB> [--count=5000] [--batch=500] [--start=now-7d] [--with-outbox] [--yes]"
    );
    process.exit(1);
  }
  const [usernameA, usernameB] = positionals;
  const count = getNumber(options, "count", 5000);
  const batch = getNumber(options, "batch", 500);
  const startMs = parseStartTime(
    typeof options.start === "string" ? options.start : "now-7d"
  );
  const withOutbox = getBool(options, "with-outbox", false);

  console.log("[seed-direct-db] config", {
    db: dbInfo(),
    users: [usernameA, usernameB],
    count,
    batch,
    startMs: new Date(startMs).toISOString(),
    withOutbox
  });
  await confirmOrExit(
    options,
    `将向【${usernameA} <-> ${usernameB}】的私聊 DB 直插 ${count} 条文字消息${withOutbox ? "（含 outbox）" : ""}`
  );

  const [a, b] = await ensureUsers([usernameA, usernameB]);
  const conv = await ensureDirectConversation(a, b);
  console.log("[seed-direct-db] conversation", conv);

  const plan = buildSendingPlan({
    memberIds: [a.id, b.id],
    count,
    startMs
  });

  const logger = new ProgressLogger("seed-direct-db", count, batch);
  logger.begin();
  const result = await bulkInsertTextMessages({
    conversationId: conv.id,
    conversationType: 1,
    memberUserIds: [a.id, b.id],
    memberNicknameMap: new Map([
      [a.id, a.nickname],
      [b.id, b.nickname]
    ]),
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
    console.error("[seed-direct-db] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.$pool.end().catch(() => undefined);
  });
