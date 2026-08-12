import type { Message } from "../types/models";

export function getLastOwnDeliveredMessageSequence(
  messages: Message[],
  currentUserId?: number | null
) {
  if (!currentUserId) {
    return 0;
  }

  return (
    [...messages]
      .reverse()
      .find(
        message =>
          Number(message.sender_id) === Number(currentUserId) &&
          Number(message.sequence || 0) > 0
      )?.sequence ?? 0
  );
}

export function hasPeerReadMessage(
  peerLastReadSequence?: number | null,
  messageSequence?: number | null
) {
  return (
    Number(messageSequence || 0) > 0 &&
    Number(peerLastReadSequence || 0) >= Number(messageSequence || 0)
  );
}

/**
 * 群聊已读判定策略（仅对消息发送者本人渲染）。
 *
 * 当前策略：群聊中只要至少 1 名其他成员的 last_read_seq >= message.sequence，
 * 就视为"已读"（与 WhatsApp 群聊蓝勾的"≥1 人已读即亮"一致）。
 *
 * 后续若要切换为"全部成员已读"，仅需把策略改为 `coveredCount >= totalOtherCount`。
 *
 * @param messageSequence 消息 sequence
 * @param readByMap (reader_user_id) -> last_read_seq（不含发送者自己）
 * @param senderUserId 发送者 user_id（用于从 map 中排除自己，防御性）
 */
export function isGroupMessageRead(
  messageSequence: number | null | undefined,
  readByMap: Record<number, number> | Map<number, number> | undefined | null,
  senderUserId: number | null | undefined
): boolean {
  const seq = Number(messageSequence || 0);
  if (seq <= 0 || !readByMap) {
    return false;
  }
  const senderId = Number(senderUserId || 0);
  const entries =
    readByMap instanceof Map
      ? Array.from(readByMap.entries())
      : Object.entries(readByMap).map(
          ([k, v]) => [Number(k), Number(v)] as const
        );
  for (const [readerId, lastRead] of entries) {
    if (Number(readerId) === senderId) continue;
    if (Number(lastRead) >= seq) {
      return true;
    }
  }
  return false;
}

/**
 * 统计已读 / 未读人数（用于群消息详情面板）。
 * 仅计入除发送者本人外的成员；未在 readByMap 出现的成员视为未读。
 *
 * @param messageSequence 消息 sequence
 * @param readByMap (reader_user_id) -> last_read_seq
 * @param memberUserIds 群成员 user_id 列表
 * @param senderUserId 发送者 user_id（从总数中扣除）
 */
export function countGroupMessageReaders(
  messageSequence: number | null | undefined,
  readByMap: Record<number, number> | Map<number, number> | undefined | null,
  memberUserIds: ReadonlyArray<number>,
  senderUserId: number | null | undefined
): { readCount: number; totalCount: number } {
  const seq = Number(messageSequence || 0);
  const senderId = Number(senderUserId || 0);
  const otherIds = memberUserIds
    .map(id => Number(id))
    .filter(id => id !== senderId);
  if (seq <= 0 || !readByMap) {
    return { readCount: 0, totalCount: otherIds.length };
  }
  const map: Map<number, number> =
    readByMap instanceof Map
      ? new Map(
          Array.from(readByMap.entries()).map(
            ([k, v]) => [Number(k), Number(v)] as const
          )
        )
      : new Map(
          Object.entries(readByMap).map(
            ([k, v]) => [Number(k), Number(v)] as const
          )
        );
  let readCount = 0;
  for (const id of otherIds) {
    const lastRead = map.get(id) ?? 0;
    if (lastRead >= seq) readCount += 1;
  }
  return { readCount, totalCount: otherIds.length };
}
