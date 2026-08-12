// 本文件曾经一口气堆放近 3900 行：DB 生命周期、记录归一化、会话同步
// 辅助、50+ 个 `db:*` IPC handler 全部混在一起。重构后真正的实现已经
// 按职责拆到 `db/` 子目录：
//   - db/connection.ts          DB 句柄生命周期 / 多账号切换 / 启动重试
//   - db/shared.ts              小常量与日志辅助
//   - db/normalizers.ts         contact / conversation / message 行归一化
//   - db/conversation-sync.ts   会话同步进度 / backfill 任务
//   - db/ipc/*.ts               按领域拆开的 IPC handler 注册器
//   - db/ipc/index.ts           汇总 register*Handlers 严格按原顺序调用
//
// 本文件保留为 **门面（facade）**，对外暴露与拆分前完全一致的导出，
// 让 `index.ts` 等调用方继续 `import { ... } from "./database"`。
// 这样可以在不改其他文件的前提下完成纯重构。
//
// 注意：本模块本身**不再有任何运行时副作用**，仅做 re-export。

export {
  closeCurrentDatabase,
  dropAccountDataDir,
  getCurrentDbBaseDir,
  getCurrentUserDbPath,
  getCurrentUserId,
  getDb,
  initDatabaseForUserPublic,
  initializeDatabase,
  retryInitLastLoginUserDb,
  tryInitLastLoginUserDb
} from "./db/connection";

import { registerDbIpcHandlers } from "./db/ipc";

/**
 * 历史 API：以前 `setupIpcHandlers` 是一个上千行的本地函数。
 * 现在改为薄包装，转调按领域拆分后的 `registerDbIpcHandlers`，
 * 调用顺序与拆分前的 `ipcMain.handle` 出现顺序完全一致。
 */
export function setupIpcHandlers() {
  registerDbIpcHandlers();
}
