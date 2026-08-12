import { contextBridge, ipcRenderer } from "electron";

type MediaCacheCategory = "images" | "files" | "voice" | "video" | "thumbs";

type MediaAutoDownloadCategory = "photos" | "videos" | "audio" | "documents";
type MediaAutoDownloadPolicy = "none" | "wifi" | "wifiCellular";

type MediaCacheInput = {
  remoteUrl: string;
  category?: MediaCacheCategory;
  messageId?: string | number | null;
  uploadId?: string | number | null;
  originalName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  createdAt?: string | null;
  clientConversationId?: string | null;
};

/**
 * 通话信令通道端口投递（见 docs/architecture/realtime-call.md §12.4）。
 *
 * 主进程经 `call-channel` 事件投递 MessagePort，但有两个约束：
 *
 *  1. `contextBridge` **无法跨隔离世界传递 `MessagePort`**：若把 port 当普通
 *     参数经暴露的回调传给主世界，结构化克隆会丢失其原型方法
 *     （`start`/`postMessage`/`onmessage`），主世界拿到的是「贫血」对象，
 *     调用 `port.start()` 即 `is not a function`（整窗白屏）。正确做法是用
 *     `window.postMessage(tag, "*", [port])` 把端口**转移**进主世界，主世界
 *     用 `window.addEventListener("message")` 收到的才是真 MessagePort。
 *
 *  2. `webContents.postMessage` 不会为「尚未注册监听器的 renderer」缓存/重放。
 *     主窗那侧的监听器位于 `useMainCallRelay`，只有登录后挂载 `useChat` 才注册；
 *     而通话窗在其 `did-finish-load` 即触发建链，可能早于主窗 renderer 就绪。
 *     若投递先到端口会被直接丢弃 → 通话信令静默失败。
 *
 * 解决：preload 顶层常驻监听 `call-channel` 把端口入队；主世界注册好 window
 * 监听后调用 `notifyCallChannelReady()` 握手，preload 据此把缓冲端口逐个
 * `window.postMessage` 转移出去（`window.postMessage` 同样不为后注册监听器
 * 缓存，故需此握手）。这样无论 renderer 何时 mount 都不会丢端口，且端口始终
 * 以「转移」方式抵达主世界、保持为真 MessagePort。
 */
const CALL_CHANNEL_PORT_MSG = "mushroom:call-channel-port";
const pendingCallChannelPorts: MessagePort[] = [];
let callChannelConsumerReady = false;

function deliverCallChannelPort(port: MessagePort) {
  // 用 window.postMessage 转移端口进主世界，保持真 MessagePort 语义。
  window.postMessage(CALL_CHANNEL_PORT_MSG, "*", [port]);
}

function flushCallChannelPorts() {
  while (pendingCallChannelPorts.length > 0) {
    const port = pendingCallChannelPorts.shift();
    if (port) {
      deliverCallChannelPort(port);
    }
  }
}

ipcRenderer.on("call-channel", (event: Electron.IpcRendererEvent) => {
  const port = event.ports[0];
  if (!port) {
    return;
  }
  if (callChannelConsumerReady) {
    deliverCallChannelPort(port);
  } else {
    pendingCallChannelPorts.push(port);
  }
});

contextBridge.exposeInMainWorld("electronAPI", {
  // Fire-and-forget log bridge. The renderer-side logger forwards every
  // record here so it lands in the main-process electron-log file.
  logWrite: (record: {
    level: "debug" | "info" | "warn" | "error";
    scope?: string;
    message: string;
    args: unknown[];
    timestamp: number;
  }) => ipcRenderer.send("log:write", record),
  getDeviceId: () => ipcRenderer.invoke("get-device-id"),
  getDeviceInfo: (): Promise<{
    deviceId: string;
    deviceName: string;
    appVersion: string;
  }> => ipcRenderer.invoke("get-device-info"),
  getSystemLanguage: (): Promise<string | null> =>
    ipcRenderer.invoke("get-system-language"),
  getSystemTheme: (): Promise<string | null> =>
    ipcRenderer.invoke("get-system-theme"),
  getPreferredLanguage: (): Promise<string | null> =>
    ipcRenderer.invoke("get-preferred-language"),
  getPreferredTheme: (): Promise<string | null> =>
    ipcRenderer.invoke("get-preferred-theme"),
  setPreferredLanguage: (language: string | null): Promise<void> =>
    ipcRenderer.invoke("set-preferred-language", language),
  setPreferredTheme: (theme: string | null): Promise<void> =>
    ipcRenderer.invoke("set-preferred-theme", theme),
  onSystemThemeChanged: (callback: (theme: string | null) => void) => {
    const listener = (_event: unknown, theme: string | null) => callback(theme);
    ipcRenderer.on("system-theme-changed", listener);
    return () => {
      ipcRenderer.removeListener("system-theme-changed", listener);
    };
  },
  notifyIncomingMessage: (payload: {
    clientConversationId: string;
    title: string;
    body: string;
    silent?: boolean;
  }) => ipcRenderer.invoke("desktop:notify-incoming-message", payload),
  notifyIncomingCall: (payload: {
    callId: string;
    conversationId?: string;
    title: string;
    body: string;
    mediaType?: number;
    timeoutSeconds?: number;
  }) => ipcRenderer.invoke("desktop:notify-incoming-call", payload),
  clearConversationNotifications: (clientConversationId?: string) =>
    ipcRenderer.invoke(
      "desktop:clear-conversation-notifications",
      clientConversationId
    ),
  clearIncomingCall: (callId?: string) =>
    ipcRenderer.invoke("desktop:clear-incoming-call", callId),
  // ---- 独立通话窗（见 docs/architecture/realtime-call.md §12） ----
  /** 主窗调用：显示通话窗并建立信令通道。phase 决定窗口三态。 */
  openCallWindow: (phase?: "incoming" | "ongoing" | "minimized") =>
    ipcRenderer.invoke("call-window:open", phase),
  /** 通话窗调用：按通话态切换窗口属性（置顶/任务栏/尺寸）。 */
  applyCallWindowState: (phase: "incoming" | "ongoing" | "minimized") =>
    ipcRenderer.invoke("call-window:apply-state", phase),
  /** 通话窗调用：缩小/还原/收起/双击切换最大化窗口。 */
  callWindowControl: (
    action: "minimize" | "restore" | "close" | "toggle-maximize"
  ) => ipcRenderer.invoke("call-window:control", action),
  /** 通话窗调用：隐藏自身（保留预热实例）。 */
  hideCallWindow: () => ipcRenderer.invoke("call-window:hide"),
  /** renderer 判断自身是否运行在通话窗中。 */
  isCallWindow: (): Promise<boolean> =>
    ipcRenderer.invoke("call-window:is-call-window"),
  /**
   * 主世界注册好 `window` 端口监听后调用，触发 preload 把缓冲的信令通道端口
   * 逐个经 `window.postMessage` 转移进主世界（见上方 CALL_CHANNEL_PORT_MSG
   * 说明的握手机制）。端口本身不经 contextBridge 传递（MessagePort 无法跨
   * 隔离世界克隆），故此处仅传递「就绪」信号。
   */
  notifyCallChannelReady: () => {
    callChannelConsumerReady = true;
    flushCallChannelPorts();
    // 主世界端口监听已就绪：请求主进程（重新）建链。覆盖「renderer 重建后缓冲
    // 区已空、旧 port 不可复用」的场景——主进程据此新铸一对 port 投递，实现
    // 通道自愈（见 call-window.ts establishCallChannel 的可重建语义）。
    void ipcRenderer.invoke("call-channel:request");
  },
  /**
   * renderer 主动请求（重新）建立信令通道。用于 relay / 通话窗 renderer 在
   * 运行期重建后自愈断链；主进程以去抖方式响应，避免重复铸链。
   */
  requestCallChannel: () => ipcRenderer.invoke("call-channel:request"),
  /** 通话窗订阅：主进程拦截 close 后请求 renderer 自行最小化。 */
  onCallWindowRequestMinimize: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("call-window:request-minimize", listener);
    return () => {
      ipcRenderer.removeListener("call-window:request-minimize", listener);
    };
  },
  resolveMediaCache: (payload: {
    remoteUrl: string;
    category?: MediaCacheCategory;
  }) => ipcRenderer.invoke("media-cache:resolve", payload),
  downloadMediaCache: (payload: MediaCacheInput) =>
    ipcRenderer.invoke("media-cache:download", payload),
  registerLocalMediaCache: (
    payload: Omit<MediaCacheInput, "remoteUrl"> & {
      remoteUrl?: string | null;
      sourcePath: string;
    }
  ) => ipcRenderer.invoke("media-cache:register-local", payload),
  openMediaCache: (payload: MediaCacheInput) =>
    ipcRenderer.invoke("media-cache:open", payload),
  saveMediaCacheAs: (payload: MediaCacheInput) =>
    ipcRenderer.invoke("media-cache:save-as", payload),
  getMediaCacheStats: () => ipcRenderer.invoke("media-cache:stats"),
  getMediaCacheStatsByConversation: () =>
    ipcRenderer.invoke("media-cache:stats-by-conv"),
  cleanupMediaCache: (payload: {
    category?: MediaCacheCategory;
    categories?: MediaCacheCategory[];
    monthKey?: string;
    olderThanDays?: number;
  }) => ipcRenderer.invoke("media-cache:cleanup", payload),
  cleanupMediaCacheByConversation: (payload: {
    clientConversationId: string | null;
    categories?: MediaCacheCategory[];
    olderThanDays?: number;
  }) => ipcRenderer.invoke("media-cache:cleanup-by-conv", payload),
  getAppStorageStats: () => ipcRenderer.invoke("storage:get-app-stats"),
  openStoragePath: (target: string) =>
    ipcRenderer.invoke("storage:open-path", target),
  getMediaAutoDownloadPreferences: (username?: string | null) =>
    ipcRenderer.invoke("prefs:get-media-auto-download", username ?? null),
  setMediaAutoDownloadPolicy: (
    username: string | null,
    category: MediaAutoDownloadCategory,
    policy: MediaAutoDownloadPolicy
  ) =>
    ipcRenderer.invoke("prefs:set-media-auto-download", {
      username,
      category,
      policy
    }),
  onMediaAutoDownloadPreferencesChanged: (
    callback: (payload: {
      username: string | null;
      preferences: Record<MediaAutoDownloadCategory, MediaAutoDownloadPolicy>;
    }) => void
  ) => {
    const listener = (
      _event: unknown,
      payload: {
        username: string | null;
        preferences: Record<MediaAutoDownloadCategory, MediaAutoDownloadPolicy>;
      }
    ) => callback(payload);
    ipcRenderer.on("prefs:media-auto-download-changed", listener);
    return () => {
      ipcRenderer.removeListener("prefs:media-auto-download-changed", listener);
    };
  },
  focusConversation: (clientConversationId?: string) =>
    ipcRenderer.invoke("desktop:focus-conversation", {
      clientConversationId
    }),
  onDesktopNotificationAction: (
    callback: (payload: {
      type: "conversation" | "call";
      action: "open";
      clientConversationId?: string;
      conversationId?: string;
      callId?: string;
    }) => void
  ) => {
    const listener = (
      _event: unknown,
      payload: {
        type: "conversation" | "call";
        action: "open";
        clientConversationId?: string;
        conversationId?: string;
        callId?: string;
      }
    ) => callback(payload);
    ipcRenderer.on("desktop-notification-action", listener);
    return () => {
      ipcRenderer.removeListener("desktop-notification-action", listener);
    };
  },
  notifyLoginSuccess: (payload: {
    userId: number;
    accessToken?: string;
    refreshToken?: string;
  }) => ipcRenderer.invoke("user:login-success", payload),
  logoutUser: (options?: { wipeLocalData?: boolean }) =>
    ipcRenderer.invoke("user:logout", options ?? {}),
  saveToken: (token: string): Promise<void> =>
    ipcRenderer.invoke("save-token", token),
  getToken: (): Promise<string | null> => ipcRenderer.invoke("get-token"),
  deleteToken: (): Promise<void> => ipcRenderer.invoke("delete-token"),
  saveRefreshToken: (token: string): Promise<void> =>
    ipcRenderer.invoke("save-refresh-token", token),
  getRefreshToken: (): Promise<string | null> =>
    ipcRenderer.invoke("get-refresh-token"),
  deleteRefreshToken: (): Promise<void> =>
    ipcRenderer.invoke("delete-refresh-token"),
  setAccessToken: (token: string | null): Promise<void> =>
    ipcRenderer.invoke("set-access-token", token),
  createConversation: (conversation: any, members: number[], message: any) =>
    ipcRenderer.invoke(
      "db:create-conversation",
      conversation,
      members,
      message
    ),
  getConversations: (
    includeArchived?: boolean,
    includeLocallyDeleted?: boolean
  ) =>
    ipcRenderer.invoke(
      "db:get-conversations",
      includeArchived,
      includeLocallyDeleted
    ),
  getBackfillJobs: (limit?: number) =>
    ipcRenderer.invoke("db:get-backfill-jobs", limit),
  getConversationsByServerId: (serverConvId: string) =>
    ipcRenderer.invoke("db:get-conversation-by-serverId", serverConvId),
  createConversations: (conversations: any) =>
    ipcRenderer.invoke("db:create-conversations", conversations),
  updateConversations: (conversations: any) =>
    ipcRenderer.invoke("db:update-conversations", conversations),
  updateConversationState: (conversation: {
    client_conversation_id: string;
    is_pinned?: number;
    is_muted?: number;
    is_archived?: number;
    draft?: string | null;
  }) => ipcRenderer.invoke("db:update-conversation-state", conversation),
  deleteConversations: (conversationIds: any) =>
    ipcRenderer.invoke("db:delete-conversations", conversationIds),
  deleteConversationLocally: (clientConversationId: string) =>
    ipcRenderer.invoke("db:delete-conversation-locally", clientConversationId),
  markConversationRead: (clientConversationId: string) =>
    ipcRenderer.invoke("db:mark-conversation-read", clientConversationId),
  applyConversationRead: (payload: {
    serverConversationId: string;
    readSequence: number;
    unreadCount: number;
    updatedAt?: string;
  }) => ipcRenderer.invoke("db:apply-conversation-read", payload),
  onConversationSync: (callback: (payload?: unknown) => void) => {
    const listener = (_event: unknown, payload?: unknown) => callback(payload);
    ipcRenderer.on("conversation-sync", listener);
    return () => {
      ipcRenderer.removeListener("conversation-sync", listener);
    };
  },
  applyGroupRead: (payload: {
    serverConversationId: string;
    messageSenderId: number;
    readerUserId: number;
    lastReadSeq: number;
    updatedAt?: string;
  }) => ipcRenderer.invoke("db:group-read:apply", payload),
  bulkApplyGroupRead: (payload: {
    serverConversationId: string;
    entries: Array<{ user_id: number; last_read_seq: number }>;
  }) => ipcRenderer.invoke("db:group-read:bulk-apply", payload),
  getGroupReadState: (serverConversationId: string) =>
    ipcRenderer.invoke("db:group-read:get", serverConversationId),
  getAllGroupReadStates: () => ipcRenderer.invoke("db:group-read:get-all"),
  clearGroupReadState: (serverConversationId: string) =>
    ipcRenderer.invoke("db:group-read:clear", serverConversationId),
  clearAllGroupReadStates: () => ipcRenderer.invoke("db:group-read:clear-all"),
  onGroupReadUpdate: (
    callback: (payload: {
      serverConversationId: string;
      readerUserId?: number;
      lastReadSeq?: number;
      messageSenderId?: number | null;
      bulk?: Array<{ readerUserId: number; lastReadSeq: number }>;
      updatedAt?: string | null;
    }) => void
  ) => {
    const listener = (_event: unknown, payload: unknown) =>
      callback(payload as never);
    ipcRenderer.on("group-read-update", listener);
    return () => {
      ipcRenderer.removeListener("group-read-update", listener);
    };
  },
  getContacts: () => ipcRenderer.invoke("db:get-contacts"),
  getBlockedUsers: () => ipcRenderer.invoke("db:get-blocked-users"),
  createContacts: (contacts: any) =>
    ipcRenderer.invoke("db:create-contacts", contacts),
  updateContacts: (contacts: any) =>
    ipcRenderer.invoke("db:update-contacts", contacts),
  deleteContacts: (userIds: any) =>
    ipcRenderer.invoke("db:delete-contacts", userIds),
  onMessageAdded: (callback: (message: any) => void) => {
    const listener = (_event: any, message: any) => callback(message);
    ipcRenderer.on("db:message-added", listener);
    return () => {
      ipcRenderer.removeListener("db:message-added", listener);
    };
  },
  onMessageUpdated: (callback: (message: any) => void) => {
    const listener = (_event: any, message: any) => callback(message);
    ipcRenderer.on("db:message-updated", listener);
    return () => {
      ipcRenderer.removeListener("db:message-updated", listener);
    };
  },
  onMessageSync: (callback: (payload?: unknown) => void) => {
    const listener = (_event: unknown, payload?: unknown) => callback(payload);
    ipcRenderer.on("message-sync", listener);
    return () => {
      ipcRenderer.removeListener("message-sync", listener);
    };
  },
  addMessage: (message: any) => ipcRenderer.invoke("db:add-message", message),
  getMessages: (
    clientConversationId: string,
    limit: number,
    cursor?: {
      beforeSequence?: number;
      beforeLocalCreatedAt?: string;
    }
  ) =>
    ipcRenderer.invoke("db:get-messages", clientConversationId, limit, cursor),
  searchMessages: (
    clientConversationId: string,
    keyword: string,
    limit?: number
  ) =>
    ipcRenderer.invoke(
      "db:search-messages",
      clientConversationId,
      keyword,
      limit
    ),
  searchAllMessages: (keyword: string, limit?: number) =>
    ipcRenderer.invoke("db:search-all-messages", keyword, limit),
  getMessageByServerId: (
    clientConversationId: string,
    serverMessageId: string
  ) =>
    ipcRenderer.invoke(
      "db:get-message-by-server-id",
      clientConversationId,
      serverMessageId
    ),
  getMessageContext: (
    clientConversationId: string,
    targetClientMessageId: string,
    beforeLimit?: number,
    afterLimit?: number
  ) =>
    ipcRenderer.invoke(
      "db:get-message-context",
      clientConversationId,
      targetClientMessageId,
      beforeLimit,
      afterLimit
    ),
  getConversationMedia: (
    clientConversationId: string,
    kind?: "images" | "files",
    limit?: number
  ) =>
    ipcRenderer.invoke(
      "db:get-conversation-media",
      clientConversationId,
      kind,
      limit
    ),
  getGlobalMedia: (kind?: "images" | "files", limit?: number) =>
    ipcRenderer.invoke("db:get-global-media", kind, limit),
  getMessageCollections: (
    clientConversationId: string,
    kind: "favorited" | "pinned",
    limit?: number
  ) =>
    ipcRenderer.invoke(
      "db:get-message-collections",
      clientConversationId,
      kind,
      limit
    ),
  clearConversationMessages: (clientConversationId: string) =>
    ipcRenderer.invoke("db:clear-conversation-messages", clientConversationId),
  markHistoryComplete: (payload: {
    clientConversationId: string;
    oldestVisibleSequence?: number | null;
  }) => ipcRenderer.invoke("db:mark-history-complete", payload),
  createMessages: (messages: any) =>
    ipcRenderer.invoke("db:create-messages", messages),
  getOutgoingMessages: () => ipcRenderer.invoke("db:get-outgoing-messages"),
  queueOutgoingMessage: (item: any) =>
    ipcRenderer.invoke("db:queue-outgoing-message", item),
  updateOutgoingMessage: (item: any) =>
    ipcRenderer.invoke("db:update-outgoing-message", item),
  deleteOutgoingMessage: (clientMessageId: string) =>
    ipcRenderer.invoke("db:delete-outgoing-message", clientMessageId),
  // 删除一条"失败的本地附件草稿"行（仅 local_messages，且仅未上链）。
  // 由 useChatOutgoing → handleDeleteFailedMessage 调用；preview/source 的
  // outbox 清理由调用方走 outboxDelete 单独处理。
  deleteLocalMessage: (input: {
    clientConversationId: string;
    clientMessageId: string;
  }): Promise<boolean> => ipcRenderer.invoke("db:delete-local-message", input),
  // ---- Outbox（待发送附件自有存储）IPC ----
  // 与 mobile 端语义对齐：把原文件 + 缩略图落到
  // `<userData>/users/<uid>/outbox/<client_message_id>/` 下；ref 即绝对路径。
  // 注意：`uid` 不由渲染端传入，主进程通过 `getCurrentUserId()` 解析；
  // 所有 ref 入口都会做 `isInside(ref, accountRoot)` 校验。
  outboxPut: (input: {
    clientMessageId: string;
    slot: "source" | "preview";
    extension?: string;
    mimeType?: string;
    data: ArrayBuffer | Uint8Array;
  }): Promise<string> => ipcRenderer.invoke("outbox:put", input),
  outboxGet: (
    ref: string
  ): Promise<{ data: ArrayBuffer; mimeType?: string; size: number } | null> =>
    ipcRenderer.invoke("outbox:get", ref),
  outboxDelete: (ref: string): Promise<void> =>
    ipcRenderer.invoke("outbox:delete", ref),
  outboxSweep: (input: { activeRefs: string[] }): Promise<void> =>
    ipcRenderer.invoke("outbox:sweep", input),
  /** 列出 messages 表中所有仍被引用的 outbox 本地 ref（启动 sweep 用）。 */
  listLocalAttachmentRefs: (): Promise<string[]> =>
    ipcRenderer.invoke("attachments:list-local-refs"),
  updateMessageStatus: (message: any) =>
    ipcRenderer.invoke("db:update-message-status", message),
  updateMessageAttachment: (payload: {
    upload_id: string;
    url?: string;
    thumb_url?: string;
    preview_url?: string;
    width?: number;
    height?: number;
    thumb_status?: "ready" | "failed" | "none" | "pending";
  }) => ipcRenderer.invoke("db:update-message-attachment", payload),
  updateMessageState: (payload: {
    clientMessageId: string;
    is_favorited?: number;
    is_pinned?: number;
  }) => ipcRenderer.invoke("db:update-message-state", payload),
  applyMessageStates: (
    states: Array<{
      message_id: string;
      conversation_id: string;
      is_favorited: number;
      is_pinned: number;
      updated_at?: string;
    }>
  ) => ipcRenderer.invoke("db:apply-message-states", states),
  applyMessageRecall: (payload: any) =>
    ipcRenderer.invoke("db:apply-message-recall", payload),
  applyMessageReaction: (payload: {
    serverMessageId: string;
    serverConversationId?: string;
    userId: number;
    emoji: string | null;
    action: "added" | "updated" | "removed";
    sequence?: number;
    isDeleted?: 0 | 1;
    updatedAt?: string;
  }) => ipcRenderer.invoke("db:apply-message-reaction", payload),
  /**
   * Apply an ordered batch of reaction delta events for a single conversation.
   * Caller must sort `deltas` ascending by `sequence`. Returns the number of
   * applied events and the highest applied sequence (for cursor tracking on
   * the renderer side, when the renderer also keeps a copy).
   */
  applyMessageReactionDeltas: (payload: {
    clientConversationId: string;
    deltas: Array<{
      serverMessageId: string;
      userId: number;
      emoji: string | null;
      sequence: number;
      isDeleted: 0 | 1;
      updatedAt: string;
    }>;
  }) =>
    ipcRenderer.invoke("db:apply-message-reaction-deltas", payload) as Promise<{
      applied: number;
      maxSequence: number;
    }>,
  getReactionCursor: (clientConversationId: string) =>
    ipcRenderer.invoke(
      "db:get-reaction-cursor",
      clientConversationId
    ) as Promise<number>,
  setReactionCursor: (clientConversationId: string, sequence: number) =>
    ipcRenderer.invoke(
      "db:set-reaction-cursor",
      clientConversationId,
      sequence
    ) as Promise<boolean>,
  replaceMessageReactions: (payload: {
    serverMessageIds: string[];
    reactions: Array<{
      serverMessageId: string;
      userId: number;
      emoji: string;
      updatedAt: string;
    }>;
  }) => ipcRenderer.invoke("db:replace-message-reactions", payload),
  listServerMessageIds: (clientConversationId: string) =>
    ipcRenderer.invoke(
      "db:list-server-message-ids",
      clientConversationId
    ) as Promise<string[]>,
  updateConvLastMsg: (conversation: any) =>
    ipcRenderer.invoke("db:update-conv-lastMsg", conversation),
  getLastSyncTime: (model: string) =>
    ipcRenderer.invoke("db:get-lastSyncTime", model),
  updateLastSyncTime: (
    model: string,
    syncTime: Date | string | null | undefined
  ) => ipcRenderer.invoke("db:update-lastSyncTime", model, syncTime),
  updateConversationLastSyncSequence: (
    convSeqMap: Record<string, { serverSequence: number }>
  ) => ipcRenderer.invoke("db:update-conversationLastSyncSequence", convSeqMap)
});
