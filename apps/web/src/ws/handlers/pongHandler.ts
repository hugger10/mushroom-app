import type { PongMessage } from "../types";

export function handlePongMessage(message: PongMessage) {
  // 这里只是标记收到pong，由 ConnectionManager 处理 pongReceived
  void message;
}
