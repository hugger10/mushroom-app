import type { NitroSQLiteConnection } from "react-native-nitro-sqlite";
import type { MobileDataRepository } from "@mushroom/app-core";
import { getMobileSQLiteConnection } from "../sqlite-connection";
import { runMobileMigrations } from "../migration";
import { createContactRepo } from "./contacts";
import { createConversationRepo } from "./conversations";
import { createGroupReadRepo } from "./group-read";
import { createLifecycleRepo } from "./lifecycle";
import { createMessageRepo } from "./messages";
import { createReactionRepo } from "./reactions";
import { createSnapshotRepo } from "./snapshot";
import { queryRows, type SQLiteRow } from "./queries";
import type { RepoDeps } from "./types";

/**
 * 移动端 SQLite 数据仓库工厂。
 *
 * 重构说明：原 `sqlite-data-repository.ts` 单文件 ~1132 行被按职责拆到
 * `data/repo/`，本入口负责：
 *   1. 构造一次 `RepoDeps`（db / ensureInitialized / runExclusive /
 *      groupReadStateByConversation），保证写串行化通道与群已读缓存全局唯一；
 *   2. 依次调用 6 个子工厂并 `Object.assign` 进同一个 repo 对象；
 *   3. 最后挂上 `createSnapshotRepo`，让它能通过 repo 引用回调
 *      `listRecentMessages` / `listMessages` 等，等价于原文件里的 `this.xxx`。
 *
 * 行为与原文件保持字面一致：所有 SQL、事务边界、`runExclusive` 覆盖范围、
 * `snapshot` 仅加载激活会话的语义均原样保留。群已读高水位现在写入
 * mobile_group_read_states，冷启动可直接回灌会话列表。
 */
export function createSQLiteMobileDataRepository(options?: {
  connection?: NitroSQLiteConnection;
}): MobileDataRepository {
  // 兜底：仅给测试用（test 在 beforeEach 里已调过 openMobileSQLiteForUser）；
  // production 路径走 app-runtime 显式传入的 options.connection。
  const db = options?.connection ?? getMobileSQLiteConnection();
  let initialized = false;
  // 群聊已读高水位（SQLite 持久化 + 进程内热缓存）。
  // 初始化时从 mobile_group_read_states 回灌，运行时由 group-read 子模块维护。
  const groupReadStateByConversation: Record<
    string,
    Record<number, number>
  > = {};

  async function ensureInitialized() {
    if (initialized) {
      return;
    }

    await runMobileMigrations(db);
    const rows = await queryRows<SQLiteRow>(
      db,
      `SELECT server_conversation_id, reader_user_id, last_read_seq
       FROM mobile_group_read_states
       WHERE last_read_seq > 0`
    );
    for (const key of Object.keys(groupReadStateByConversation)) {
      delete groupReadStateByConversation[key];
    }
    for (const row of rows) {
      const conversationId = String(row.server_conversation_id ?? "").trim();
      const readerUserId = Number(row.reader_user_id ?? 0);
      const lastReadSeq = Number(row.last_read_seq ?? 0);
      if (!conversationId || readerUserId <= 0 || lastReadSeq <= 0) {
        continue;
      }
      const bucket = groupReadStateByConversation[conversationId] ?? {};
      bucket[readerUserId] = lastReadSeq;
      groupReadStateByConversation[conversationId] = bucket;
    }
    initialized = true;
  }

  // Serialize all writes to `mobile_messages` (and any method that performs
  // a read-then-write sequence on it) through a single promise chain. This
  // turns the "SELECT existing row" + "INSERT … ON CONFLICT(client_message_id)"
  // pair in `upsertMessages` into a logically atomic step against other
  // writers in the same JS context.
  //
  // Background: the WS realtime path (controller.handleRealtimeChatMessage)
  // and the pull-sync path (runMessageSyncTasks) both funnel into
  // `upsertMessages`, but pull-sync's `enqueueWrite` only serializes within
  // itself. Without this lock, two concurrent inserts of the same
  // `server_message_id` with distinct freshly-minted `client_message_id`s
  // would both pass the PK ON CONFLICT clause and trip the partial UNIQUE
  // index `idx_mobile_messages_server`, surfacing as
  //   UNIQUE constraint failed: mobile_messages.server_message_id
  // inside the `[ws] onServerMessage failed` warning.
  //
  // The chain swallows errors so a single failure cannot poison subsequent
  // writes; the original error still propagates to the caller via `next`.
  let writeChain: Promise<unknown> = Promise.resolve();
  function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = writeChain.then(fn, fn);
    writeChain = next.catch(() => undefined);
    return next;
  }

  const deps: RepoDeps = {
    db,
    ensureInitialized,
    runExclusive,
    groupReadStateByConversation
  };

  // 注意组装顺序：snapshot 子模块依赖 repo 上已存在的 listContacts /
  // listConversations / listMessages / listRecentMessages，所以必须在所有
  // 其它子工厂 Object.assign 完成后再挂载。其它子工厂彼此独立。
  const repo = {
    ...createContactRepo(deps),
    ...createConversationRepo(deps),
    ...createMessageRepo(deps),
    ...createReactionRepo(deps),
    ...createLifecycleRepo(deps),
    ...createGroupReadRepo(deps)
  } as MobileDataRepository;

  Object.assign(repo, createSnapshotRepo(deps, repo));

  return repo;
}
