import type { NitroSQLiteConnection } from "react-native-nitro-sqlite";

/**
 * Repository 各子模块共享的运行时依赖。
 *
 * 由 `index.ts` 的 `createSQLiteMobileDataRepository` 在工厂内**只构造一次**，
 * 然后分发给所有子工厂。子工厂只允许调用、不允许重建：
 *
 * - `db`：当前账号绑定的 NitroSQLite 连接（由 `getMobileSQLiteConnection()` 或显式
 *   `options.connection` 注入）。
 * - `ensureInitialized`：幂等执行 `runMobileMigrations(db)`，所有公开方法的第一句。
 * - `runExclusive`：写串行化通道。**保留与原 `sqlite-data-repository.ts` 完全
 *   一致的覆盖范围**——仅在原本就包了 `runExclusive` 的方法继续使用，不为了
 *   一致性扩散到 reactions / contacts 等无锁路径。
 * - `groupReadStateByConversation`：群已读高水位的 SQLite 持久化 + 进程内热缓存
 *   （`Record<serverConversationId, Record<readerUserId, lastReadSeq>>`），由
 *   group-read 子模块读写，snapshot 子模块只读。
 */
export type RepoDeps = {
  db: NitroSQLiteConnection;
  ensureInitialized(): Promise<void>;
  runExclusive<T>(fn: () => Promise<T>): Promise<T>;
  groupReadStateByConversation: Record<string, Record<number, number>>;
};
