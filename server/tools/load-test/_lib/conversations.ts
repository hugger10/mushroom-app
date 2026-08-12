/**
 * 会话 ensure 工具：复用 server 内部的服务方法保证幂等创建。
 */
import { pg } from "./env";
import { createDirectConversation } from "../../../src/service/conversation/direct_conversation_service";
import ConversationLifecycleService from "../../../src/service/conversation/conversation_lifecycle_service";
import ConversationMemberService from "../../../src/service/conversation/conversation_member_service";
import type { SeededUser } from "./users";

export interface EnsuredConversation {
  id: string;
  type: 1 | 2;
}

export async function ensureDirectConversation(
  a: SeededUser,
  b: SeededUser
): Promise<EnsuredConversation> {
  const conv = await createDirectConversation(a.id, b.id);
  return { id: String(conv.id), type: 1 };
}

/**
 * 群聊：以 owner_id + name 做幂等查找，找不到则创建。
 * 缺失成员（不算 owner）会通过 addConversationMembers 补齐。
 */
export async function ensureGroupConversation(params: {
  owner: SeededUser;
  members: SeededUser[];
  name: string;
}): Promise<EnsuredConversation> {
  const ownerId = params.owner.id;
  // 查找已有同名群（owner 一致、未删除）
  const existing = await pg.oneOrNone<{ id: string }>(
    `SELECT id::text AS id FROM conversations
     WHERE type = 2 AND owner_id = $1 AND name = $2 AND is_deleted = FALSE
     ORDER BY created_at DESC
     LIMIT 1`,
    [ownerId, params.name]
  );

  if (existing) {
    const conversationId = String(existing.id);
    const memberRows = await pg.manyOrNone<{ user_id: string }>(
      `SELECT user_id::text AS user_id
       FROM conversation_members
       WHERE conversation_id = $1 AND left_at IS NULL`,
      [conversationId]
    );
    const present = new Set(memberRows.map(r => Number(r.user_id)));
    const missing = params.members.filter(m => !present.has(m.id));
    if (missing.length > 0) {
      await ConversationMemberService.addConversationMembers(
        ownerId,
        conversationId,
        missing.map(m => ({
          user_id: m.id,
          role: 0,
          nickname: m.nickname
        }))
      );
    }
    return { id: conversationId, type: 2 };
  }

  const created = await ConversationLifecycleService.createConversation(
    {
      type: 2,
      name: params.name,
      owner_id: ownerId
    } as Parameters<typeof ConversationLifecycleService.createConversation>[0],
    [
      { user_id: ownerId, role: 2, nickname: params.owner.nickname },
      ...params.members
        .filter(m => m.id !== ownerId)
        .map(m => ({ user_id: m.id, role: 0, nickname: m.nickname }))
    ]
  );

  return { id: String(created.id), type: 2 };
}
