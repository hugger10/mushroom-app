/**
 * 清理某个会话的消息相关数据。保留会话壳与成员关系，不删 MinIO 对象。
 *
 * 用法:
 *   pnpm loadtest:cleanup -- <conversation_id> [--yes]
 *
 * 删除范围:
 *   - messages
 *   - message_outbox（按 conversation_id）
 *   - message_user_state（按 conversation 内 message_id 关联）
 *   - message_reactions（按 conversation_id）
 *   - attachment_uploads（按 bound_message_id 关联，仅清记录）
 * 重置:
 *   - conversations.message_seq=0, last_message_id=NULL, last_message_at=NULL
 *   - conversation_user_state: unread_count=0, last_read_seq=0, last_delivered_seq=0
 *   - conversation_members.join_seq=0
 */
import "./_lib/env";
import { ensureNotProduction, dbInfo, pg } from "./_lib/env";
import { parseArgs, confirmOrExit } from "./_lib/cli";

async function main() {
  ensureNotProduction();
  const { positionals, options } = parseArgs();
  if (positionals.length < 1) {
    console.error("用法: cleanup <conversation_id> [--yes]");
    process.exit(1);
  }
  const conversationId = positionals[0];

  const conv = await pg.oneOrNone<{ id: string; type: number; name: string }>(
    "SELECT id::text AS id, type, name FROM conversations WHERE id = $1",
    [conversationId]
  );
  if (!conv) {
    console.error(`会话 ${conversationId} 不存在`);
    process.exit(1);
  }

  const stats = await pg.one<{
    msg_count: string;
    outbox_count: string;
    reaction_count: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM messages WHERE conversation_id = $1) AS msg_count,
       (SELECT COUNT(*) FROM message_outbox WHERE conversation_id = $1) AS outbox_count,
       (SELECT COUNT(*) FROM message_reactions WHERE conversation_id = $1) AS reaction_count`,
    [conversationId]
  );

  console.log("[cleanup] target", { db: dbInfo(), conversation: conv, stats });
  await confirmOrExit(
    options,
    `将清理会话 ${conversationId}（type=${conv.type} name=${conv.name}）的消息相关数据：messages=${stats.msg_count} outbox=${stats.outbox_count} reactions=${stats.reaction_count}`
  );

  await pg.tx(async t => {
    // 1) message_user_state（按 messages 关联）
    await t.none(
      `DELETE FROM message_user_state
       WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = $1)`,
      [conversationId]
    );
    // 2) attachment_uploads（解绑：仅清 bound_message_id 指向本会话消息的记录）
    await t.none(
      `DELETE FROM attachment_uploads
       WHERE bound_message_id IN (SELECT id FROM messages WHERE conversation_id = $1)`,
      [conversationId]
    );
    // 3) message_reactions
    await t.none(`DELETE FROM message_reactions WHERE conversation_id = $1`, [
      conversationId
    ]);
    // 4) message_outbox
    await t.none(`DELETE FROM message_outbox WHERE conversation_id = $1`, [
      conversationId
    ]);
    // 5) messages
    await t.none(`DELETE FROM messages WHERE conversation_id = $1`, [
      conversationId
    ]);
    // 6) 复位 conversations
    await t.none(
      `UPDATE conversations
       SET message_seq = 0,
           last_message_id = NULL,
           last_message_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [conversationId]
    );
    // 7) 复位 conversation_user_state
    await t.none(
      `UPDATE conversation_user_state
       SET unread_count = 0,
           last_read_seq = 0,
           last_delivered_seq = 0,
           hidden_before_seq = 0,
           updated_at = NOW()
       WHERE conversation_id = $1`,
      [conversationId]
    );
    // 8) 复位 conversation_members.join_seq
    await t.none(
      `UPDATE conversation_members
       SET join_seq = 0
       WHERE conversation_id = $1`,
      [conversationId]
    );
  });

  console.log("[cleanup] done", { conversationId });
}

main()
  .catch(err => {
    console.error("[cleanup] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.$pool.end().catch(() => undefined);
  });
