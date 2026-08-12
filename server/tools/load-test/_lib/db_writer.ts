/**
 * 批量插入文字消息的 DB 直插模块。
 *   - 整体一个 pg.tx
 *   - 一次性 UPDATE conversations.message_seq += batchSize 拿到连续 sequence 段
 *   - pgp.helpers.insert 批量 INSERT messages
 *   - 维护 conversations 指针 与 conversation_user_state（unread / last_*_seq）
 *   - 可选写 outbox（chat.message.deliver）
 */
import { generateId } from "../../../src/utils/id_generator";
import { pg, pgp } from "./env";
import type { PlanItem } from "./sequencer";
import { generateText } from "./corpus";

export type TextGenerator = (opts: { mentionCandidates: string[] }) => {
  text: string;
  mentionNicknames: string[];
};

export interface BulkWriteOptions {
  conversationId: string;
  conversationType: 1 | 2;
  /** 会话所有活跃成员；DB 模式按此维护 unread/delivered */
  memberUserIds: number[];
  /** 用于群聊 @ 候选 nickname */
  memberNicknameMap: Map<number, string>;
  plan: PlanItem[];
  batchSize: number;
  withOutbox: boolean;
  onBatchDone?: (insertedInBatch: number) => void;
  /** 文字内容生成器；默认走 corpus.generateText */
  textGenerator?: TextGenerator;
}

interface MessageRow {
  id: string;
  client_message_id: string;
  reply_to_message_id: string | null;
  conversation_id: string;
  sender_id: number;
  type: number;
  content: string; // jsonb stringified
  seq: number;
  created_at: Date;
  updated_at: Date;
}

const messageColumnSet = new pgp.helpers.ColumnSet(
  [
    "id",
    "client_message_id",
    "reply_to_message_id",
    "conversation_id",
    "sender_id",
    "type",
    {
      name: "content",
      mod: ":raw",
      init: c => `'${(c.value as string).replace(/'/g, "''")}'::jsonb`
    },
    "seq",
    "created_at",
    "updated_at"
  ],
  { table: "messages" }
);

const outboxColumnSet = new pgp.helpers.ColumnSet(
  [
    "event_type",
    "message_id",
    "conversation_id",
    "target_user_id",
    "target_device_id",
    {
      name: "payload",
      mod: ":raw",
      init: c => `'${(c.value as string).replace(/'/g, "''")}'::jsonb`
    },
    "status"
  ],
  { table: "message_outbox" }
);

function uuidv4Lite() {
  // 简易 v4：用于 client_message_id；不需要密码学强度
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function bulkInsertTextMessages(opts: BulkWriteOptions) {
  const { plan, batchSize } = opts;
  const textGen: TextGenerator = opts.textGenerator ?? generateText;
  const total = plan.length;
  let inserted = 0;
  let lastInsertedAt: Date | null = null;
  let lastInsertedId: string | null = null;
  let finalSequence = 0;

  for (let offset = 0; offset < total; offset += batchSize) {
    const slice = plan.slice(offset, offset + batchSize);
    const sliceLen = slice.length;

    await pg.tx(async t => {
      // 1) 一次性领取一段 sequence
      const seqRow = await t.one<{ message_seq: string | number }>(
        `UPDATE conversations
         SET message_seq = COALESCE(message_seq, 0) + $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING message_seq`,
        [opts.conversationId, sliceLen]
      );
      const endSeq = Number(seqRow.message_seq);
      const startSeq = endSeq - sliceLen + 1;

      // 2) 构造行
      const rows: MessageRow[] = slice.map((item, i) => {
        const candidates =
          opts.conversationType === 2
            ? Array.from(opts.memberNicknameMap.entries())
                .filter(([uid]) => uid !== item.senderId)
                .map(([, nick]) => nick)
            : [];
        const { text, mentionNicknames } = textGen({
          mentionCandidates: candidates
        });

        const mentions = mentionNicknames
          .map(nick => {
            const found = Array.from(opts.memberNicknameMap.entries()).find(
              ([, n]) => n === nick
            );
            return found ? { user_id: found[0], nickname: found[1] } : null;
          })
          .filter(
            (x): x is { user_id: number; nickname: string } => x !== null
          );

        const content: Record<string, unknown> = { text };
        if (mentions.length > 0) content.mentions = mentions;

        const ts = new Date(item.ts);
        return {
          id: generateId(),
          client_message_id: uuidv4Lite(),
          reply_to_message_id: null,
          conversation_id: opts.conversationId,
          sender_id: item.senderId,
          type: 1,
          content: JSON.stringify(content),
          seq: startSeq + i,
          created_at: ts,
          updated_at: ts
        };
      });

      // 3) 批量 INSERT
      const insertSql = pgp.helpers.insert(rows, messageColumnSet);
      await t.none(insertSql);

      // 4) 更新会话指针
      const lastRow = rows[rows.length - 1];
      await t.none(
        `UPDATE conversations
         SET last_message_id = $2,
             last_message_at = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [opts.conversationId, lastRow.id, lastRow.created_at]
      );

      // 5) 维护 conversation_user_state
      // 计算每个成员在本批中的"非自己发送数"作为未读增量
      const perMemberOtherCount = new Map<number, number>();
      for (const m of opts.memberUserIds) perMemberOtherCount.set(m, 0);
      for (const row of rows) {
        for (const m of opts.memberUserIds) {
          if (m !== row.sender_id) {
            perMemberOtherCount.set(m, (perMemberOtherCount.get(m) ?? 0) + 1);
          }
        }
      }
      const senderIdsInBatch = new Set(rows.map(r => r.sender_id));
      const maxSeq = endSeq;
      for (const memberId of opts.memberUserIds) {
        const otherCount = perMemberOtherCount.get(memberId) ?? 0;
        const isSender = senderIdsInBatch.has(memberId);
        // 发送者：已读追到 maxSeq、unread=0；接收者：unread += otherCount
        await t.none(
          `INSERT INTO conversation_user_state (
             conversation_id, user_id,
             is_pinned, is_muted, is_archived, draft,
             hidden_before_seq, last_read_seq, last_delivered_seq,
             unread_count, peer_id, settings, updated_at
           )
           VALUES ($1, $2, FALSE, FALSE, FALSE, NULL, 0, $3, $4, $5, NULL, NULL, NOW())
           ON CONFLICT (conversation_id, user_id) DO UPDATE SET
             last_delivered_seq = GREATEST(conversation_user_state.last_delivered_seq, EXCLUDED.last_delivered_seq),
             last_read_seq = CASE WHEN $6::boolean THEN GREATEST(conversation_user_state.last_read_seq, $4)
                                  ELSE conversation_user_state.last_read_seq END,
             unread_count = CASE WHEN $6::boolean THEN 0
                                 ELSE conversation_user_state.unread_count + $7 END,
             updated_at = NOW()`,
          [
            opts.conversationId,
            memberId,
            isSender ? maxSeq : 0,
            maxSeq,
            opts.conversationType === 1
              ? (opts.memberUserIds.find(id => id !== memberId) ?? 0)
              : 0,
            isSender,
            otherCount
          ]
        );
      }

      // 6) backfill join_seq for members joined before any message
      await t.none(
        `UPDATE conversation_members
         SET join_seq = $2
         WHERE conversation_id = $1
           AND COALESCE(join_seq, 0) = 0`,
        [opts.conversationId, startSeq]
      );

      // 7) 可选 outbox
      if (opts.withOutbox) {
        const outboxRows: Array<{
          event_type: string;
          message_id: string;
          conversation_id: string;
          target_user_id: number;
          target_device_id: string | null;
          payload: string;
          status: number;
        }> = [];
        for (const row of rows) {
          const payload = JSON.stringify({
            messageClassify: "chat",
            client_message_id: row.client_message_id,
            server_message_id: row.id,
            server_conversation_id: row.conversation_id,
            sender_id: row.sender_id,
            type: row.type,
            content: JSON.parse(row.content),
            sequence: row.seq,
            created_at: row.created_at.toISOString()
          });
          for (const memberId of opts.memberUserIds) {
            outboxRows.push({
              event_type: "chat.message.deliver",
              message_id: row.id,
              conversation_id: row.conversation_id,
              target_user_id: memberId,
              target_device_id: null,
              payload,
              status: 0
            });
          }
        }
        if (outboxRows.length > 0) {
          await t.none(pgp.helpers.insert(outboxRows, outboxColumnSet));
        }
      }

      lastInsertedAt = lastRow.created_at;
      lastInsertedId = lastRow.id;
      finalSequence = maxSeq;
    });

    inserted += sliceLen;
    opts.onBatchDone?.(sliceLen);
  }

  return {
    inserted,
    finalSequence,
    lastInsertedId,
    lastInsertedAt
  };
}
