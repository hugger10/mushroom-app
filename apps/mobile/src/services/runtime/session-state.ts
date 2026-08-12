import type {
  AuthSessionStore,
  MobileDataRepository,
  SyncCheckpointStore
} from "@mushroom/app-core";
import type { createMobileServerApi } from "../api";
import type { MobileRealtimeClient } from "../realtime";

export interface ActiveAccountSession {
  uid: string;
  authStore: AuthSessionStore;
  checkpoints: SyncCheckpointStore;
  repository: MobileDataRepository;
  api: ReturnType<typeof createMobileServerApi>;
  realtime: MobileRealtimeClient;
  unauthorizedHandlers: Set<() => Promise<void> | void>;
}

let activeSession: ActiveAccountSession | null = null;

export function getActiveSession(): ActiveAccountSession | null {
  return activeSession;
}

export function setActiveSession(next: ActiveAccountSession | null): void {
  activeSession = next;
}
