import { registerSyncCursorHandlers } from "./sync-cursors";
import { registerConversationHandlers } from "./conversations";
import { registerMessagesReadHandlers } from "./messages-read";
import { registerMessagesWriteHandlers } from "./messages-write";
import { registerReactionHandlers } from "./reactions";
import { registerConversationCreateHandler } from "./conversation-create";
import { registerContactHandlers } from "./contacts";
import { registerReadReceiptHandlers } from "./read-receipts";
import { registerOutgoingHandlers } from "./outgoing";
import { registerAttachmentRefsHandlers } from "./attachment-refs";

/**
 * 统一注册所有 `db:*` IPC handler，按领域分组。
 *
 * 顺序说明：本聚合器按「领域」而非「原文件中 ipcMain.handle 出现顺序」
 * 调用。Electron 的 `ipcMain.handle` 内部是 channel→handler 的 Map，
 * 同一 channel 只能注册一次、且注册顺序不影响运行时语义，因此重排是
 * 安全的。少数 handler 在原 `database.ts` 中的物理位置和它所属的领域
 * 不一致（例如 `db:list-server-message-ids` / `db:update-message-attachment`
 * 写在文件尾部，但语义上属于「读消息」「写消息」），这里按职责归组。
 */
export function registerDbIpcHandlers() {
  // 1. sync cursors (3): db:get-lastSyncTime, db:update-lastSyncTime,
  //    db:update-conversationLastSyncSequence
  registerSyncCursorHandlers();

  // 2. conversations (11): db:get-conversation-by-serverId,
  //    db:get-conversations, db:get-backfill-jobs, db:create-conversations,
  //    db:update-conversations, db:update-conversation-state,
  //    db:delete-conversations, db:delete-conversation-locally,
  //    db:clear-conversation-messages, db:mark-history-complete,
  //    db:update-conv-lastMsg
  registerConversationHandlers();

  // 3. messages (read, 9): db:get-messages, db:search-messages,
  //    db:search-all-messages, db:get-message-by-server-id,
  //    db:get-message-context, db:get-conversation-media,
  //    db:get-global-media, db:get-message-collections,
  //    db:list-server-message-ids
  //    注：db:list-server-message-ids 在原文件中物理位置在 reactions
  //    之后（L3245），这里按职责归到「读消息」。
  registerMessagesReadHandlers();

  // 4. messages (write, 7): db:create-messages, db:add-message,
  //    db:update-message-status, db:update-message-state,
  //    db:apply-message-states, db:apply-message-recall,
  //    db:update-message-attachment
  //    注：db:update-message-attachment 在原文件中是最后一个 handler
  //    （L3810，位于 outgoing 之后），这里按职责归到「写消息」。
  registerMessagesWriteHandlers();

  // 5. reactions (5): db:apply-message-reaction,
  //    db:apply-message-reaction-deltas, db:get-reaction-cursor,
  //    db:set-reaction-cursor, db:replace-message-reactions
  registerReactionHandlers();

  // 6. conversation create (1): db:create-conversation
  //    （在原 setupIpcHandlers 中位置就在 reactions 之后，故单独保留）
  registerConversationCreateHandler();

  // 7. contacts (5): db:get-contacts, db:get-blocked-users,
  //    db:create-contacts, db:update-contacts, db:delete-contacts
  registerContactHandlers();

  // 8. read receipts (7): db:mark-conversation-read,
  //    db:apply-conversation-read, db:group-read:apply,
  //    db:group-read:bulk-apply, db:group-read:get,
  //    db:group-read:clear, db:group-read:clear-all
  registerReadReceiptHandlers();

  // 9. outgoing queue (4): db:get-outgoing-messages,
  //    db:queue-outgoing-message, db:update-outgoing-message,
  //    db:delete-outgoing-message
  registerOutgoingHandlers();

  // 10. attachment refs (1): attachments:list-local-refs
  //     —— 启动 sweep 用，扫 messages 表里仍被引用的 outbox 文件路径。
  registerAttachmentRefsHandlers();
}
