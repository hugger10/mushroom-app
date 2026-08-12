export * from "./auth";
export * from "./controller";
export * from "./device-identity";
export * from "./conversation-blanking";
export * from "./conversation-sync";
export * from "./mappers";
export * from "./storage";
// 注意：`./storage.ts`（legacy KV 抽象）与 `./storage/`（新的 LocalAttachmentStore
// 命名空间）目前并存。前者历史包袱，后者按子模块组织新接口，互不冲突。
// 测试侧 ESM 解析器在 `packages/app-core/test/resolve-ts-extensions.mjs` 中已
// 兼容这种"同名文件 + 同名目录"。后续如把 KV 部分也迁入子目录，可统一为
// `export * from "./storage";` 单条。
export * from "./storage/local-attachment-store";
export { createClientMessageId } from "./controller-internal/internal-helpers";
export * from "./sync";
export * from "./types";
export * from "./version";
