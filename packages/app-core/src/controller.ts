import type {
  AckMessage,
  Message,
  MushroomApi,
  ServerWsMessage,
  ChangePasswordRequest,
  RegisterRequest,
  UpdateContactRequest,
  UpdateUserNotificationSettingsRequest,
  UpdateUserPrivacySettingsRequest,
  UpdateUserProfileRequest,
  UserDevicesResponse,
  UserNotificationSettings,
  UserPrivacySettingsEnvelope,
  UserSecurityEventsResponse
} from "@mushroom/shared";
import type {
  AuthSessionStore,
  MobileDataRepository,
  SyncCheckpointStore
} from "./storage";
import type {
  DeviceEnvironmentInfo,
  IncomingChatMessageHandler,
  MobileAppSnapshot,
  MobileMessageSearchFilter,
  MobileMessageSearchMatchScope,
  MobileMessageSearchResult,
  MobileMessageSearchScope,
  SyncMetrics
} from "./types";
import type {
  ControllerContext,
  ControllerServices
} from "./controller-internal/context";
import {
  emptyMetrics,
  DEFAULT_VISIBLE_MESSAGE_PAGE_SIZE
} from "./controller-internal/internal-helpers";
import type {
  SnapshotListener,
  SyncNowOptions
} from "./controller-internal/internal-helpers";
import { AuthService } from "./controller-internal/services/auth-service";
import { DeviceService } from "./controller-internal/services/device-service";
import { NotificationService } from "./controller-internal/services/notification-service";
import { PrivacyService } from "./controller-internal/services/privacy-service";
import { SyncService } from "./controller-internal/services/sync-service";
import { ConversationService } from "./controller-internal/services/conversation-service";
import { MessageWindowService } from "./controller-internal/services/message-window-service";
import { MessageSendService } from "./controller-internal/services/message-send-service";
import { MessageStateService } from "./controller-internal/services/message-state-service";
import { OutgoingRetryService } from "./controller-internal/services/outgoing-retry-service";
import { ReadReceiptService } from "./controller-internal/services/read-receipt-service";
import { GroupService } from "./controller-internal/services/group-service";
import { ContactService } from "./controller-internal/services/contact-service";
import { SearchService } from "./controller-internal/services/search-service";
import { RealtimeService } from "./controller-internal/services/realtime-service";
import { StartupRecoveryService } from "./controller-internal/services/startup-recovery-service";
import {
  NoopLocalAttachmentStore,
  type LocalAttachmentStore
} from "./storage/local-attachment-store";

export interface MobileAppControllerOptions {
  api: MushroomApi;
  authStore: AuthSessionStore;
  checkpoints: SyncCheckpointStore;
  repository: MobileDataRepository;
  deviceInfo: DeviceEnvironmentInfo;
  /**
   * 自有存储（"outbox"）实现。用于持久化待发送附件的原文件 + 缩略图，
   * 让 UI 跨刷新 / 重启始终有缩略图可显，并允许失败后无须重新选择文件
   * 即可重试。各端实现见 `apps/{web,electron,mobile}/...`。
   *
   * 缺省使用 `NoopLocalAttachmentStore`，便于尚未接入持久化的端、单元测试
   * 与服务端 outbox 任务复用相同的核心服务。
   */
  attachmentStore?: LocalAttachmentStore;
  onUserBound?: (uid: string) =>
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
  onUserUnbound?: (options: { wipeLocalData: boolean }) => Promise<void> | void;
  onLoginCommitted?: (uid: string) => Promise<void> | void;
  onIncomingChatMessage?: IncomingChatMessageHandler;
}

/**
 * MobileAppController — facade that owns the snapshot lifecycle and
 * routes every public method to a small purpose-built service in
 * `controller-internal/services/*`. State that is genuinely cross-service
 * (active conversation id, visible-message-limit map, pending-read
 * debounce timers, sync metrics) lives on the controller and is
 * exposed to services through {@link ControllerContext}.
 *
 * Constructor wiring order:
 *   1. Capture immutable deps + per-uid stores.
 *   2. Build a `ControllerContext` whose `services` slot is empty.
 *   3. Instantiate every service against that context.
 *   4. Back-fill `context.services` so cross-service calls work.
 * Services MUST NOT touch `ctx.services` from their constructor.
 */
export class MobileAppController {
  private readonly api: MushroomApi;
  private authStore: AuthSessionStore;
  private checkpoints: SyncCheckpointStore;
  private repository: MobileDataRepository;
  private readonly deviceInfo: DeviceEnvironmentInfo;
  private readonly onUserBoundHook?: MobileAppControllerOptions["onUserBound"];
  private readonly onUserUnboundHook?: MobileAppControllerOptions["onUserUnbound"];
  private readonly onLoginCommittedHook?: MobileAppControllerOptions["onLoginCommitted"];
  private readonly onIncomingChatMessageHook?: IncomingChatMessageHandler;
  private readonly attachmentStore: LocalAttachmentStore;

  private readonly listeners = new Set<SnapshotListener>();
  private metrics: SyncMetrics = emptyMetrics();
  private activeConversationId: string | null = null;
  private readonly visibleMessageLimits = new Map<string, number>();
  private readonly pendingReadTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  private readonly services: ControllerServices;

  constructor(options: MobileAppControllerOptions) {
    this.api = options.api;
    this.authStore = options.authStore;
    this.checkpoints = options.checkpoints;
    this.repository = options.repository;
    this.deviceInfo = options.deviceInfo;
    this.onUserBoundHook = options.onUserBound;
    this.onUserUnboundHook = options.onUserUnbound;
    this.onLoginCommittedHook = options.onLoginCommitted;
    this.onIncomingChatMessageHook = options.onIncomingChatMessage;
    this.attachmentStore =
      options.attachmentStore ?? new NoopLocalAttachmentStore();

    // Step 2: ControllerContext with a deferred `services` slot. The
    // `services` field is mutated in step 4 below; until then it is an
    // empty object — any service that touches it from its constructor
    // will crash at runtime which is exactly the contract we want.
    const ctx: ControllerContext = {
      api: this.api,
      deviceInfo: this.deviceInfo,
      getAuthStore: () => this.authStore,
      getCheckpoints: () => this.checkpoints,
      getRepository: () => this.repository,
      rebindStores: stores => {
        this.authStore = stores.authStore;
        this.checkpoints = stores.checkpoints;
        this.repository = stores.repository;
      },
      visibleMessageLimits: this.visibleMessageLimits,
      pendingReadTimers: this.pendingReadTimers,
      getActiveConversationId: () => this.activeConversationId,
      setActiveConversationId: id => {
        this.activeConversationId = id;
      },
      getMetrics: () => this.metrics,
      setMetrics: next => {
        this.metrics = next;
      },
      onUserBound: this.onUserBoundHook,
      onUserUnbound: this.onUserUnboundHook,
      onLoginCommitted: this.onLoginCommittedHook,
      onIncomingChatMessage: this.onIncomingChatMessageHook,
      snapshot: () => this.snapshot(),
      publishSnapshot: snapshot => this.publishSnapshot(snapshot),
      attachmentStore: this.attachmentStore,
      services: {} as ControllerServices
    };

    // Step 3: instantiate every service against the (services-empty) ctx.
    const services: ControllerServices = {
      auth: new AuthService(ctx),
      device: new DeviceService(ctx),
      privacy: new PrivacyService(ctx),
      notification: new NotificationService(ctx),
      sync: new SyncService(ctx),
      conversation: new ConversationService(ctx),
      messageWindow: new MessageWindowService(ctx),
      messageSend: new MessageSendService(ctx),
      messageState: new MessageStateService(ctx),
      outgoingRetry: new OutgoingRetryService(ctx),
      readReceipt: new ReadReceiptService(ctx),
      group: new GroupService(ctx),
      contact: new ContactService(ctx),
      search: new SearchService(ctx),
      realtime: new RealtimeService(ctx),
      startupRecovery: new StartupRecoveryService(ctx)
    };

    // Step 4: back-fill so cross-service calls (e.g. AuthService -> SyncService)
    // resolve through ctx.services.* from now on.
    ctx.services = services;
    this.services = services;
  }

  // ---------------------------------------------------------------------
  // Snapshot + listener primitives (facade-owned).
  // ---------------------------------------------------------------------

  subscribe(listener: SnapshotListener) {
    this.listeners.add(listener);
    void this.snapshot().then(snapshot => listener(snapshot));
    return () => {
      this.listeners.delete(listener);
    };
  }

  async snapshot(): Promise<MobileAppSnapshot> {
    const [auth, checkpointSnapshot, data] = await Promise.all([
      this.authStore.read(),
      this.checkpoints.read(),
      this.repository.snapshot({
        defaultMessageLimit: DEFAULT_VISIBLE_MESSAGE_PAGE_SIZE,
        messageLimitByConversation: Object.fromEntries(
          this.visibleMessageLimits
        ),
        activeClientConversationId: this.activeConversationId ?? null
      })
    ]);

    return {
      auth,
      checkpoints: checkpointSnapshot,
      data,
      metrics: { ...this.metrics }
    };
  }

  private async publishSnapshot(snapshot?: MobileAppSnapshot) {
    const nextSnapshot = snapshot ?? (await this.snapshot());
    for (const listener of this.listeners) {
      await listener(nextSnapshot);
    }
    return nextSnapshot;
  }

  // ---------------------------------------------------------------------
  // Auth / bootstrap / profile (-> AuthService)
  // ---------------------------------------------------------------------

  bindUser(uid: string) {
    return this.services.auth.bindUser(uid);
  }
  bootstrap() {
    return this.services.auth.bootstrap();
  }
  /**
   * 启动恢复：把上一次会话残留的"假发送中"消息归位，重建 outbox 引用，
   * 触发孤儿清理。各端在 `bindUser` + `bootstrap` 之后调用一次即可。
   * 幂等，失败不抛错（内部 best-effort）。
   */
  runStartupRecovery() {
    return this.services.startupRecovery.recover();
  }
  login(input: { username: string; password: string }) {
    return this.services.auth.login(input);
  }
  register(input: RegisterRequest) {
    return this.services.auth.register(input);
  }
  refreshAuth() {
    return this.services.auth.refreshAuth();
  }
  refreshProfile() {
    return this.services.auth.refreshProfile();
  }
  updateProfile(patch: UpdateUserProfileRequest) {
    return this.services.auth.updateProfile(patch);
  }
  changePassword(input: ChangePasswordRequest) {
    return this.services.auth.changePassword(input);
  }

  // ---------------------------------------------------------------------
  // Devices / security (-> DeviceService)
  // ---------------------------------------------------------------------

  getManagedDevices(): Promise<UserDevicesResponse> {
    return this.services.device.getManagedDevices();
  }
  getSecurityEvents(limit = 20): Promise<UserSecurityEventsResponse> {
    return this.services.device.getSecurityEvents(limit);
  }
  disableDevice(deviceId: string) {
    return this.services.device.disableDevice(deviceId);
  }
  restoreDevice(deviceId: string) {
    return this.services.device.restoreDevice(deviceId);
  }
  logoutManagedDevice(deviceId: string) {
    return this.services.device.logoutManagedDevice(deviceId);
  }
  logoutOtherDevices() {
    return this.services.device.logoutOtherDevices();
  }
  logoutAllManagedDevices() {
    return this.services.device.logoutAllManagedDevices();
  }

  // ---------------------------------------------------------------------
  // Privacy (-> PrivacyService)
  // ---------------------------------------------------------------------

  getPrivacySettings(): Promise<UserPrivacySettingsEnvelope> {
    return this.services.privacy.getPrivacySettings();
  }
  updatePrivacySettings(
    patch: UpdateUserPrivacySettingsRequest
  ): Promise<UserPrivacySettingsEnvelope> {
    return this.services.privacy.updatePrivacySettings(patch);
  }
  setReceiptsEnabled(enabled: boolean): void {
    this.services.privacy.setReceiptsEnabled(enabled);
  }
  applyPrivacySyncFrame(
    frame: Parameters<PrivacyService["applyPrivacySyncFrame"]>[0]
  ): boolean {
    return this.services.privacy.applyPrivacySyncFrame(frame);
  }

  // ---------------------------------------------------------------------
  // Notifications (-> NotificationService)
  // ---------------------------------------------------------------------

  getNotificationSettings(): Promise<UserNotificationSettings> {
    return this.services.notification.getNotificationSettings();
  }
  updateNotificationSettings(
    patch: UpdateUserNotificationSettingsRequest
  ): Promise<UserNotificationSettings> {
    return this.services.notification.updateNotificationSettings(patch);
  }

  // ---------------------------------------------------------------------
  // Sync + session lifecycle (-> SyncService)
  // ---------------------------------------------------------------------

  syncNow(options?: SyncNowOptions) {
    return this.services.sync.syncNow(options);
  }
  handleUnauthorizedSession() {
    return this.services.sync.handleUnauthorizedSession();
  }
  logout(options?: { wipeLocalData?: boolean }) {
    return this.services.sync.logout(options);
  }

  // ---------------------------------------------------------------------
  // Conversations (-> ConversationService)
  // ---------------------------------------------------------------------

  getConversationByPeerId(peerId: number) {
    return this.services.conversation.getConversationByPeerId(peerId);
  }
  ensureDirectConversation(peerId: number) {
    return this.services.conversation.ensureDirectConversation(peerId);
  }
  setActiveConversation(
    ...args: Parameters<ConversationService["setActiveConversation"]>
  ) {
    return this.services.conversation.setActiveConversation(...args);
  }
  saveConversationDraft(clientConversationId: string, draft: string) {
    return this.services.conversation.saveConversationDraft(
      clientConversationId,
      draft
    );
  }
  updateConversationState(
    input: Parameters<ConversationService["updateConversationState"]>[0]
  ) {
    return this.services.conversation.updateConversationState(input);
  }
  markConversationUnread(clientConversationId: string) {
    return this.services.conversation.markConversationUnread(
      clientConversationId
    );
  }
  deleteConversation(clientConversationId: string) {
    return this.services.conversation.deleteConversation(clientConversationId);
  }
  clearConversationMessages(clientConversationId: string) {
    return this.services.conversation.clearConversationMessages(
      clientConversationId
    );
  }
  leaveConversation(clientConversationId: string) {
    return this.services.conversation.leaveConversation(clientConversationId);
  }
  disbandConversation(clientConversationId: string) {
    return this.services.conversation.disbandConversation(clientConversationId);
  }

  /**
   * 预加载会话最近消息（直接从 SQLite 读取，不经过 publishSnapshot 完整路径）。
   * 用于进入会话详情时消除空消息列表闪烁：
   *   - 调用方在 setActiveConversationId 之前启动预加载；
   *   - 结果注入 snapshot 的 messagesByConversation，与导航同帧渲染。
   */
  preloadConversationMessages(
    clientConversationId: string
  ): Promise<Message[]> {
    return this.repository.listRecentMessages!(clientConversationId, {
      limit: DEFAULT_VISIBLE_MESSAGE_PAGE_SIZE
    });
  }

  // ---------------------------------------------------------------------
  // Message window (-> MessageWindowService)
  // ---------------------------------------------------------------------

  loadOlderMessages(clientConversationId: string, pageSize = 50) {
    return this.services.messageWindow.loadOlderMessages(
      clientConversationId,
      pageSize
    );
  }
  loadMessagesAround(
    ...args: Parameters<MessageWindowService["loadMessagesAround"]>
  ) {
    return this.services.messageWindow.loadMessagesAround(...args);
  }
  ensureMessageVisible(
    ...args: Parameters<MessageWindowService["ensureMessageVisible"]>
  ) {
    return this.services.messageWindow.ensureMessageVisible(...args);
  }
  shrinkVisibleWindow(
    ...args: Parameters<MessageWindowService["shrinkVisibleWindow"]>
  ) {
    return this.services.messageWindow.shrinkVisibleWindow(...args);
  }

  // ---------------------------------------------------------------------
  // Message send / attachment (-> MessageSendService)
  // ---------------------------------------------------------------------

  createOptimisticTextMessage(
    input: Parameters<MessageSendService["createOptimisticTextMessage"]>[0]
  ) {
    return this.services.messageSend.createOptimisticTextMessage(input);
  }
  createOptimisticAttachmentMessage(
    input: Parameters<
      MessageSendService["createOptimisticAttachmentMessage"]
    >[0]
  ) {
    return this.services.messageSend.createOptimisticAttachmentMessage(input);
  }
  createOptimisticPendingAttachmentMessage(
    input: Parameters<
      MessageSendService["createOptimisticPendingAttachmentMessage"]
    >[0]
  ) {
    return this.services.messageSend.createOptimisticPendingAttachmentMessage(
      input
    );
  }
  patchAttachmentUploaded(
    input: Parameters<MessageSendService["patchAttachmentUploaded"]>[0]
  ) {
    return this.services.messageSend.patchAttachmentUploaded(input);
  }
  markAttachmentUploadFailed(
    input: Parameters<MessageSendService["markAttachmentUploadFailed"]>[0]
  ) {
    return this.services.messageSend.markAttachmentUploadFailed(input);
  }
  markAttachmentUploadRetrying(
    input: Parameters<MessageSendService["markAttachmentUploadRetrying"]>[0]
  ) {
    return this.services.messageSend.markAttachmentUploadRetrying(input);
  }
  markAttachmentLocalSourceMissing(
    input: Parameters<MessageSendService["markAttachmentLocalSourceMissing"]>[0]
  ) {
    return this.services.messageSend.markAttachmentLocalSourceMissing(input);
  }
  /**
   * 删除一条失败的本地附件草稿（含 outbox refs）。仅对
   * `status === -1 && !server_message_id && type === 2` 的消息生效。
   * 平台层（如 mobile）在调用本方法后，仍需自行清理 outgoing 队列行
   * （由平台 repo 维护，不进 shared）。
   */
  deleteFailedLocalAttachmentMessage(
    input: Parameters<
      MessageSendService["deleteFailedLocalAttachmentMessage"]
    >[0]
  ) {
    return this.services.messageSend.deleteFailedLocalAttachmentMessage(input);
  }
  /**
   * 把待发送附件的原文件 + 缩略图持久化到自有存储（outbox）。失败 best-effort，
   * 任一项失败时返回的对应 ref 为空字符串，调用方据此决定是否写入 message content。
   */
  persistLocalAttachment(
    input: Parameters<MessageSendService["persistLocalAttachment"]>[0]
  ) {
    return this.services.messageSend.persistLocalAttachment(input);
  }
  /** 标记 outbox 中某条原文件 ref 可释放。delete 内部幂等。 */
  releaseLocalAttachmentSource(ref?: string | null) {
    return this.services.messageSend.releaseLocalAttachmentSource(ref);
  }
  createOptimisticVoiceMessage(
    input: Parameters<MessageSendService["createOptimisticVoiceMessage"]>[0]
  ) {
    return this.services.messageSend.createOptimisticVoiceMessage(input);
  }
  createOptimisticForwardMessage(
    input: Parameters<MessageSendService["createOptimisticForwardMessage"]>[0]
  ) {
    return this.services.messageSend.createOptimisticForwardMessage(input);
  }
  createOptimisticMergedForwardMessage(
    input: Parameters<
      MessageSendService["createOptimisticMergedForwardMessage"]
    >[0]
  ) {
    return this.services.messageSend.createOptimisticMergedForwardMessage(
      input
    );
  }

  // ---------------------------------------------------------------------
  // Message state (-> MessageStateService)
  // ---------------------------------------------------------------------

  toggleFavoriteMessage(
    input: Parameters<MessageStateService["toggleFavoriteMessage"]>[0]
  ) {
    return this.services.messageState.toggleFavoriteMessage(input);
  }
  togglePinMessage(
    input: Parameters<MessageStateService["togglePinMessage"]>[0]
  ) {
    return this.services.messageState.togglePinMessage(input);
  }
  recallMessage(input: Parameters<MessageStateService["recallMessage"]>[0]) {
    return this.services.messageState.recallMessage(input);
  }
  toggleMessageReaction(
    input: Parameters<MessageStateService["toggleMessageReaction"]>[0]
  ) {
    return this.services.messageState.toggleMessageReaction(input);
  }

  // ---------------------------------------------------------------------
  // Outgoing retry / ack (-> OutgoingRetryService)
  // ---------------------------------------------------------------------

  confirmMessageAck(ack: AckMessage) {
    return this.services.outgoingRetry.confirmMessageAck(ack);
  }
  failMessageSend(
    options: Parameters<OutgoingRetryService["failMessageSend"]>[0]
  ) {
    return this.services.outgoingRetry.failMessageSend(options);
  }
  markOutgoingMessageSending(
    options: Parameters<OutgoingRetryService["markOutgoingMessageSending"]>[0]
  ) {
    return this.services.outgoingRetry.markOutgoingMessageSending(options);
  }
  listRetryableOutgoingMessages(options?: { limit?: number }) {
    return this.services.outgoingRetry.listRetryableOutgoingMessages(options);
  }

  // ---------------------------------------------------------------------
  // Read receipts (-> ReadReceiptService)
  // ---------------------------------------------------------------------

  scheduleConversationRead(
    ...args: Parameters<ReadReceiptService["scheduleConversationRead"]>
  ) {
    return this.services.readReceipt.scheduleConversationRead(...args);
  }
  markConversationRead(clientConversationId: string, notify = true) {
    return this.services.readReceipt.markConversationRead(
      clientConversationId,
      notify
    );
  }
  refreshConversationReadState(
    ...args: Parameters<ReadReceiptService["refreshConversationReadState"]>
  ) {
    return this.services.readReceipt.refreshConversationReadState(...args);
  }

  // ---------------------------------------------------------------------
  // Group admin (-> GroupService)
  // ---------------------------------------------------------------------

  addGroupMembers(clientConversationId: string, contactIds: number[]) {
    return this.services.group.addGroupMembers(
      clientConversationId,
      contactIds
    );
  }
  removeGroupMember(clientConversationId: string, userId: number) {
    return this.services.group.removeGroupMember(clientConversationId, userId);
  }
  updateGroupMemberRole(
    ...args: Parameters<GroupService["updateGroupMemberRole"]>
  ) {
    return this.services.group.updateGroupMemberRole(...args);
  }
  updateGroupMemberMute(
    ...args: Parameters<GroupService["updateGroupMemberMute"]>
  ) {
    return this.services.group.updateGroupMemberMute(...args);
  }
  transferGroupOwner(clientConversationId: string, userId: number) {
    return this.services.group.transferGroupOwner(clientConversationId, userId);
  }
  updateGroupProfile(...args: Parameters<GroupService["updateGroupProfile"]>) {
    return this.services.group.updateGroupProfile(...args);
  }
  updateGroupAnnouncement(
    ...args: Parameters<GroupService["updateGroupAnnouncement"]>
  ) {
    return this.services.group.updateGroupAnnouncement(...args);
  }
  updateGroupSettings(
    ...args: Parameters<GroupService["updateGroupSettings"]>
  ) {
    return this.services.group.updateGroupSettings(...args);
  }

  // ---------------------------------------------------------------------
  // Contacts (-> ContactService)
  // ---------------------------------------------------------------------

  blockUser(targetUserId: number) {
    return this.services.contact.blockUser(targetUserId);
  }
  unblockUser(targetUserId: number) {
    return this.services.contact.unblockUser(targetUserId);
  }
  updateContact(targetUserId: number, patch: UpdateContactRequest) {
    return this.services.contact.updateContact(targetUserId, patch);
  }
  deleteContact(targetUserId: number) {
    return this.services.contact.deleteContact(targetUserId);
  }

  // ---------------------------------------------------------------------
  // Search / attachments tab (-> SearchService)
  // ---------------------------------------------------------------------

  listAttachmentMessages(
    kind: "images" | "videos" | "media" | "files",
    clientConversationId?: string
  ): Promise<MobileMessageSearchResult[]> {
    return this.services.search.listAttachmentMessages(
      kind,
      clientConversationId
    );
  }
  searchMessages(input: {
    keyword?: string;
    filter?: MobileMessageSearchFilter;
    scope?: MobileMessageSearchScope;
    matchScope?: MobileMessageSearchMatchScope;
    clientConversationId?: string | null;
  }): Promise<MobileMessageSearchResult[]> {
    return this.services.search.searchMessages(input);
  }

  // ---------------------------------------------------------------------
  // Realtime / WS routing (-> RealtimeService)
  // ---------------------------------------------------------------------

  handleRealtimeEvent(message: ServerWsMessage) {
    return this.services.realtime.handleRealtimeEvent(message);
  }
}

export function createMobileAppController(options: MobileAppControllerOptions) {
  return new MobileAppController(options);
}
