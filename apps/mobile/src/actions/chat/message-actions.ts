// 本文件已拆分为 `./message/` 子目录下的多个子模块，
// 详见 `./message/index.ts`。此处保留 1 行 re-export，确保
// `apps/mobile/src/actions/chat-actions.ts`、`./voice-actions.ts`
// 以及测试文件 `__tests__/chat-actions.test.ts` / `voice-actions.test.ts`
// 的 import 路径无需改动。
export { createMessageActions } from "./message/index";
