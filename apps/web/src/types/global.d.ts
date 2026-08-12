import type {
  ContactListItem,
  Conversation,
  ConversationMember,
  ConversationSyncPayload,
  LocalDBMessage,
  MediaAutoDownloadPolicy,
  MediaAutoDownloadPreferences,
  MediaCategory,
  Message,
  MessageSyncPayload
} from "@mushroom/shared";

export {};

type OutgoingMessageRecord = {
  client_message_id: string;
  client_conversation_id: string;
  server_conversation_id?: string | null;
  payload: Message & { server_conversation_id?: string };
  status: number;
  retry_count: number;
  next_retry_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
};

type BackfillJobRecord = {
  client_conversation_id: string;
  job_kind: "tail" | "delta" | "history";
  priority: number;
  not_before_at?: string | null;
  payload?: {
    server_conversation_id?: string | null;
    unread_count?: number;
    last_message_time?: string | null;
  } | null;
  updated_at: string;
};

type DesktopNotificationActionPayload = {
  type: "conversation" | "call";
  action: "open";
  clientConversationId?: string;
  conversationId?: string;
  callId?: string;
};

type MediaCacheCategory = "images" | "files" | "voice" | "video" | "thumbs";

type MediaCacheRecord = {
  id: number;
  userId: number;
  message_id?: string | number | null;
  upload_id?: string | number | null;
  remote_url?: string | null;
  localPath: string;
  localUrl: string;
  category: MediaCacheCategory;
  original_name?: string | null;
  mime_type?: string | null;
  size?: number | null;
  sha256?: string | null;
  month_key: string;
  status: "downloading" | "ready" | "missing" | "failed" | "deleted";
  created_at: string;
  updated_at: string;
  accessed_at?: string | null;
};

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

type AppStorageStats = {
  userDataDir: string;
  mediaRoot: string;
  dbPath: string;
  logsDir: string;
  dbBytes: number;
  logsBytes: number;
};

type MediaCacheConversationStats = {
  clientConversationId: string | null;
  totalBytes: number;
  fileCount: number;
  byCategory: Record<MediaCacheCategory, { count: number; size: number }>;
};

declare global {
  interface Window {
    electronAPI: {
      logWrite: (record: {
        level: "debug" | "info" | "warn" | "error";
        scope?: string;
        message: string;
        args: unknown[];
        timestamp: number;
      }) => void;
      getSystemLanguage: () => Promise<string | null>;
      getSystemTheme: () => Promise<string | null>;
      getPreferredLanguage: () => Promise<string | null>;
      getPreferredTheme: () => Promise<string | null>;
      setPreferredLanguage: (language: string | null) => Promise<void>;
      setPreferredTheme: (theme: string | null) => Promise<void>;
      onSystemThemeChanged: (
        callback: (theme: string | null) => void
      ) => () => void;
      notifyIncomingMessage: (payload: {
        clientConversationId: string;
        title: string;
        body: string;
        silent?: boolean;
      }) => Promise<void>;
      notifyIncomingCall: (payload: {
        callId: string;
        conversationId?: string;
        title: string;
        body: string;
        mediaType?: number;
        timeoutSeconds?: number;
      }) => Promise<void>;
      clearConversationNotifications: (
        clientConversationId?: string
      ) => Promise<void>;
      clearIncomingCall: (callId?: string) => Promise<void>;
      // ---- 独立通话窗（realtime-call.md §12） ----
      openCallWindow?: (
        phase?: "incoming" | "ongoing" | "minimized"
      ) => Promise<boolean>;
      applyCallWindowState?: (
        phase: "incoming" | "ongoing" | "minimized"
      ) => Promise<void>;
      callWindowControl?: (
        action: "minimize" | "restore" | "close" | "toggle-maximize"
      ) => Promise<void>;
      hideCallWindow?: () => Promise<void>;
      isCallWindow?: () => Promise<boolean>;
      /**
       * 通知 preload 主世界已注册 window 端口监听，冲刷缓冲的信令通道端口。
       * 端口本身不经此 API 传递（MessagePort 无法跨隔离世界克隆），而是由
       * preload 经 window.postMessage 转移；见 hooks/call/callChannelPort.ts。
       */
      notifyCallChannelReady?: () => void;
      /**
       * 主动请求主进程（重新）建立信令通道。供 renderer 任一侧运行期重建后
       * 自愈断链；主进程以去抖方式响应。见 main/call-window.ts。
       */
      requestCallChannel?: () => Promise<void>;
      onCallWindowRequestMinimize?: (callback: () => void) => () => void;
      resolveMediaCache: (payload: {
        remoteUrl: string;
        category?: MediaCacheCategory;
      }) => Promise<
        | { hit: false }
        | {
            hit: true;
            record: MediaCacheRecord;
          }
      >;
      downloadMediaCache: (
        payload: MediaCacheInput
      ) => Promise<MediaCacheRecord>;
      registerLocalMediaCache: (
        payload: Omit<MediaCacheInput, "remoteUrl"> & {
          remoteUrl?: string | null;
          sourcePath: string;
        }
      ) => Promise<MediaCacheRecord>;
      openMediaCache: (payload: MediaCacheInput) => Promise<MediaCacheRecord>;
      saveMediaCacheAs: (payload: MediaCacheInput) => Promise<
        | { canceled: true }
        | {
            canceled: false;
            filePath: string;
            record: MediaCacheRecord;
          }
      >;
      getMediaCacheStats: () => Promise<
        Array<{
          category: MediaCacheCategory;
          count: number;
          size: number;
        }>
      >;
      cleanupMediaCache: (payload: {
        category?: MediaCacheCategory;
        categories?: MediaCacheCategory[];
        monthKey?: string;
        olderThanDays?: number;
      }) => Promise<{ deletedCount: number; deletedSize: number }>;
      getMediaCacheStatsByConversation: () => Promise<
        MediaCacheConversationStats[]
      >;
      cleanupMediaCacheByConversation: (payload: {
        clientConversationId: string | null;
        categories?: MediaCacheCategory[];
        olderThanDays?: number;
      }) => Promise<{ deletedCount: number; deletedSize: number }>;
      getAppStorageStats: () => Promise<AppStorageStats>;
      openStoragePath: (target: string) => Promise<boolean>;
      getMediaAutoDownloadPreferences: (
        username?: string | null
      ) => Promise<MediaAutoDownloadPreferences>;
      setMediaAutoDownloadPolicy: (
        username: string | null,
        category: MediaCategory,
        policy: MediaAutoDownloadPolicy
      ) => Promise<MediaAutoDownloadPreferences>;
      onMediaAutoDownloadPreferencesChanged: (
        callback: (payload: {
          username: string | null;
          preferences: MediaAutoDownloadPreferences;
        }) => void
      ) => () => void;
      focusConversation: (clientConversationId?: string) => Promise<void>;
      onDesktopNotificationAction: (
        callback: (payload: DesktopNotificationActionPayload) => void
      ) => () => void;
      notifyLoginSuccess: (payload: {
        userId: number;
        accessToken?: string;
        refreshToken?: string;
      }) => Promise<boolean>;
      logoutUser: (options?: { wipeLocalData?: boolean }) => Promise<boolean>;
      saveToken: (token: string) => Promise<void>;
      getToken: () => Promise<string | null> | null;
      deleteToken: () => Promise<void>;
      saveRefreshToken: (token: string) => Promise<void>;
      getRefreshToken: () => Promise<string | null> | null;
      deleteRefreshToken: () => Promise<void>;
      setAccessToken?: (token: string | null) => Promise<void>;
      getDeviceId: () => Promise<string>;
      getDeviceInfo: () => Promise<{
        deviceId: string;
        deviceName: string;
        appVersion: string;
      }>;
      createConversation: (
        conver: Conversation,
        members: ConversationMember[],
        message: Message
      ) => Promise<Conversation>;
      getConversations: (
        includeArchived?: boolean,
        includeLocallyDeleted?: boolean
      ) => Promise<Conversation[]>;
      getBackfillJobs: (limit?: number) => Promise<BackfillJobRecord[]>;
      createConversations: (convers: Conversation[]) => Promise<void>;
      updateConversations: (convers: Conversation[]) => Promise<void>;
      updateConversationState: (conversation: {
        client_conversation_id: string;
        is_pinned?: number;
        is_muted?: number;
        is_archived?: number;
        draft?: string | null;
      }) => Promise<void>;
      deleteConversations: (converIds: string[]) => Promise<void>;
      deleteConversationLocally: (
        clientConversationId: string
      ) => Promise<void>;
      markConversationRead: (
        clientConversationId: string
      ) => Promise<{ readSequence: number }>;
      applyConversationRead: (payload: {
        serverConversationId: string;
        readSequence: number;
        unreadCount: number;
        updatedAt?: string;
      }) => Promise<void>;
      onConversationSync: (
        callback: (payload?: ConversationSyncPayload) => void
      ) => () => void;
      // ---- 群已读高水位（本地缓存 + IPC 热更新） ----
      applyGroupRead: (payload: {
        serverConversationId: string;
        messageSenderId: number;
        readerUserId: number;
        lastReadSeq: number;
        updatedAt?: string;
      }) => Promise<{ changed: boolean }>;
      bulkApplyGroupRead: (payload: {
        serverConversationId: string;
        entries: Array<{ user_id: number; last_read_seq: number }>;
      }) => Promise<{ changed: boolean }>;
      getGroupReadState: (
        serverConversationId: string
      ) => Promise<Record<number, number>>;
      getAllGroupReadStates: () => Promise<
        Record<string, Record<number, number>>
      >;
      clearGroupReadState: (
        serverConversationId: string
      ) => Promise<{ cleared: boolean }>;
      clearAllGroupReadStates: () => Promise<{ cleared: boolean }>;
      onGroupReadUpdate: (
        callback: (payload: {
          serverConversationId: string;
          readerUserId?: number;
          lastReadSeq?: number;
          messageSenderId?: number | null;
          bulk?: Array<{ readerUserId: number; lastReadSeq: number }>;
          updatedAt?: string | null;
        }) => void
      ) => () => void;
      getMessages: (
        clientConversationId: string,
        limit: number,
        cursor?: {
          beforeSequence?: number;
          beforeLocalCreatedAt?: string;
        }
      ) => Promise<LocalDBMessage[]>;
      searchMessages: (
        clientConversationId: string,
        keyword: string,
        limit?: number
      ) => Promise<LocalDBMessage[]>;
      searchAllMessages: (
        keyword: string,
        limit?: number
      ) => Promise<LocalDBMessage[]>;
      getMessageByServerId: (
        clientConversationId: string,
        serverMessageId: string
      ) => Promise<LocalDBMessage | null>;
      getMessageContext: (
        clientConversationId: string,
        targetClientMessageId: string,
        beforeLimit?: number,
        afterLimit?: number
      ) => Promise<LocalDBMessage[]>;
      getConversationMedia: (
        clientConversationId: string,
        kind?: "images" | "files",
        limit?: number
      ) => Promise<LocalDBMessage[]>;
      getGlobalMedia: (
        kind?: "images" | "files",
        limit?: number
      ) => Promise<LocalDBMessage[]>;
      getMessageCollections: (
        clientConversationId: string,
        kind: "favorited" | "pinned",
        limit?: number
      ) => Promise<LocalDBMessage[]>;
      clearConversationMessages: (
        clientConversationId: string
      ) => Promise<void>;
      markHistoryComplete: (payload: {
        clientConversationId: string;
        oldestVisibleSequence?: number | null;
      }) => Promise<{
        last_sync_sequence?: number;
        last_server_sequence?: number;
        tail_loaded_from_seq?: number;
        tail_loaded_to_seq?: number;
        history_complete?: number;
        local_hidden_before_seq?: number;
      } | null>;
      addMessage: (message: Message) => Promise<boolean>;
      createMessages: (message: Message[]) => Promise<void>;
      getOutgoingMessages: () => Promise<OutgoingMessageRecord[]>;
      queueOutgoingMessage: (item: {
        client_message_id: string;
        client_conversation_id: string;
        server_conversation_id?: string | null;
        payload: Message & { server_conversation_id?: string };
        status: number;
        retry_count?: number;
        next_retry_at?: string | null;
        last_error?: string | null;
        created_at?: string;
        updated_at?: string;
      }) => Promise<void>;
      updateOutgoingMessage: (item: {
        client_message_id: string;
        status: number;
        retry_count?: number;
        next_retry_at?: string | null;
        last_error?: string | null;
        updated_at?: string;
      }) => Promise<void>;
      deleteOutgoingMessage: (clientMessageId: string) => Promise<void>;
      deleteLocalMessage: (input: {
        clientConversationId: string;
        clientMessageId: string;
      }) => Promise<boolean>;
      outboxPut: (input: {
        clientMessageId: string;
        slot: "source" | "preview";
        extension?: string;
        mimeType?: string;
        data: ArrayBuffer | Uint8Array;
      }) => Promise<string>;
      outboxGet: (ref: string) => Promise<{
        data: ArrayBuffer;
        mimeType?: string;
        size: number;
      } | null>;
      outboxDelete: (ref: string) => Promise<void>;
      outboxSweep: (input: { activeRefs: string[] }) => Promise<void>;
      listLocalAttachmentRefs: () => Promise<string[]>;
      onMessageSync: (
        callback: (payload?: MessageSyncPayload) => void
      ) => () => void;
      updateConvLastMsg: (conver: Conversation) => Promise<void>;
      onMessageAdded: (callback: (message: Message) => void) => () => void;
      onMessageUpdated: (callback: (message: Message) => void) => () => void;
      updateMessageStatus: (messsage: Message) => Promise<void>;
      updateMessageAttachment: (payload: {
        upload_id: string;
        url?: string;
        thumb_url?: string;
        preview_url?: string;
        width?: number;
        height?: number;
        thumb_status?: "ready" | "failed" | "none" | "pending";
      }) => Promise<boolean>;
      updateMessageState: (payload: {
        clientMessageId: string;
        is_favorited?: number;
        is_pinned?: number;
      }) => Promise<void>;
      applyMessageStates: (
        states: Array<{
          message_id: string;
          conversation_id: string;
          is_favorited: number;
          is_pinned: number;
          updated_at?: string;
        }>
      ) => Promise<void>;
      applyMessageRecall: (payload: {
        serverMessageId: string;
        serverConversationId: string;
        sequence: number;
        content: Record<string, unknown>;
        updatedAt?: string;
      }) => Promise<void>;
      applyMessageReaction: (payload: {
        serverMessageId: string;
        serverConversationId?: string;
        userId: number;
        emoji: string | null;
        action: "added" | "updated" | "removed";
        sequence?: number;
        isDeleted?: 0 | 1;
        updatedAt?: string;
      }) => Promise<void>;
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
      }) => Promise<{ applied: number; maxSequence: number }>;
      getReactionCursor: (clientConversationId: string) => Promise<number>;
      setReactionCursor: (
        clientConversationId: string,
        sequence: number
      ) => Promise<boolean>;
      replaceMessageReactions: (payload: {
        serverMessageIds: string[];
        reactions: Array<{
          serverMessageId: string;
          userId: number;
          emoji: string;
          updatedAt: string;
        }>;
      }) => Promise<void>;
      listServerMessageIds: (clientConversationId: string) => Promise<string[]>;
      getContacts: () => Promise<ContactListItem[]>;
      getBlockedUsers: () => Promise<ContactListItem[]>;
      createContacts: (contacts: ContactListItem[]) => Promise<void>;
      updateContacts: (contacts: ContactListItem[]) => Promise<void>;
      deleteContacts: (userIds: number[]) => Promise<void>;
      getLastSyncTime: (model: string) => Promise<string | null>;
      updateLastSyncTime: (
        model: string,
        syncTime: Date | string | null | undefined
      ) => Promise<void>;
      updateConversationLastSyncSequence: (
        convSeqMap: Record<string, { serverSequence: number }>
      ) => Promise<void>;
      getConversationsByServerId: (
        serverConvId: string
      ) => Promise<Conversation>;
    };
    process?: {
      type?: "renderer" | "browser";
    };
  }
}
