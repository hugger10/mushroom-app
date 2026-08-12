/**
 * WebSocket 客户端封装：
 *   - 与服务端建立连接（query 串带 token + deviceId）
 *   - 提供按 client_message_id / messageClassify 等待匹配帧的能力
 *   - 收集所有下行帧用于事后分析
 */
import WebSocket from "ws";
import { wsBaseUrl } from "./env";
import type { LoginSession } from "./http";

export interface WsClient {
  socket: WebSocket;
  session: LoginSession;
  received: Array<Record<string, unknown>>;
  send: (payload: Record<string, unknown>) => void;
  waitForAck: (
    clientMessageId: string,
    timeoutMs?: number
  ) => Promise<{
    sequence: number;
    server_message_id: string;
  }>;
  waitForChat: (
    clientMessageId: string,
    timeoutMs?: number
  ) => Promise<Record<string, unknown>>;
  close: () => Promise<void>;
}

interface PendingAckResolver {
  resolve: (value: { sequence: number; server_message_id: string }) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingChatResolver {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export async function connectWs(session: LoginSession): Promise<WsClient> {
  const url = `${wsBaseUrl}?token=${encodeURIComponent(session.token)}&deviceId=${encodeURIComponent(session.deviceId)}`;
  const socket = new WebSocket(url);
  const received: Array<Record<string, unknown>> = [];
  const pendingAck = new Map<string, PendingAckResolver>();
  const pendingChat = new Map<string, PendingChatResolver>();

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      socket.off("open", onOpen);
      reject(err);
    };
    const onOpen = () => {
      socket.off("error", onError);
      resolve();
    };
    socket.once("open", onOpen);
    socket.once("error", onError);
  });

  socket.on("message", raw => {
    let msg: Record<string, unknown> | null = null;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    received.push(msg);

    const classify = msg.messageClassify as string | undefined;
    const cmid = msg.client_message_id as string | undefined;
    if (classify === "ack" && cmid) {
      const pending = pendingAck.get(cmid);
      if (pending) {
        clearTimeout(pending.timer);
        pendingAck.delete(cmid);
        pending.resolve({
          sequence: Number(msg.sequence ?? 0),
          server_message_id: String(msg.server_message_id ?? "")
        });
      }
    } else if (classify === "chat" && cmid) {
      const pending = pendingChat.get(cmid);
      if (pending) {
        clearTimeout(pending.timer);
        pendingChat.delete(cmid);
        pending.resolve(msg);
      }
    } else if (classify === "message_error" && cmid) {
      const pending = pendingAck.get(cmid);
      if (pending) {
        clearTimeout(pending.timer);
        pendingAck.delete(cmid);
        pending.reject(
          new Error(`message_error: ${String(msg.message ?? msg.code)}`)
        );
      }
    }
  });

  return {
    socket,
    session,
    received,
    send(payload) {
      socket.send(JSON.stringify(payload));
    },
    waitForAck(cmid, timeoutMs = 10_000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingAck.delete(cmid);
          reject(new Error(`等待 ack 超时: ${cmid}`));
        }, timeoutMs);
        pendingAck.set(cmid, { resolve, reject, timer });
      });
    },
    waitForChat(cmid, timeoutMs = 10_000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingChat.delete(cmid);
          reject(new Error(`等待 chat 下行超时: ${cmid}`));
        }, timeoutMs);
        pendingChat.set(cmid, { resolve, reject, timer });
      });
    },
    async close() {
      try {
        socket.close();
      } catch {
        /* noop */
      }
    }
  };
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}
