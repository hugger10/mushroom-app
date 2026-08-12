import http from "http";
import type { Duplex } from "stream";
import WebSocket, { WebSocketServer } from "ws";
import type {
  AckMessage,
  ClientWsMessage,
  MessageErrorMessage,
  ServerWsMessage
} from "@mushroom/shared";
import { BusinessError } from "../handler/business_error";
import { getRedis } from "../cache/redis";
import AuthService from "../service/auth_service";
import CallService from "../service/call_service";
import MessageService from "../service/message_service";
import UserDeviceService from "../service/user_device_service";
import { config } from "../utils/config";
import logger from "../utils/logger";
import { runWithLogContext, getRequestLogger } from "../utils/log_context";
import { logPayload } from "../utils/payload_logger";
import { randomUUID } from "node:crypto";
import { extractAuth, verifyWebSocketToken } from "./auth";
import { WebSocketCallHandler } from "./call_handler";
import { WebSocketPresenceManager } from "./presence_manager";
import { WebSocketRedisDispatcher } from "./redis_dispatcher";
import type {
  Client,
  ClientRegistry,
  WebSocketDeliveryOptions,
  WebSocketDisconnectOptions
} from "./types";
import { elapsedMs } from "./utils";

const redis = getRedis();

export class WSServer {
  private readonly clients: ClientRegistry = new Map();
  private readonly wss: WebSocketServer;
  private readonly heartbeatCheckInterval =
    config.websocket.heartbeatCheckIntervalMs;
  private readonly heartbeatTimeoutMs = config.websocket.heartbeatTimeoutMs;
  private readonly nodeId = config.server.nodeId;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconcileStarted = false;
  private readonly presenceManager: WebSocketPresenceManager;
  private readonly redisDispatcher: WebSocketRedisDispatcher;
  private readonly callHandler: WebSocketCallHandler;

  constructor() {
    this.wss = new WebSocketServer({
      noServer: true,
      // 限制单帧大小：仅承载控制 / 元数据，不再传输文件本体（走 MinIO presigned）。
      maxPayload: 64 * 1024
    });
    this.presenceManager = new WebSocketPresenceManager(
      this.clients,
      this.nodeId,
      config.websocket.devicePresenceTtlSeconds,
      (userId, data) => this.dispatchToUser(userId, data)
    );
    this.redisDispatcher = new WebSocketRedisDispatcher(
      this.nodeId,
      (userId, data, options) => this.sendToUserLocal(userId, data, options),
      (userId, options) => this.disconnectUserLocalConnections(userId, options)
    );
    this.callHandler = new WebSocketCallHandler(
      config.call.inviteTimeoutSeconds * 1000,
      (userId, data, options) => this.dispatchToUser(userId, data, options),
      userId => this.getOnlineDeviceIds(userId)
    );

    this.wss.on("connection", (ws, request) => {
      this.handleConnection(ws, request);
    });
  }

  public start() {
    this.redisDispatcher.start();
    this.startHeartbeatCheck();
    // 启动期对账：清理本节点遗留的 ghost presence 计数。
    // 仅触发一次；handleUpgrade 也会调用 start()，需做幂等保护。
    if (!this.reconcileStarted) {
      this.reconcileStarted = true;
      void this.presenceManager.reconcileNodeCounter();
    }
  }

  public handleUpgrade(
    req: http.IncomingMessage,
    socket: Duplex,
    head: Buffer
  ) {
    this.start();
    this.wss.handleUpgrade(req, socket, head, ws => {
      this.wss.emit("connection", ws, req);
    });
  }

  public verityTokenFailed(ws: WebSocket, error?: string) {
    ws.send(
      JSON.stringify({
        type: "auth",
        success: false,
        error
      })
    );
  }

  public getStats() {
    let connections = 0;
    for (const userClients of this.clients.values()) {
      connections += userClients.size;
    }

    return {
      nodeId: this.nodeId,
      users: this.clients.size,
      connections,
      redisPublisherStatus: redis.status,
      redisSubscriberStatus: this.redisDispatcher.subscriberStatus
    };
  }

  public async getPresenceSummary(userId: number) {
    return this.presenceManager.getPresenceSummary(userId);
  }

  public async getOnlineDeviceIds(userId: number) {
    return this.presenceManager.getOnlineDeviceIds(userId);
  }

  /**
   * 集群级在线判定（短路返回，仅用于 outbox 重连窗口决策）。
   * 详见 `presence_manager.hasAnyOnlineDevice`。
   */
  public async hasAnyOnlineDevice(userId: number): Promise<boolean> {
    return this.presenceManager.hasAnyOnlineDevice(userId);
  }

  public async close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    await this.callHandler.close();

    for (const userClients of this.clients.values()) {
      for (const client of userClients.values()) {
        client.socket.close(1001, "Server shutting down");
      }
    }

    await new Promise<void>((resolve, reject) => {
      this.wss.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.redisDispatcher.stop();
    this.clients.clear();
  }

  public async dispatchToUser(
    userId: number | string,
    data: ServerWsMessage,
    options?: WebSocketDeliveryOptions
  ) {
    // 主路径：永远先本地直投。绝不依赖 Redis pub/sub —— 后者是 fire-and-forget，
    // 在笔记本休眠 / NAT 超时等场景下 subscriber 会成为僵尸连接，把消息黑洞化。
    const normalizedUserId = Number(userId);
    const localDeliveredCount = Number.isFinite(normalizedUserId)
      ? this.sendToUserLocal(normalizedUserId, data, options)
      : 0;

    // 桥路径：仅多节点部署时通知其他节点投递它们持有的 socket。
    // 单节点模式下 publishOnly 内部直接 no-op。
    if (config.server.multiNode) {
      void this.redisDispatcher.publishOnly(userId, data, options);
    }

    return {
      mode: config.server.multiNode
        ? ("local+broadcast" as const)
        : ("local" as const),
      localDeliveredCount
    };
  }

  public async disconnectUserDevices(
    userId: number | string,
    options?: WebSocketDisconnectOptions
  ) {
    // 同样的本地优先策略：先在本节点立即断开持有的 socket，
    // 多节点时再 publish 控制命令通知其他节点处理它们持有的 socket。
    const normalizedUserId = Number(userId);
    const localDisconnectedCount = Number.isFinite(normalizedUserId)
      ? this.disconnectUserLocalConnections(normalizedUserId, options)
      : 0;

    if (config.server.multiNode) {
      void this.redisDispatcher.publishControlOnly(userId, options);
    }

    return {
      mode: config.server.multiNode
        ? ("local+broadcast" as const)
        : ("local" as const),
      localDisconnectedCount
    };
  }

  private handleConnection(ws: WebSocket, request: http.IncomingMessage) {
    const { token, deviceId } = extractAuth(request);

    if (!deviceId) {
      this.verityTokenFailed(ws, "Unauthorized: No deviceId provided");
      ws.close(1009, "Unauthorized: No deviceId provided");
      return;
    }

    const connState = { closed: false };

    // If token was provided in query/header (legacy), authenticate immediately.
    // Otherwise, wait for an "auth" message from the client.
    if (token) {
      this.initAuthenticatedConnection(ws, request, token, deviceId, connState);
    } else {
      this.initDeferredAuthConnection(ws, request, deviceId, connState);
    }
  }

  /**
   * Complete the WS auth flow once a valid token is available.
   * Shared by both the legacy (query param) and new (auth message) paths.
   */
  private initAuthenticatedConnection(
    ws: WebSocket,
    request: http.IncomingMessage,
    token: string,
    deviceId: string,
    connState: { closed: boolean }
  ) {
    let auth;
    try {
      auth = verifyWebSocketToken(token);
    } catch (error) {
      this.verityTokenFailed(ws, "Unauthorized: Invalid token");
      ws.close(1008, `Unauthorized: Invalid token: ${String(error)}`);
      return;
    }

    const { userId, username, sessionId, authContext } = auth;
    let client: Client | null = null;
    let connectionInitialized = false;

    const connectionReady = (async () => {
      await AuthService.assertAccessContext(authContext, deviceId);
      if (sessionId) {
        void AuthService.touchAccessContext(
          {
            sid: sessionId
          },
          request
        );
      }

      logger.info(
        `New connection: username=>${username}, userId=>${userId}, deviceId=>${deviceId}`
      );

      await UserDeviceService.registerOrRefreshWebSocketDevice(
        userId,
        deviceId,
        request,
        {
          metadata: {
            transport: "websocket"
          }
        }
      );

      await CallService.reconcileDeviceReconnect(userId, deviceId);

      client = {
        id: String(userId),
        userId,
        deviceId,
        socket: ws,
        isAlive: true,
        lastPingTime: Date.now()
      };
      const previousPresence =
        await this.presenceManager.getPresenceSummary(userId);

      let userClients = this.clients.get(String(userId));
      if (!userClients) {
        userClients = new Map<string, Client>();
        this.clients.set(String(userId), userClients);
      }

      // 同 deviceId 重连时，旧 client 可能仍在 map 中（半开 TCP 场景：
      // 旧 socket 在内核层已死，但 close 事件未触发）。如果直接覆盖，旧 socket 会
      // 因不再出现在 map 中而逃过心跳扫描，永远不被 terminate，导致 FD 泄漏 +
      // Redis presence 计数泄漏（hincrby +1 始终未配对 -1）。
      // 因此覆盖前主动清理：
      //   1) 先从 map 移除，让旧 socket 的 close handler（若稍后到达）走 stale 分支；
      //   2) 显式 unregister 旧 client 以清理 Redis 痕迹（presence_manager 支持
      //      显式 client 模式，幂等且不会误删 map 中的新 entry）；
      //   3) 强制 terminate 旧 socket，回收 FD。
      const previous = userClients.get(deviceId);
      if (previous && previous !== client) {
        userClients.delete(deviceId);
        try {
          await this.presenceManager.unregisterClient(userId, deviceId, {
            client: previous,
            logMessage: `Replacing stale connection for ${username} on device ${deviceId} due to same-deviceId reconnect`
          });
        } catch (error) {
          logger.warn(
            { err: error, userId, deviceId },
            "Failed to unregister stale connection during reconnect"
          );
        }
        try {
          previous.socket.terminate();
        } catch (error) {
          logger.warn(
            { err: error, userId, deviceId },
            "Failed to terminate stale socket during reconnect"
          );
        }
        // unregister 内部可能因 userClients.size === 0 把外层 map 中的
        // String(userId) 槽位也删了；这里重新确保槽位存在，避免 set 到孤儿 map。
        const refreshed = this.clients.get(String(userId));
        if (!refreshed) {
          this.clients.set(String(userId), userClients);
        } else if (refreshed !== userClients) {
          userClients = refreshed;
        }
      }

      userClients.set(deviceId, client);
      await this.presenceManager.registerPresence(client);
      void this.presenceManager.broadcastPresenceTransition(
        userId,
        previousPresence.is_online
      );
      connectionInitialized = true;
      return client;
    })();

    void connectionReady.catch(error => {
      logger.error(
        { err: error, userId, deviceId },
        "Failed to initialize websocket connection"
      );
      if (!connState.closed && ws.readyState === WebSocket.OPEN) {
        this.verityTokenFailed(ws, "Unauthorized: Invalid token");
        ws.close(1008, `Unauthorized: Invalid token: ${String(error)}`);
      }
    });

    ws.on("message", rawMessage => {
      // 每条 WS 消息一个独立的 reqId，便于在日志中串起 recv→save→ack→outbox→push。
      const reqId = randomUUID();
      void runWithLogContext({ reqId, userId, deviceId }, () =>
        this.handleMessage({
          ws,
          request,
          rawMessage,
          connectionReady,
          sessionId,
          deviceId
        })
      );
    });

    ws.on("close", (code, reason) => {
      connState.closed = true;
      if (!connectionInitialized || !client) {
        return;
      }
      // 只有当 clients map 中该 deviceId 对应的仍是当前 client 实例时才注销，
      // 避免旧连接的 close 事件误删已重连的新连接注册。
      const currentClients = this.clients.get(String(userId));
      const currentClient = currentClients?.get(deviceId);
      if (currentClient !== client) {
        logger.info(
          `Skipping unregister for stale connection: ${username}, device=${deviceId}. Code: ${code}`
        );
        return;
      }
      void this.presenceManager.unregisterClient(userId, deviceId, {
        logMessage: `Connection closed for ${username} on device ${deviceId}. Code: ${code}, Reason: ${String(
          reason
        )}`
      });
    });

    ws.on("error", error => {
      logger.error(
        { err: error },
        `WebSocket error for ${username} on device ${deviceId}`
      );
      connState.closed = true;
      if (!connectionInitialized || !client) {
        return;
      }
      // 同样校验：避免旧连接的 error 事件误删新连接注册
      const currentClients = this.clients.get(String(userId));
      const currentClient = currentClients?.get(deviceId);
      if (currentClient !== client) {
        logger.info(
          `Skipping unregister for stale error connection: ${username}, device=${deviceId}`
        );
        return;
      }
      void this.presenceManager.unregisterClient(userId, deviceId);
    });
  }

  /**
   * Deferred auth: wait for the client's first "auth" message containing the token.
   * Closes the socket if no auth message arrives within the timeout.
   */
  private initDeferredAuthConnection(
    ws: WebSocket,
    request: http.IncomingMessage,
    deviceId: string,
    connState: { closed: boolean }
  ) {
    const AUTH_TIMEOUT_MS = 10_000;
    let authenticated = false;

    const authTimer = setTimeout(() => {
      if (!authenticated && ws.readyState === WebSocket.OPEN) {
        logger.warn({ deviceId }, "Auth timeout: no auth message received");
        ws.close(1008, "Unauthorized: Auth timeout");
      }
    }, AUTH_TIMEOUT_MS);

    const onClose = () => {
      clearTimeout(authTimer);
      connState.closed = true;
    };
    const onError = () => {
      clearTimeout(authTimer);
      connState.closed = true;
    };

    const messageListener = (rawMessage: WebSocket.RawData) => {
      if (authenticated) return;

      try {
        const data = JSON.parse(String(rawMessage));
        if (data.messageClassify !== "auth" || typeof data.token !== "string") {
          logger.warn(
            { deviceId },
            "Expected auth message as first message, got: " +
              (data.messageClassify ?? "unknown")
          );
          ws.close(1008, "Unauthorized: Expected auth message");
          return;
        }

        authenticated = true;
        clearTimeout(authTimer);

        // Remove deferred-auth listeners before handing off to
        // initAuthenticatedConnection, which registers its own listeners.
        ws.removeListener("message", messageListener);
        ws.removeListener("close", onClose);
        ws.removeListener("error", onError);

        this.initAuthenticatedConnection(
          ws,
          request,
          data.token as string,
          deviceId,
          connState
        );
      } catch {
        ws.close(1008, "Unauthorized: Invalid auth message");
      }
    };

    ws.on("message", messageListener);
    ws.on("close", onClose);
    ws.on("error", onError);
  }

  private async handleMessage(input: {
    ws: WebSocket;
    request: http.IncomingMessage;
    rawMessage: WebSocket.RawData;
    connectionReady: Promise<Client>;
    sessionId?: string;
    deviceId: string;
  }) {
    const receivedAt = process.hrtime.bigint();
    let data: ClientWsMessage | null = null;
    try {
      const activeClient = await input.connectionReady;
      data = JSON.parse(String(input.rawMessage)) as ClientWsMessage;

      if (data.messageClassify === "ping") {
        await this.handlePing(input.ws, input.request, activeClient, {
          sessionId: input.sessionId
        });
        return;
      }

      if (
        await this.tryHandleRealtimeMessage(activeClient, input.deviceId, data)
      ) {
        return;
      }

      if (data.messageClassify !== "chat") {
        return;
      }

      await this.handleChatMessage(
        input.ws,
        input.rawMessage,
        activeClient,
        input.deviceId,
        data,
        receivedAt
      );
    } catch (error) {
      this.handleMessageError(input.ws, data, error);
    }
  }

  private async handlePing(
    ws: WebSocket,
    request: http.IncomingMessage,
    client: Client,
    options?: { sessionId?: string }
  ) {
    client.lastPingTime = Date.now();
    client.isAlive = true;
    void this.presenceManager.refreshPresence(client);
    void this.presenceManager.subscriptions.refreshDeviceTtl(
      client.userId,
      client.deviceId
    );
    void UserDeviceService.touchWebSocketDeviceSeen(
      client.userId,
      client.deviceId,
      request
    );
    if (options?.sessionId) {
      void AuthService.touchAccessContext(
        {
          sid: options.sessionId
        },
        request
      );
    }
    ws.send(JSON.stringify({ messageClassify: "pong" }));
  }

  private async tryHandleRealtimeMessage(
    client: Client,
    deviceId: string,
    data: ClientWsMessage
  ) {
    if (data.messageClassify === "call.invite.request") {
      await this.callHandler.handleCallInvite(client, deviceId, data);
      return true;
    }

    if (data.messageClassify === "call.accept.request") {
      await this.callHandler.handleCallAccept(client, deviceId, data);
      return true;
    }

    if (data.messageClassify === "call.reject.request") {
      await this.callHandler.handleCallReject(client, deviceId, data);
      return true;
    }

    if (data.messageClassify === "call.end.request") {
      await this.callHandler.handleCallEnd(client, deviceId, data);
      return true;
    }

    if (data.messageClassify === "call.media-state.request") {
      await this.callHandler.handleCallMediaState(client, deviceId, data);
      return true;
    }

    if (
      data.messageClassify === "offer" ||
      data.messageClassify === "answer" ||
      data.messageClassify === "ice"
    ) {
      await this.callHandler.handleCallSignal(client, deviceId, data);
      return true;
    }

    if (data.messageClassify === "typing") {
      await this.callHandler.handleTyping(client, data);
      return true;
    }

    if (data.messageClassify === "presence.subscribe") {
      await this.handlePresenceSubscribe(client, deviceId, data);
      return true;
    }

    if (data.messageClassify === "presence.unsubscribe") {
      await this.handlePresenceUnsubscribe(client, deviceId, data);
      return true;
    }

    return false;
  }

  private async handlePresenceSubscribe(
    client: Client,
    deviceId: string,
    data: Extract<ClientWsMessage, { messageClassify: "presence.subscribe" }>
  ) {
    const limit = config.presence.subscribeBatchLimit;
    const ids = Array.isArray(data.user_ids)
      ? data.user_ids.slice(0, limit)
      : [];
    if (ids.length === 0) {
      return;
    }
    await this.presenceManager.subscriptions.subscribe(
      client.userId,
      deviceId,
      ids
    );

    // 立即回推 snapshot 给订阅来源 device
    try {
      const snapshot = await this.presenceManager.buildPresenceSnapshot(
        client.userId,
        ids
      );
      await this.dispatchToUser(client.userId, snapshot, {
        targetDeviceId: deviceId
      });
    } catch (error) {
      logger.warn(
        { err: error, userId: client.userId, deviceId },
        "Failed to build / dispatch presence snapshot"
      );
    }
  }

  private async handlePresenceUnsubscribe(
    client: Client,
    deviceId: string,
    data: Extract<ClientWsMessage, { messageClassify: "presence.unsubscribe" }>
  ) {
    const limit = config.presence.subscribeBatchLimit;
    const ids = Array.isArray(data.user_ids)
      ? data.user_ids.slice(0, limit)
      : [];
    if (ids.length === 0) {
      return;
    }
    await this.presenceManager.subscriptions.unsubscribe(
      client.userId,
      deviceId,
      ids
    );
  }

  private async handleChatMessage(
    ws: WebSocket,
    rawMessage: WebSocket.RawData,
    client: Client,
    deviceId: string,
    chatMessage: Extract<ClientWsMessage, { messageClassify: "chat" }>,
    receivedAt: bigint
  ) {
    logger.debug(
      {
        clientMessageId: chatMessage.client_message_id,
        conversationId: chatMessage.server_conversation_id,
        senderId: chatMessage.sender_id,
        deviceId,
        payloadBytes: Buffer.byteLength(String(rawMessage))
      },
      "Received websocket chat message"
    );

    logPayload(
      {
        scope: "ws.chat.in",
        userId: chatMessage.sender_id,
        conversationId: chatMessage.server_conversation_id,
        messageId: chatMessage.client_message_id,
        classify: "chat"
      },
      chatMessage
    );

    if (chatMessage.server_conversation_id === undefined) {
      throw new Error("server_conversation_id is required");
    }

    if (chatMessage.sender_id !== client.userId) {
      throw new Error("sender_id does not match authenticated user");
    }

    const saveStart = process.hrtime.bigint();
    const { message } = await MessageService.saveMessage({
      ...chatMessage,
      server_conversation_id: chatMessage.server_conversation_id,
      source_device_id: deviceId
    });
    const saveMs = elapsedMs(saveStart);

    const ackStart = process.hrtime.bigint();
    const ackMessage: AckMessage = {
      messageClassify: "ack",
      client_message_id: chatMessage.client_message_id,
      server_message_id: String(message.id),
      server_conversation_id: message.conversation_id,
      client_conversation_id: chatMessage.client_conversation_id,
      sequence: message.sequence,
      status: 0
    };
    ws.send(JSON.stringify(ackMessage));
    const ackSendMs = elapsedMs(ackStart);

    logger.debug(
      {
        clientMessageId: chatMessage.client_message_id,
        conversationId: chatMessage.server_conversation_id,
        senderId: chatMessage.sender_id,
        messageType: chatMessage.type,
        payloadBytes: Buffer.byteLength(String(rawMessage)),
        saveMs: Number(saveMs.toFixed(3)),
        ackSendMs: Number(ackSendMs.toFixed(3)),
        totalUntilAckMs: Number(elapsedMs(receivedAt).toFixed(3))
      },
      "Inbound chat message timing"
    );
  }

  private handleMessageError(
    ws: WebSocket,
    data: ClientWsMessage | null,
    error: unknown
  ) {
    if (data?.messageClassify === "chat") {
      const chatErrorMessage: MessageErrorMessage = {
        messageClassify: "message_error",
        client_message_id: data.client_message_id,
        server_conversation_id: data.server_conversation_id,
        code:
          error instanceof BusinessError
            ? "message_business_error"
            : "message_error",
        message:
          error instanceof Error ? error.message : "Message processing failed",
        timestamp: new Date().toISOString()
      };
      try {
        ws.send(JSON.stringify(chatErrorMessage));
      } catch (sendError) {
        getRequestLogger().error(
          { err: sendError, clientMessageId: data.client_message_id },
          "Failed to send websocket message_error payload"
        );
      }
    }
    this.callHandler.trySendCallError(ws, data, error);
    // BusinessError 属于客户端可预期的拒绝（拉黑/禁言/隐私），降级 warn；
    // 其它（DB / 反序列化等）才作为 error。
    if (error instanceof BusinessError) {
      getRequestLogger().warn(
        {
          err: error,
          classify: data?.messageClassify,
          clientMessageId:
            data?.messageClassify === "chat"
              ? data.client_message_id
              : undefined
        },
        "Websocket message rejected"
      );
    } else {
      getRequestLogger().error(
        {
          err: error,
          classify: data?.messageClassify
        },
        "Failed to process websocket message"
      );
    }
  }

  private startHeartbeatCheck() {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      let swept = 0;
      for (const [userId, userClients] of this.clients.entries()) {
        for (const [deviceId, client] of userClients.entries()) {
          const timeSinceLastPing = Date.now() - client.lastPingTime;
          if (timeSinceLastPing <= this.heartbeatTimeoutMs) continue;

          swept++;
          logger.debug(
            {
              userId,
              deviceId,
              timeSinceLastPingMs: timeSinceLastPing
            },
            "Terminating idle websocket connection"
          );
          // 从本地 map 中移除，防止 close 事件再次触发 unregisterClient。
          // 由于 unregisterClient 默认模式依赖 map 槽位作为占用权，
          // 这里需要使用 "显式 client 模式" 确保 Redis 痕迹仍被清理。
          userClients.delete(deviceId);
          client.socket.terminate();
          void this.presenceManager.unregisterClient(client.userId, deviceId, {
            client
          });
        }

        if (userClients.size === 0) {
          this.clients.delete(userId);
        }
      }
      if (swept > 0) {
        let remainConnections = 0;
        for (const userClients of this.clients.values()) {
          remainConnections += userClients.size;
        }
        logger.info(
          {
            swept,
            remainUsers: this.clients.size,
            remainConnections
          },
          "Heartbeat sweep finished"
        );
      }
    }, this.heartbeatCheckInterval);
  }

  private sendToUserLocal(
    userId: number | string,
    data: ServerWsMessage,
    options?: WebSocketDeliveryOptions
  ) {
    const normalizedUserId = Number(userId);
    if (!Number.isFinite(normalizedUserId)) {
      logger.warn(
        { userId },
        "Skip websocket local delivery due to invalid user id"
      );
      return 0;
    }
    const payload = JSON.stringify(data);
    let deliveredCount = 0;

    const userClients = this.clients.get(String(normalizedUserId));
    if (!userClients) {
      return 0;
    }

    for (const [deviceId, client] of userClients.entries()) {
      if (
        options?.targetDeviceId &&
        client.deviceId !== options.targetDeviceId
      ) {
        continue;
      }
      if (
        options?.excludeDeviceId &&
        client.deviceId === options.excludeDeviceId
      ) {
        continue;
      }
      if (client.socket.readyState === WebSocket.OPEN) {
        deliveredCount++;
        client.socket.send(payload, error => {
          if (!error) return;
          logger.error(
            { err: error },
            `Failed to send to userId=${normalizedUserId}, device=${deviceId}`
          );
          // send 失败通常意味着底层 socket 已不可用。仅从 map 移除是不够的：
          // 还需要清理 Redis presence 痕迹（避免"幽灵在线"），并强制关闭 socket
          // 回收 FD。使用显式 client 模式确保 Redis 清理不被并发 close 事件吞掉。
          const stillCurrent = userClients.get(deviceId) === client;
          if (stillCurrent) {
            userClients.delete(deviceId);
            if (userClients.size === 0) {
              this.clients.delete(String(normalizedUserId));
            }
          }
          void this.presenceManager
            .unregisterClient(normalizedUserId, deviceId, { client })
            .catch(unregisterError => {
              logger.warn(
                {
                  err: unregisterError,
                  userId: normalizedUserId,
                  deviceId
                },
                "Failed to unregister client after send error"
              );
            });
          try {
            client.socket.close(1011, "send_failed");
          } catch {
            try {
              client.socket.terminate();
            } catch {
              // ignore
            }
          }
        });
      }
    }

    return deliveredCount;
  }

  private disconnectUserLocalConnections(
    userId: number,
    options?: WebSocketDisconnectOptions
  ) {
    const normalizedUserId = Number(userId);
    let disconnectedCount = 0;

    const userClients = this.clients.get(String(normalizedUserId));
    if (!userClients) {
      return disconnectedCount;
    }

    for (const [deviceId, client] of userClients.entries()) {
      if (
        options?.targetDeviceId &&
        String(client.deviceId) !== String(options.targetDeviceId)
      ) {
        continue;
      }
      if (
        options?.excludeDeviceId &&
        String(client.deviceId) === String(options.excludeDeviceId)
      ) {
        continue;
      }

      disconnectedCount++;
      // 顺序很关键：
      //   1) 先从 map 移除，让 socket.close() 触发的 close handler 走 stale 分支，
      //      避免与下面的显式 unregister 重复清理 Redis；
      //   2) 用显式 client 模式调用 unregister 完成 Redis 清理；
      //   3) 关闭 socket。
      userClients.delete(deviceId);
      void this.presenceManager.unregisterClient(client.userId, deviceId, {
        client,
        logMessage: `Connection closed for userId=${normalizedUserId} on device ${deviceId}. Reason: ${options?.reason ?? "session_revoked"}`
      });
      try {
        client.socket.close(4001, options?.reason ?? "session_revoked");
      } catch {
        try {
          client.socket.terminate();
        } catch {
          // ignore
        }
      }
    }

    if (userClients.size === 0) {
      this.clients.delete(String(normalizedUserId));
    }

    return disconnectedCount;
  }
}
