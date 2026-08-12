import type {
  AuthSessionStore,
  MobileDataRepository,
  SyncCheckpointStore
} from "@mushroom/app-core";
import type { MobileRealtimeClient } from "../realtime";
import { getActiveSession } from "./session-state";

const NULL_AUTH_STORE: AuthSessionStore = {
  read: async () => ({
    user: null,
    accessToken: null,
    refreshToken: null,
    profile: null
  }),
  write: async () => undefined,
  clear: async () => undefined
};

const EMPTY_CHECKPOINT_SNAPSHOT = {
  contacts: null,
  conversations: null,
  messageStates: null
} as const;

const NULL_CHECKPOINT_STORE: SyncCheckpointStore = {
  read: async () => ({ ...EMPTY_CHECKPOINT_SNAPSHOT }),
  write: async () => ({ ...EMPTY_CHECKPOINT_SNAPSHOT }),
  clear: async () => undefined
};

const NULL_REPOSITORY = {
  // The Proxy fallback below intercepts every call before this object is
  // ever invoked; we just need a structurally-typed placeholder so
  // TypeScript accepts the controller construction.
  snapshot: async () => ({
    conversations: [],
    messagesByConversationId: {},
    contacts: [],
    blacklist: [],
    addressBookMatches: [],
    workspaceContacts: [],
    pendingFriendRequests: [],
    pendingMessages: []
  }),
  clear: async () => undefined
} as unknown as MobileDataRepository;

export const bootRepository = new Proxy(NULL_REPOSITORY, {
  get(_target, prop) {
    const active = getActiveSession();
    if (active) {
      return Reflect.get(active.repository, prop, active.repository);
    }
    if (prop === "snapshot") {
      return async () => ({
        conversations: [],
        messagesByConversationId: {},
        contacts: [],
        blacklist: [],
        addressBookMatches: [],
        workspaceContacts: [],
        pendingFriendRequests: [],
        pendingMessages: []
      });
    }
    return async () => undefined;
  }
});

export const bootAuthStore: AuthSessionStore = {
  read: async () => {
    const active = getActiveSession();
    return active ? active.authStore.read() : NULL_AUTH_STORE.read();
  },
  write: async value => {
    const active = getActiveSession();
    if (!active) {
      return;
    }
    await active.authStore.write(value);
  },
  clear: async () => {
    const active = getActiveSession();
    if (!active) {
      return;
    }
    await active.authStore.clear();
  }
};

export const bootCheckpointStore: SyncCheckpointStore = {
  read: async () => {
    const active = getActiveSession();
    return active ? active.checkpoints.read() : NULL_CHECKPOINT_STORE.read();
  },
  write: async value => {
    const active = getActiveSession();
    if (!active) {
      return { ...EMPTY_CHECKPOINT_SNAPSHOT };
    }
    return active.checkpoints.write(value);
  },
  clear: async () => {
    const active = getActiveSession();
    if (!active) {
      return;
    }
    await active.checkpoints.clear();
  }
};

const NULL_REALTIME_UNSUBSCRIBE = () => undefined;
const NULL_REALTIME = {
  connect: async () => undefined,
  disconnect: () => undefined,
  reconnect: async () => undefined,
  sendMessage: async () => undefined,
  sendChatMessage: async () => ({ ok: false, error: "not bound" }),
  addStatusListener: () => NULL_REALTIME_UNSUBSCRIBE,
  addMessageListener: () => NULL_REALTIME_UNSUBSCRIBE
} as unknown as MobileRealtimeClient;

export function getActiveRealtime(): MobileRealtimeClient {
  const active = getActiveSession();
  return active ? active.realtime : NULL_REALTIME;
}
