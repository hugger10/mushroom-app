import type {
  IncomingChatMessageHandler,
  MobileAppSnapshot,
  SyncMetrics,
  DeviceEnvironmentInfo
} from "../types";
import type { MushroomApi } from "@mushroom/shared";
import type {
  AuthSessionStore,
  MobileDataRepository,
  SyncCheckpointStore
} from "../storage";
import type { LocalAttachmentStore } from "../storage/local-attachment-store";

/**
 * Shared context handed to every controller service module. Services use
 * this both to access the (potentially-rebindable) stores and to invoke
 * the central snapshot/publish primitives that remain owned by the
 * facade controller.
 */
export interface ControllerContext {
  // Immutable deps
  readonly api: MushroomApi;
  readonly deviceInfo: DeviceEnvironmentInfo;

  // Store getters — bindUser may rebind these, so services MUST go through
  // the getters on every call rather than caching the references.
  getAuthStore(): AuthSessionStore;
  getCheckpoints(): SyncCheckpointStore;
  getRepository(): MobileDataRepository;
  rebindStores(stores: {
    authStore: AuthSessionStore;
    checkpoints: SyncCheckpointStore;
    repository: MobileDataRepository;
  }): void;

  // Shared mutable state — multiple services read/write these maps; storing
  // them on the context keeps the wiring single-sourced.
  readonly visibleMessageLimits: Map<string, number>;
  readonly pendingReadTimers: Map<string, ReturnType<typeof setTimeout>>;
  getActiveConversationId(): string | null;
  setActiveConversationId(id: string | null): void;
  getMetrics(): SyncMetrics;
  setMetrics(m: SyncMetrics): void;

  // Host hooks
  readonly onUserBound?: (uid: string) =>
    | Promise<{
        authStore: AuthSessionStore;
        checkpoints: SyncCheckpointStore;
        repository: MobileDataRepository;
      }>
    | {
        authStore: AuthSessionStore;
        checkpoints: SyncCheckpointStore;
        repository: MobileDataRepository;
      };
  readonly onUserUnbound?: (options: {
    wipeLocalData: boolean;
  }) => Promise<void> | void;
  readonly onLoginCommitted?: (uid: string) => Promise<void> | void;
  readonly onIncomingChatMessage?: IncomingChatMessageHandler;

  // Snapshot primitives — owned by the facade controller, exposed to
  // services through the context so they never need a reference to the
  // controller itself.
  snapshot(): Promise<MobileAppSnapshot>;
  publishSnapshot(snapshot?: MobileAppSnapshot): Promise<MobileAppSnapshot>;

  /**
   * 自有存储（"outbox"）— 用于持久化待发送附件的原文件 + 缩略图。
   * 由 controller 在构造时注入；测试与未接入端使用 `NoopLocalAttachmentStore`。
   */
  readonly attachmentStore: LocalAttachmentStore;

  // Cross-service handles. These are wired up after every service has been
  // instantiated, so do NOT touch them inside a service constructor.
  services: ControllerServices;
}

export interface ControllerServices {
  auth: import("./services/auth-service").AuthService;
  device: import("./services/device-service").DeviceService;
  privacy: import("./services/privacy-service").PrivacyService;
  notification: import("./services/notification-service").NotificationService;
  sync: import("./services/sync-service").SyncService;
  conversation: import("./services/conversation-service").ConversationService;
  messageWindow: import("./services/message-window-service").MessageWindowService;
  messageSend: import("./services/message-send-service").MessageSendService;
  messageState: import("./services/message-state-service").MessageStateService;
  outgoingRetry: import("./services/outgoing-retry-service").OutgoingRetryService;
  readReceipt: import("./services/read-receipt-service").ReadReceiptService;
  group: import("./services/group-service").GroupService;
  contact: import("./services/contact-service").ContactService;
  search: import("./services/search-service").SearchService;
  realtime: import("./services/realtime-service").RealtimeService;
  startupRecovery: import("./services/startup-recovery-service").StartupRecoveryService;
}
