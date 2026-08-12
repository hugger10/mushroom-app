// Facade：保留历史导出路径 `apps/mobile/src/data/sqlite-data-repository`，
// 实际实现已拆分到 `./repo/` 子目录（见 `./repo/index.ts`）。所有外部
// import 无需改动；如需阅读拆分细节请直接看 `./repo/`。
export { createSQLiteMobileDataRepository } from "./repo";
