import type WebSocket from "ws";

export interface Client {
  id: string;
  userId: number;
  deviceId: string;
  isAlive: boolean;
  socket: WebSocket;
  lastPingTime: number;
}

export type ClientRegistry = Map<string, Map<string, Client>>;

export interface WebSocketDeliveryOptions {
  excludeDeviceId?: string;
  targetDeviceId?: string;
}

export interface WebSocketDisconnectOptions {
  targetDeviceId?: string;
  excludeDeviceId?: string;
  reason?: string;
}
