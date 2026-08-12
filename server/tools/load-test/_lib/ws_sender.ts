/**
 * 通过 WS 顺序发送一组文字消息：发送者按 plan 切换，每条等待 ack。
 * 可选采集 latency 统计与"接收端 chat 下行"延时。
 */
import { randomUUID } from "crypto";
import type { LoginSession } from "./http";
import { connectWs, type WsClient, percentile } from "./ws";
import { generateText } from "./corpus";
import type { PlanItem } from "./sequencer";
import { ProgressLogger } from "./progress";

export interface SendOverWsOptions {
  conversationId: string;
  conversationType: 1 | 2;
  /** 全部参与发送/接收的会话成员 session 集合，必须覆盖 plan 中所有 senderId */
  sessions: LoginSession[];
  plan: PlanItem[];
  /** 是否在每条发送时同时统计"接收端收到 chat 下行"延时（仅 WS 场景使用） */
  collectReceiverLatency: boolean;
  label: string;
  /** ack 等待超时 ms */
  ackTimeoutMs?: number;
  receiverTimeoutMs?: number;
}

export interface SendOverWsResult {
  total: number;
  success: number;
  failed: number;
  ackLatency: {
    p50: number;
    p90: number;
    p99: number;
    max: number;
    avg: number;
  };
  receiverLatency?: {
    samples: number;
    p50: number;
    p90: number;
    p99: number;
    max: number;
    avg: number;
  };
}

function statsOf(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? 0,
    avg: sorted.length > 0 ? sum / sorted.length : 0
  };
}

export async function sendPlanOverWs(
  opts: SendOverWsOptions
): Promise<SendOverWsResult> {
  const ackTimeoutMs = opts.ackTimeoutMs ?? 15_000;
  const receiverTimeoutMs = opts.receiverTimeoutMs ?? 10_000;

  // 建立每个用户的 WS 连接
  const clients = new Map<number, WsClient>();
  for (const sess of opts.sessions) {
    const client = await connectWs(sess);
    clients.set(sess.userId, client);
    console.log(`[${opts.label}] ws connected userId=${sess.userId}`);
  }

  // 昵称映射（用于 mention 候选）
  const nickMap = new Map<number, string>();
  for (const sess of opts.sessions) nickMap.set(sess.userId, sess.nickname);

  const ackLatencies: number[] = [];
  const recvLatencies: number[] = [];
  let success = 0;
  let failed = 0;

  const progress = new ProgressLogger(
    opts.label,
    opts.plan.length,
    Math.max(50, Math.floor(opts.plan.length / 20))
  );
  progress.begin();

  try {
    for (const item of opts.plan) {
      const senderClient = clients.get(item.senderId);
      if (!senderClient) {
        failed += 1;
        continue;
      }
      const cmid = randomUUID();
      const candidates =
        opts.conversationType === 2
          ? Array.from(nickMap.entries())
              .filter(([uid]) => uid !== item.senderId)
              .map(([, n]) => n)
          : [];
      const { text, mentionNicknames } = generateText({
        mentionCandidates: candidates
      });
      const mentions = mentionNicknames
        .map(nick => {
          const found = Array.from(nickMap.entries()).find(
            ([, n]) => n === nick
          );
          return found ? { user_id: found[0], nickname: found[1] } : null;
        })
        .filter((x): x is { user_id: number; nickname: string } => x !== null);
      const content: Record<string, unknown> = { text };
      if (mentions.length > 0) content.mentions = mentions;

      // 接收者（除发送者外），用于采样下行延时（仅采第一个）
      let receiverWaiter: Promise<Record<string, unknown>> | null = null;
      const receiverIds = opts.sessions
        .map(s => s.userId)
        .filter(uid => uid !== item.senderId);
      if (opts.collectReceiverLatency && receiverIds.length > 0) {
        const recv = clients.get(receiverIds[0]);
        if (recv) receiverWaiter = recv.waitForChat(cmid, receiverTimeoutMs);
      }

      const sentAt = Date.now();
      try {
        senderClient.send({
          messageClassify: "chat",
          client_message_id: cmid,
          server_conversation_id: opts.conversationId,
          sender_id: item.senderId,
          type: 1,
          content
        });
        await senderClient.waitForAck(cmid, ackTimeoutMs);
        ackLatencies.push(Date.now() - sentAt);
        if (receiverWaiter) {
          try {
            await receiverWaiter;
            recvLatencies.push(Date.now() - sentAt);
          } catch {
            /* ignore receiver timeout */
          }
        }
        success += 1;
      } catch (err) {
        failed += 1;
        console.warn(
          `[${opts.label}] send failed cmid=${cmid}`,
          (err as Error).message
        );
      }
      progress.tick(1);
    }
  } finally {
    for (const client of clients.values()) await client.close();
  }

  const result: SendOverWsResult = {
    total: opts.plan.length,
    success,
    failed,
    ackLatency: statsOf(ackLatencies)
  };
  if (opts.collectReceiverLatency) {
    result.receiverLatency = {
      samples: recvLatencies.length,
      ...statsOf(recvLatencies)
    };
  }
  progress.finish(result as unknown as Record<string, unknown>);
  return result;
}
