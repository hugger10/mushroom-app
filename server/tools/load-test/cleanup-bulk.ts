/**
 * 清理由 seed-bulk-users 造出来的测试数据。
 *   - 找出所有 username LIKE 'lt_%' 的用户
 *   - 删除其相关的会话（owner 是这些用户的群、direct_conversation_pairs 任一端是这些用户的私聊）
 *   - 删除会话下的全部消息相关数据
 *   - 删除联系人关系（任一端是这些用户）
 *   - 硬删用户（DELETE，因为是测试数据）
 *   - 不动 MinIO 对象
 *
 * 用法:
 *   pnpm --filter @mushroom/server loadtest:cleanup:bulk -- --yes
 *
 * 可通过 USERNAME_PREFIX 环境变量自定义匹配前缀（默认 lt_）。
 */
import "./_lib/env";
import { ensureNotProduction, dbInfo, pg } from "./_lib/env";
import { parseArgs, confirmOrExit } from "./_lib/cli";

const USERNAME_PREFIX = process.env.USERNAME_PREFIX ?? "lt_";

async function main() {
  ensureNotProduction();
  const { options } = parseArgs();

  // 注意：LIKE 中的 _ 是单字符通配符，需转义
  const pattern = USERNAME_PREFIX.replace(/[\\%_]/g, m => `\\${m}`) + "%";

  const userRows = await pg.manyOrNone<{ id: string; username: string }>(
    `SELECT id::text AS id, username FROM users WHERE username LIKE $1 ESCAPE '\\'`,
    [pattern]
  );
  const userIds = userRows.map(r => Number(r.id));

  if (userIds.length === 0) {
    console.log(`[cleanup-bulk] 未找到匹配 ${pattern} 的用户，无需清理`);
    return;
  }

  // 收集相关会话
  const groupConvs = await pg.manyOrNone<{ id: string }>(
    `SELECT id::text AS id FROM conversations
     WHERE type = 2 AND owner_id = ANY($1)`,
    [userIds]
  );
  const directConvs = await pg.manyOrNone<{ id: string }>(
    `SELECT conversation_id::text AS id FROM direct_conversation_pairs
     WHERE user_low_id = ANY($1) OR user_high_id = ANY($1)`,
    [userIds]
  );
  // 还可能有这些用户作为 member 的会话（非 owner）
  const memberConvs = await pg.manyOrNone<{ id: string }>(
    `SELECT DISTINCT conversation_id::text AS id FROM conversation_members
     WHERE user_id = ANY($1)`,
    [userIds]
  );

  const convIdSet = new Set<string>();
  for (const r of groupConvs) convIdSet.add(r.id);
  for (const r of directConvs) convIdSet.add(r.id);
  for (const r of memberConvs) convIdSet.add(r.id);
  const convIds = Array.from(convIdSet);

  console.log("[cleanup-bulk] target", {
    db: dbInfo(),
    pattern,
    users: userIds.length,
    conversations: convIds.length,
    group_convs: groupConvs.length,
    direct_convs: directConvs.length
  });
  await confirmOrExit(
    options,
    `将硬删 ${userIds.length} 个用户、${convIds.length} 个会话及其消息/联系人数据`
  );

  await pg.tx(async t => {
    if (convIds.length > 0) {
      // 1) message_user_state
      await t.none(
        `DELETE FROM message_user_state
         WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ANY($1::bigint[]))`,
        [convIds]
      );
      // 2) attachment_uploads
      await t.none(
        `DELETE FROM attachment_uploads
         WHERE bound_message_id IN (SELECT id FROM messages WHERE conversation_id = ANY($1::bigint[]))`,
        [convIds]
      );
      // 3) message_reactions
      await t.none(
        `DELETE FROM message_reactions WHERE conversation_id = ANY($1::bigint[])`,
        [convIds]
      );
      // 4) message_outbox
      await t.none(
        `DELETE FROM message_outbox WHERE conversation_id = ANY($1::bigint[])`,
        [convIds]
      );
      // 5) messages
      await t.none(
        `DELETE FROM messages WHERE conversation_id = ANY($1::bigint[])`,
        [convIds]
      );
      // 6) conversation_user_state
      await t.none(
        `DELETE FROM conversation_user_state WHERE conversation_id = ANY($1::bigint[])`,
        [convIds]
      );
      // 7) conversation_members
      await t.none(
        `DELETE FROM conversation_members WHERE conversation_id = ANY($1::bigint[])`,
        [convIds]
      );
      // 8) direct_conversation_pairs
      await t.none(
        `DELETE FROM direct_conversation_pairs WHERE conversation_id = ANY($1::bigint[])`,
        [convIds]
      );
      // 9) conversations
      await t.none(`DELETE FROM conversations WHERE id = ANY($1::bigint[])`, [
        convIds
      ]);
    }

    // 10) user_contacts
    await t.none(
      `DELETE FROM user_contacts
       WHERE owner_user_id = ANY($1) OR contact_user_id = ANY($1)`,
      [userIds]
    );

    // 11) user_phone_identity（若有）
    await t.none(`DELETE FROM user_phone_identity WHERE user_id = ANY($1)`, [
      userIds
    ]);

    // 12) users
    await t.none(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
  });

  console.log("[cleanup-bulk] done", {
    deleted_users: userIds.length,
    deleted_conversations: convIds.length
  });
}

main()
  .catch(err => {
    console.error("[cleanup-bulk] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.$pool.end().catch(() => undefined);
  });
