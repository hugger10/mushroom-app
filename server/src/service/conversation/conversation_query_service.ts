import type {
  ConversationSyncMessage,
  GroupReadMessage,
  SyncCursorToken
} from "@mushroom/shared";
import pg from "../../db/pg";
import { BusinessError } from "../../handler/business_error";
import ConversationCoreRepository, {
  type DbTx
} from "../../repository/conversation/conversation_core_repository";
import ConversationMemberRepository from "../../repository/conversation/conversation_member_repository";
import ConversationReadStateRepository from "../../repository/conversation/conversation_read_state_repository";
import MessageRepository from "../../repository/message_repository";
import PrivacyRepository from "../../repository/privacy_repository";
import type {
  ConversationMemberRecord as ConversationMember,
  ConversationRecord as Conversation
} from "../../repository/models";
import OutboxRepository from "../../repository/outbox_repository";
import { getRequestLogger } from "../../utils/log_context";
import { wsServer } from "../../websocket";

class ConversationQueryService {
  async getConversationById(
    conversationId: string,
    t?: DbTx
  ): Promise<Conversation | null> {
    return ConversationCoreRepository.findById(conversationId, t);
  }

  async getConversations(
    userId: number,
    pageSize: number,
    syncCursor?: SyncCursorToken | null
  ): Promise<Conversation[] | null> {
    return ConversationCoreRepository.findByUser(userId, pageSize, syncCursor);
  }

  async getConversationMembers(
    conversationIds: string | string[],
    t?: DbTx
  ): Promise<ConversationMember[] | []> {
    return ConversationMemberRepository.findMembers(conversationIds, t);
  }

  async markConversationRead(
    userId: number,
    conversationId: string,
    readSeq?: number,
    options?: {
      messageSeq?: number;
      emitOutbox?: boolean;
      memberUserIds?: number[];
      /**
       * 会话类型（1=私聊, 2=群聊）。
       * 调用方若已知（例如来自 getReadFastState），传入可避免在 service 中再查一次。
       * 未传则按 ConversationCoreRepository.findById 的结果回退。
       */
      conversationType?: number;
    }
  ) {
    let conversationMessageSeq = options?.messageSeq;
    let conversationType = options?.conversationType;
    if (
      conversationMessageSeq === undefined ||
      conversationType === undefined
    ) {
      const conversation =
        await ConversationCoreRepository.findById(conversationId);
      if (!conversation) {
        throw new BusinessError("Conversation not found");
      }
      if (conversationMessageSeq === undefined) {
        conversationMessageSeq = Number(conversation.message_seq ?? 0);
      }
      if (conversationType === undefined) {
        conversationType = Number(conversation.type ?? 1);
      }
    }
    const messageSeqUpperBound = Number(conversationMessageSeq ?? 0);
    const isGroup = conversationType === 2;

    const result = await pg.tx(async (t: DbTx) => {
      const targetReadSeq = Math.max(
        0,
        Math.min(readSeq ?? messageSeqUpperBound, messageSeqUpperBound)
      );

      const r = await ConversationReadStateRepository.markConversationRead(t, {
        conversationId,
        userId,
        readSeq: targetReadSeq
      });

      if (!r) {
        throw new BusinessError("User is not a member of this conversation");
      }

      const emitOutbox = options?.emitOutbox ?? true;
      if (emitOutbox) {
        const otherUserIds = (options?.memberUserIds ?? [])
          .map(memberId => Number(memberId))
          .filter(memberId => memberId !== Number(userId));

        await OutboxRepository.insertEvents(t, [
          {
            event_type: "conversation.read",
            target_user_id: userId,
            conversation_id: r.conversation_id,
            payload: {
              messageClassify: "conversation_read",
              conversation_id: r.conversation_id,
              read_seq: r.read_seq,
              unread_count: r.unread_count,
              updated_at: r.updated_at.toISOString()
            }
          }
        ]);

        if (otherUserIds.length > 0) {
          // 1:1 隐私双向失效：若 reader 或 peer 任一方关闭已读回执
          // (read_receipts_visibility=2)，则不下发 conversation.sync 给对端。
          // 群聊（type=2）不在此短路：群已读由非持久化 group_read 帧承载，
          // conversation.sync 仅做未读 / 元数据同步，与隐私无关。
          let allowedTargets = otherUserIds;
          if (!isGroup) {
            const privacyRows = await PrivacyRepository.findManyByUserIds(
              [Number(userId), ...otherUserIds],
              t
            );
            const optedOut = new Set(
              privacyRows
                .filter(p => p.read_receipts_visibility === 2)
                .map(p => Number(p.user_id))
            );
            if (optedOut.has(Number(userId))) {
              allowedTargets = [];
            } else {
              allowedTargets = otherUserIds.filter(id => !optedOut.has(id));
            }
          }

          if (allowedTargets.length > 0) {
            await OutboxRepository.insertEvents(
              t,
              allowedTargets.map(targetUserId => ({
                event_type: "conversation.sync",
                target_user_id: targetUserId,
                conversation_id: r.conversation_id,
                payload: {
                  messageClassify: "conversation_sync" as const,
                  action: "upsert" as const,
                  conversation_id: r.conversation_id
                } satisfies ConversationSyncMessage
              }))
            );
          }
        }
      }

      return r;
    });

    // 群聊：把 (prev_read_seq, new_read_seq] 区间内的每个 sender 作为目标，
    // 发送非持久化 group_read 帧。仅当 reader 隐私允许（read_receipts_visibility != 2）时发送。
    // 离线 sender 错过的帧由 GET /api/conversation/:id/read-state 在重连时补齐。
    if (
      isGroup &&
      result.read_seq > result.previous_read_seq &&
      (options?.emitOutbox ?? true)
    ) {
      this.dispatchGroupReadFanout({
        conversationId: result.conversation_id,
        readerUserId: Number(userId),
        previousReadSeq: result.previous_read_seq,
        newReadSeq: result.read_seq,
        updatedAt: result.updated_at
      }).catch(err => {
        getRequestLogger().warn(
          { err, conversationId: result.conversation_id, readerUserId: userId },
          "group_read fanout failed"
        );
      });
    }

    return result;
  }

  /**
   * 群聊 group_read 扇出（非持久化、fire-and-forget）。
   * - reader 若 read_receipts_visibility = 2 则全量跳过（向所有人都不发）。
   * - 仅向 (prev, new] 区间内出现过的、非 reader 自己的、非已撤回的消息原作者投递。
   * - 不写 outbox：离线 sender 的设备重连后通过 read-state API 补齐。
   */
  async dispatchGroupReadFanout(params: {
    conversationId: string;
    readerUserId: number;
    previousReadSeq: number;
    newReadSeq: number;
    updatedAt: Date;
  }): Promise<void> {
    const readerPrivacy = await PrivacyRepository.findByUserId(
      params.readerUserId
    );
    if (readerPrivacy.read_receipts_visibility === 2) {
      return;
    }

    const senderIds = await MessageRepository.findDistinctSenderIdsInSeqRange(
      pg,
      {
        conversationId: params.conversationId,
        fromSeqExclusive: params.previousReadSeq,
        toSeqInclusive: params.newReadSeq,
        excludeSenderId: params.readerUserId
      }
    );

    if (senderIds.length === 0) {
      return;
    }

    // 过滤双向拉黑：任一方向存在 block 都不投递 group_read
    // - sender 把 reader 拉黑：sender 不应再感知到 reader 的已读
    // - reader 把 sender 拉黑：reader 已对其静默，不该回传任何信号
    const blockedRows = await pg.manyOrNone<{
      blocker_id: string | number;
      blocked_id: string | number;
    }>(
      `SELECT blocker_id::integer AS blocker_id, blocked_id::integer AS blocked_id
       FROM user_blocks
       WHERE (blocker_id = $1 AND blocked_id = ANY($2::bigint[]))
          OR (blocked_id = $1 AND blocker_id = ANY($2::bigint[]))`,
      [params.readerUserId, senderIds]
    );
    const blockedPeerSet = new Set<number>();
    for (const row of blockedRows) {
      const blocker = Number(row.blocker_id);
      const blocked = Number(row.blocked_id);
      blockedPeerSet.add(blocker === params.readerUserId ? blocked : blocker);
    }
    const filteredSenderIds = senderIds.filter(id => !blockedPeerSet.has(id));
    if (filteredSenderIds.length === 0) {
      return;
    }

    // A2 sender 侧隐私 gating：sender 若 read_receipts_visibility = 2，
    // 表示其自身关闭了已读回执，应享对等待遇——其他人的已读信号也不投递给它。
    const senderPrivacyRows =
      await PrivacyRepository.findManyByUserIds(filteredSenderIds);
    const senderOptedOut = new Set(
      senderPrivacyRows
        .filter(p => p.read_receipts_visibility === 2)
        .map(p => Number(p.user_id))
    );
    const allowedSenderIds = filteredSenderIds.filter(
      id => !senderOptedOut.has(id)
    );
    if (allowedSenderIds.length === 0) {
      return;
    }

    const payload: GroupReadMessage = {
      messageClassify: "group_read",
      conversation_id: params.conversationId,
      message_sender_id: 0, // 每个目标具体填充
      reader_user_id: params.readerUserId,
      last_read_seq: params.newReadSeq,
      updated_at: params.updatedAt.toISOString()
    };

    await Promise.allSettled(
      allowedSenderIds.map(senderId =>
        wsServer.dispatchToUser(senderId, {
          ...payload,
          message_sender_id: senderId
        } satisfies GroupReadMessage)
      )
    );
  }
}

export default new ConversationQueryService();
