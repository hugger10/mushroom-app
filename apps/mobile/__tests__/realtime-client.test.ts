import type { ChatMessage, MessageErrorMessage } from "@mushroom/shared";
import { MobileRealtimeClient } from "../src/services/realtime";

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Set<(event?: unknown) => void>>();

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
      this.emit("open");
    }, 0);
  }

  addEventListener(type: string, listener: (event?: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event?: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  send(_payload: string) {}

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
    this.emit("close");
    // After close, no more messages should be delivered
    this.onmessage = null;
    this.listeners.clear();
  }

  emitMessage(payload: object) {
    const event = { data: JSON.stringify(payload) };
    this.onmessage?.(event);
    this.emit("message", event);
  }

  private emit(type: string, event?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("MobileRealtimeClient", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  test("sendChatMessage rejects immediately on matching message_error", async () => {
    const client = new MobileRealtimeClient({
      url: "ws://127.0.0.1:9100/ws",
      deviceId: "mobile-test-device",
      getAccessToken: async () => "token",
      onServerMessage: async () => {},
      onConnected: async () => {}
    });

    await client.connect();

    const pending = client.sendChatMessage({
      messageClassify: "chat",
      client_message_id: "client-msg-1",
      client_conversation_id: "client-conv-1",
      server_conversation_id: "server-conv-1",
      server_message_id: "server-msg-1",
      sender_id: 1001,
      type: 1,
      content: { type: 1, text: "hello" },
      sequence: 1,
      status: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } satisfies ChatMessage);

    await new Promise<void>(resolve => {
      setTimeout(() => resolve(), 0);
    });

    const socket = MockWebSocket.instances[0];
    const payload: MessageErrorMessage = {
      messageClassify: "message_error",
      client_message_id: "client-msg-1",
      server_conversation_id: "server-conv-1",
      code: "message_business_error",
      message: "对方已经将你拉黑，无法发送消息",
      timestamp: new Date().toISOString()
    };
    socket.emitMessage(payload);

    await expect(pending).rejects.toThrow("对方已经将你拉黑，无法发送消息");
    client.disconnect();
  });

  test("connect() is a no-op when socket appears OPEN", async () => {
    const onConnected = jest.fn(async () => {});
    const client = new MobileRealtimeClient({
      url: "ws://127.0.0.1:9100/ws",
      deviceId: "mobile-test-device",
      getAccessToken: async () => "token",
      onServerMessage: async () => {},
      onConnected
    });

    await client.connect();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(onConnected).toHaveBeenCalledTimes(1);

    // Calling connect again should NOT create a new socket
    await client.connect();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(onConnected).toHaveBeenCalledTimes(1);

    client.disconnect();
  });

  test("reconnect() tears down existing socket and creates a fresh one", async () => {
    const onConnected = jest.fn(async () => {});
    const client = new MobileRealtimeClient({
      url: "ws://127.0.0.1:9100/ws",
      deviceId: "mobile-test-device",
      getAccessToken: async () => "token",
      onServerMessage: async () => {},
      onConnected
    });

    await client.connect();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(onConnected).toHaveBeenCalledTimes(1);

    const oldSocket = MockWebSocket.instances[0];

    // reconnect() should close the old socket and open a new one
    await client.reconnect();
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(onConnected).toHaveBeenCalledTimes(2);
    expect(oldSocket.readyState).toBe(MockWebSocket.CLOSED);

    client.disconnect();
  });

  test("reconnect() ensures new messages are received on the new socket", async () => {
    const receivedMessages: unknown[] = [];
    const client = new MobileRealtimeClient({
      url: "ws://127.0.0.1:9100/ws",
      deviceId: "mobile-test-device",
      getAccessToken: async () => "token",
      onServerMessage: async msg => {
        receivedMessages.push(msg);
      },
      onConnected: async () => {}
    });

    await client.connect();
    const oldSocket = MockWebSocket.instances[0];

    // Simulate: old socket is dead (network-level) but readyState still OPEN
    // Messages sent to old socket are lost

    await client.reconnect();
    const newSocket = MockWebSocket.instances[1];

    // Simulate peer message arriving on the new socket
    newSocket.emitMessage({
      messageClassify: "chat",
      client_message_id: "msg-from-peer",
      sender_id: 2001,
      content: { type: 1, text: "hello after reconnect" }
    });

    expect(receivedMessages).toHaveLength(1);
    expect(
      (receivedMessages[0] as { client_message_id: string }).client_message_id
    ).toBe("msg-from-peer");

    // Old socket should NOT deliver messages anymore
    oldSocket.emitMessage({
      messageClassify: "chat",
      client_message_id: "stale-msg",
      sender_id: 2001,
      content: { type: 1, text: "ghost message" }
    });
    // The old socket was closed, so onmessage is irrelevant
    // but let's verify the count didn't increase from listener path
    expect(receivedMessages).toHaveLength(1);

    client.disconnect();
  });

  test("status transitions through reconnect cycle", async () => {
    const statuses: string[] = [];
    const client = new MobileRealtimeClient({
      url: "ws://127.0.0.1:9100/ws",
      deviceId: "mobile-test-device",
      getAccessToken: async () => "token",
      onServerMessage: async () => {},
      onConnected: async () => {}
    });

    client.addStatusListener(s => statuses.push(s.status));

    await client.connect();
    // idle -> connecting -> connected
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");

    await client.reconnect();
    // Should go through offline -> connecting -> connected
    expect(statuses.filter(s => s === "connected")).toHaveLength(2);

    client.disconnect();
  });

  test("reconnect() during an in-flight connect() does not open a second socket", async () => {
    let resolveToken!: (value: string) => void;
    const tokenGate = new Promise<string>(resolve => {
      resolveToken = resolve;
    });
    const onConnected = jest.fn(async () => {});
    const client = new MobileRealtimeClient({
      url: "ws://127.0.0.1:9100/ws",
      deviceId: "mobile-test-device",
      getAccessToken: () => tokenGate,
      onServerMessage: async () => {},
      onConnected
    });

    // Initial connect is still awaiting the access token (socket not created).
    const connectPromise = client.connect();
    // A forced reconnect lands inside that window (e.g. AppState "active" right
    // after first login). It must NOT tear down the in-flight connect and open a
    // second same-deviceId socket, otherwise the server terminates one of the two
    // and the two sockets ping-pong forever.
    const reconnectPromise = client.reconnect().catch(() => undefined);
    expect(MockWebSocket.instances).toHaveLength(0);

    resolveToken("token");
    await connectPromise;
    await reconnectPromise;

    // Exactly one socket was ever created.
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(onConnected).toHaveBeenCalledTimes(1);

    client.disconnect();
  });

  test("stale socket close does not clobber the current socket or schedule a reconnect", async () => {
    const received: unknown[] = [];
    const statuses: string[] = [];
    const client = new MobileRealtimeClient({
      url: "ws://127.0.0.1:9100/ws",
      deviceId: "mobile-test-device",
      getAccessToken: async () => "token",
      onServerMessage: async msg => {
        received.push(msg);
      },
      onConnected: async () => {}
    });

    client.addStatusListener(s => statuses.push(s.status));

    await client.connect();
    const staleSocket = MockWebSocket.instances[0];
    // Raw close handler installed by openConnection, before any reconnect wrap.
    const rawClose = staleSocket.onclose as unknown as (event: unknown) => void;

    await client.reconnect();
    const currentSocket = MockWebSocket.instances[1];
    expect(currentSocket).not.toBe(staleSocket);
    expect(statuses[statuses.length - 1]).toBe("connected");

    // A late close frame from the superseded socket (server terminate RST after a
    // same-deviceId replacement). Must not null the current socket, must not stop
    // its heartbeat, and must not schedule another reconnect.
    rawClose.call(staleSocket, { code: 1006, reason: "" });

    // No reconnect was scheduled -> status stays connected, no third socket.
    expect(statuses[statuses.length - 1]).toBe("connected");
    expect(MockWebSocket.instances).toHaveLength(2);

    // The current socket is still the delivery path.
    currentSocket.emitMessage({
      messageClassify: "chat",
      client_message_id: "after-stale-close",
      sender_id: 3001,
      content: { type: 1, text: "still alive" }
    });
    expect(received).toHaveLength(1);
    expect(
      (received[0] as { client_message_id: string }).client_message_id
    ).toBe("after-stale-close");

    client.disconnect();
  });
});
