import type {
  Conversation,
  ContactListItem,
  Message,
  UserManagedDevice
} from "@mushroom/shared";
import {
  CALL_MEDIA_TYPE_AUDIO,
  CALL_PARTICIPANT_ROLE_INVITEE,
  CALL_PARTICIPANT_STATUS_INVITED,
  CALL_SCOPE_DIRECT,
  CALL_STATUS_RINGING
} from "@mushroom/shared";
import type { MobileCallUiSession } from "../../src/types/app";

type MockStateOverrides = Record<string, unknown>;

export const mobileAppControllerMock = {
  bootstrap: jest.fn().mockResolvedValue(undefined),
  snapshot: jest.fn(),
  subscribe: jest.fn(() => jest.fn()),
  login: jest.fn(),
  register: jest.fn(),
  refreshAuth: jest.fn(),
  refreshProfile: jest.fn().mockResolvedValue(undefined),
  syncNow: jest.fn().mockResolvedValue(undefined),
  logout: jest.fn().mockResolvedValue(undefined),
  updateProfile: jest.fn().mockResolvedValue(undefined),
  getManagedDevices: jest.fn(),
  getSecurityEvents: jest.fn(),
  getPrivacySettings: jest.fn(),
  updatePrivacySettings: jest.fn(),
  disableDevice: jest.fn().mockResolvedValue(undefined),
  restoreDevice: jest.fn().mockResolvedValue(undefined),
  logoutManagedDevice: jest.fn().mockResolvedValue(undefined),
  logoutOtherDevices: jest.fn().mockResolvedValue(undefined),
  logoutAllManagedDevices: jest.fn().mockResolvedValue(undefined),
  changePassword: jest.fn().mockResolvedValue(undefined),
  setActiveConversation: jest.fn(),
  saveConversationDraft: jest.fn(),
  createOptimisticTextMessage: jest.fn(),
  createOptimisticAttachmentMessage: jest.fn(),
  createOptimisticPendingAttachmentMessage: jest.fn(),
  persistLocalAttachment: jest.fn().mockResolvedValue({
    sourceRef: "file:///ref/source",
    previewRef: "file:///ref/preview"
  }),
  patchAttachmentUploaded: jest.fn().mockResolvedValue(undefined),
  markAttachmentUploadFailed: jest.fn().mockResolvedValue(undefined),
  markAttachmentUploadRetrying: jest.fn().mockResolvedValue(undefined),
  createOptimisticVoiceMessage: jest.fn(),
  createOptimisticForwardMessage: jest.fn(),
  markOutgoingMessageSending: jest.fn().mockResolvedValue(undefined),
  listRetryableOutgoingMessages: jest.fn().mockResolvedValue([]),
  confirmMessageAck: jest.fn().mockResolvedValue(undefined),
  failMessageSend: jest.fn().mockResolvedValue(undefined),
  markConversationRead: jest.fn().mockResolvedValue(undefined),
  getConversationByPeerId: jest.fn(),
  ensureDirectConversation: jest.fn(),
  toggleFavoriteMessage: jest.fn().mockResolvedValue(undefined),
  togglePinMessage: jest.fn().mockResolvedValue(undefined),
  updateConversationState: jest.fn().mockResolvedValue(undefined),
  markConversationUnread: jest.fn().mockResolvedValue(undefined),
  deleteConversation: jest.fn().mockResolvedValue(undefined),
  recallMessage: jest.fn().mockResolvedValue(undefined),
  clearConversationMessages: jest.fn().mockResolvedValue(undefined),
  searchMessages: jest.fn().mockResolvedValue([]),
  listAttachmentMessages: jest.fn(),
  ensureMessageVisible: jest.fn().mockResolvedValue(undefined),
  deleteContact: jest.fn().mockResolvedValue(undefined),
  blockUser: jest.fn().mockResolvedValue(undefined),
  unblockUser: jest.fn().mockResolvedValue(undefined),
  addGroupMembers: jest.fn().mockResolvedValue(undefined),
  removeGroupMember: jest.fn().mockResolvedValue(undefined),
  updateGroupMemberRole: jest.fn().mockResolvedValue(undefined),
  updateGroupMemberMute: jest.fn().mockResolvedValue(undefined),
  transferGroupOwner: jest.fn().mockResolvedValue(undefined),
  updateGroupProfile: jest.fn().mockResolvedValue(undefined),
  updateGroupAnnouncement: jest.fn().mockResolvedValue(undefined),
  updateGroupSettings: jest.fn().mockResolvedValue(undefined),
  leaveConversation: jest.fn().mockResolvedValue(undefined),
  disbandConversation: jest.fn().mockResolvedValue(undefined)
};

export const mobileRealtimeClientMock = {
  addStatusListener: jest.fn(() => jest.fn()),
  addMessageListener: jest.fn(() => jest.fn()),
  connect: jest.fn(),
  disconnect: jest.fn(),
  sendChatMessage: jest.fn(),
  sendMessage: jest.fn()
};

export const mobileServerApiMock = {
  registerCurrentDevice: jest.fn(),
  getCallIceConfig: jest.fn(),
  getCallState: jest.fn(),
  getCallRoomConfig: jest.fn(),
  getUserProfile: jest.fn(),
  searchUsers: jest.fn(),
  createDirectConversation: jest.fn(),
  createConversation: jest.fn(),
  matchContacts: jest.fn(),
  saveContact: jest.fn(),
  getUsersPresence: jest.fn(),
  getLimits: jest.fn()
};

export const uploadMobileFileMock = jest.fn();
export const uploadMobileAvatarFileMock = jest.fn();

export const mobileAppModuleMock = {
  mobileApiBaseUrl: "http://127.0.0.1:9100",
  mobileWsUrl: "ws://127.0.0.1:9100/ws",
  mobileDeviceId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  mobileDeviceInfo: {
    deviceId: "0f8fad5b-d9cb-469f-a165-70867728950e",
    deviceType: 3,
    deviceName: "android (Android 14)",
    appVersion: "1.0",
    pushProvider: null,
    metadata: {
      platform: "android",
      os_version: 34
    },
    pushToken: null,
    pushAppId: null,
    pushCapabilities: []
  },
  mobileAppController: mobileAppControllerMock,
  mobileRealtimeClient: mobileRealtimeClientMock,
  mobileServerApi: mobileServerApiMock,
  uploadMobileFile: uploadMobileFileMock,
  uploadMobileAvatarFile: uploadMobileAvatarFileMock,
  registerCurrentMobileDevice: jest.fn().mockResolvedValue(undefined),
  updateMobilePushRegistration: jest.fn()
};

export function resetMobileMocks() {
  for (const mockFn of [
    ...Object.values(mobileAppControllerMock),
    ...Object.values(mobileRealtimeClientMock),
    ...Object.values(mobileServerApiMock),
    uploadMobileFileMock,
    uploadMobileAvatarFileMock
  ]) {
    if (typeof mockFn === "function" && "mockReset" in mockFn) {
      mockFn.mockReset();
    }
  }

  mobileAppControllerMock.bootstrap.mockResolvedValue(undefined);
  mobileAppControllerMock.subscribe.mockImplementation(() => jest.fn());
  mobileAppControllerMock.refreshProfile.mockResolvedValue(undefined);
  uploadMobileAvatarFileMock.mockResolvedValue({
    large: "https://example.test/avatar-large.jpg"
  });
  mobileAppControllerMock.syncNow.mockResolvedValue(undefined);
  mobileAppControllerMock.logout.mockResolvedValue(undefined);
  mobileAppControllerMock.updateProfile.mockResolvedValue(undefined);
  mobileAppControllerMock.getManagedDevices.mockResolvedValue({
    current_device_id: "device-1",
    devices: []
  });
  mobileAppControllerMock.getSecurityEvents.mockResolvedValue({
    events: []
  });
  mobileAppControllerMock.getPrivacySettings.mockResolvedValue({
    settings: {
      discoverable_by_username: 0,
      discoverable_by_phone: 1,
      message_permission: 1
    }
  });
  mobileAppControllerMock.updatePrivacySettings.mockResolvedValue({
    settings: {
      discoverable_by_username: 0,
      discoverable_by_phone: 1,
      message_permission: 1
    }
  });
  mobileAppControllerMock.disableDevice.mockResolvedValue(undefined);
  mobileAppControllerMock.restoreDevice.mockResolvedValue(undefined);
  mobileAppControllerMock.logoutManagedDevice.mockResolvedValue(undefined);
  mobileAppControllerMock.logoutOtherDevices.mockResolvedValue(undefined);
  mobileAppControllerMock.logoutAllManagedDevices.mockResolvedValue(undefined);
  mobileAppControllerMock.changePassword.mockResolvedValue(undefined);
  mobileAppControllerMock.confirmMessageAck.mockResolvedValue(undefined);
  mobileAppControllerMock.failMessageSend.mockResolvedValue(undefined);
  mobileAppControllerMock.persistLocalAttachment.mockResolvedValue({
    sourceRef: "file:///ref/source",
    previewRef: "file:///ref/preview"
  });
  mobileAppControllerMock.patchAttachmentUploaded.mockResolvedValue(undefined);
  mobileAppControllerMock.markAttachmentUploadFailed.mockResolvedValue(
    undefined
  );
  mobileAppControllerMock.markAttachmentUploadRetrying.mockResolvedValue(
    undefined
  );
  mobileAppControllerMock.markConversationRead.mockResolvedValue(undefined);
  mobileAppControllerMock.markOutgoingMessageSending.mockResolvedValue(
    undefined
  );
  mobileAppControllerMock.listRetryableOutgoingMessages.mockResolvedValue([]);
  mobileAppControllerMock.getConversationByPeerId.mockResolvedValue(null);
  mobileAppControllerMock.ensureDirectConversation.mockResolvedValue(null);
  mobileAppControllerMock.toggleFavoriteMessage.mockResolvedValue(undefined);
  mobileAppControllerMock.togglePinMessage.mockResolvedValue(undefined);
  mobileAppControllerMock.updateConversationState.mockResolvedValue(undefined);
  mobileAppControllerMock.markConversationUnread.mockResolvedValue(undefined);
  mobileAppControllerMock.deleteConversation.mockResolvedValue(undefined);
  mobileAppControllerMock.recallMessage.mockResolvedValue(undefined);
  mobileAppControllerMock.clearConversationMessages.mockResolvedValue(
    undefined
  );
  mobileAppControllerMock.searchMessages.mockResolvedValue([]);
  mobileAppControllerMock.listAttachmentMessages.mockResolvedValue([]);
  mobileAppControllerMock.ensureMessageVisible.mockResolvedValue(undefined);
  mobileAppControllerMock.deleteContact.mockResolvedValue(undefined);
  mobileAppControllerMock.blockUser.mockResolvedValue(undefined);
  mobileAppControllerMock.unblockUser.mockResolvedValue(undefined);
  mobileAppControllerMock.addGroupMembers.mockResolvedValue(undefined);
  mobileAppControllerMock.removeGroupMember.mockResolvedValue(undefined);
  mobileAppControllerMock.updateGroupMemberRole.mockResolvedValue(undefined);
  mobileAppControllerMock.updateGroupMemberMute.mockResolvedValue(undefined);
  mobileAppControllerMock.transferGroupOwner.mockResolvedValue(undefined);
  mobileAppControllerMock.updateGroupProfile.mockResolvedValue(undefined);
  mobileAppControllerMock.updateGroupAnnouncement.mockResolvedValue(undefined);
  mobileAppControllerMock.updateGroupSettings.mockResolvedValue(undefined);
  mobileAppControllerMock.leaveConversation.mockResolvedValue(undefined);
  mobileAppControllerMock.disbandConversation.mockResolvedValue(undefined);

  mobileRealtimeClientMock.addStatusListener.mockImplementation(() =>
    jest.fn()
  );
  mobileRealtimeClientMock.addMessageListener.mockImplementation(() =>
    jest.fn()
  );
  mobileRealtimeClientMock.sendChatMessage.mockResolvedValue({
    server_message_id: 101
  });
  mobileRealtimeClientMock.sendMessage.mockResolvedValue(undefined);

  mobileServerApiMock.getCallIceConfig.mockResolvedValue({
    data: {
      ice_servers: [{ urls: "stun:127.0.0.1:3478" }]
    }
  });
  mobileServerApiMock.registerCurrentDevice.mockResolvedValue({
    data: {
      device_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
      push_token: "push-token-test",
      updated: true
    }
  });
  mobileServerApiMock.getCallState.mockResolvedValue({
    data: {
      session: createMockCallSession().session,
      participants: createMockCallSession().participants
    }
  });
  mobileServerApiMock.getCallRoomConfig.mockResolvedValue({
    data: {
      url: "wss://livekit.example.test",
      token: "room-token"
    }
  });
  mobileServerApiMock.getUserProfile.mockResolvedValue({
    data: {
      id: 2,
      username: "bob",
      nickname: "Bob",
      avatar_url: null,
      signature: "",
      gender: 0
    }
  });
  mobileServerApiMock.searchUsers.mockResolvedValue({
    data: []
  });
  mobileServerApiMock.matchContacts.mockResolvedValue({
    data: {
      matched_users: []
    }
  });
  mobileServerApiMock.saveContact.mockResolvedValue({
    data: {}
  });
  mobileServerApiMock.getLimits.mockResolvedValue({
    data: {
      attachments: { image: 50_000_000, video: 200_000_000, file: 200_000_000 },
      texts: {},
      upload: {}
    }
  });
  mobileServerApiMock.createDirectConversation.mockResolvedValue({
    data: null
  });
  mobileServerApiMock.createConversation.mockResolvedValue({
    data: {
      id: "server-conversation-new"
    }
  });
  mobileServerApiMock.getUsersPresence.mockResolvedValue({
    data: []
  });

  uploadMobileFileMock.mockResolvedValue({
    upload_id: "upload-test-1",
    object_name: "upload-test-1.bin",
    originalname: "uploaded.bin",
    url: "https://example.test/uploaded.bin",
    size: 123,
    mime_type: "application/octet-stream"
  });
}

function resolveNextState<T>(current: T, next: T | ((value: T) => T)) {
  return typeof next === "function" ? (next as (value: T) => T)(current) : next;
}

function createSetter<T>(state: Record<string, unknown>, key: string) {
  return (next: T | ((value: T) => T)) => {
    state[key] = resolveNextState(state[key] as T, next);
    if (key === "callSession") {
      (
        state.callSessionRef as { current: MobileCallUiSession | null }
      ).current = state[key] as MobileCallUiSession | null;
    }
  };
}

export function createMockConversation(
  overrides: Partial<Conversation> = {}
): Conversation {
  return {
    client_conversation_id: "conversation-1",
    server_conversation_id: "server-conversation-1",
    type: 1,
    peer_id: 2,
    name: "Alice",
    display_name: "Alice",
    draft: "",
    settings: null,
    members: [],
    unread_count: 0,
    mention_count: 0,
    is_muted: 0,
    is_pinned: 0,
    created_at: "2026-04-08T00:00:00.000Z",
    updated_at: "2026-04-08T00:00:00.000Z",
    ...overrides
  } as Conversation;
}

export function createMockMessage(
  overrides: Partial<Message> = {}
): Message & { messageClassify: "chat" } {
  return {
    client_message_id: "message-1",
    client_conversation_id: "conversation-1",
    server_message_id: "server-message-1",
    server_conversation_id: "server-conversation-1",
    sender_id: 1,
    sequence: 1,
    type: 1,
    status: 0,
    content: {
      type: 1,
      text: "hello"
    },
    created_at: "2026-04-08T00:00:00.000Z",
    updated_at: "2026-04-08T00:00:00.000Z",
    is_recalled: 0,
    is_pinned: 0,
    is_favorited: 0,
    messageClassify: "chat",
    ...overrides
  } as Message & { messageClassify: "chat" };
}

export function createMockFriend(
  overrides: Partial<ContactListItem> = {}
): ContactListItem {
  return {
    user_id: 2,
    nickname: "Bob",
    username: "bob",
    gender: 0,
    is_blocked: false,
    updated_at: "2026-04-08T00:00:00.000Z",
    ...overrides
  } as ContactListItem;
}

export function createMockDevice(
  overrides: Partial<UserManagedDevice> = {}
): UserManagedDevice {
  return {
    device_id: "device-1",
    device_name: "Test Phone",
    device_type: 3,
    is_current_device: false,
    disabled_at: null,
    last_active_at: "2026-04-08T00:00:00.000Z",
    created_at: "2026-04-08T00:00:00.000Z",
    ...overrides
  } as UserManagedDevice;
}

export function createMockCallSession(
  overrides: Partial<MobileCallUiSession> = {}
): MobileCallUiSession {
  return {
    call_id: "call-1",
    conversation_id: "server-conversation-1",
    call_scope: CALL_SCOPE_DIRECT,
    media_type: CALL_MEDIA_TYPE_AUDIO,
    requested_media_type: CALL_MEDIA_TYPE_AUDIO,
    direction: "incoming",
    phase: "ringing",
    conversation_label: "Alice",
    session: {
      call_id: "call-1",
      conversation_id: "server-conversation-1",
      call_scope: CALL_SCOPE_DIRECT,
      media_type: CALL_MEDIA_TYPE_AUDIO,
      initiator_user_id: 2,
      status: CALL_STATUS_RINGING,
      active_device_count: 1,
      participant_count: 2,
      started_at: "2026-04-08T00:00:00.000Z",
      answered_at: null,
      ended_at: null,
      end_reason: null,
      created_at: "2026-04-08T00:00:00.000Z",
      updated_at: "2026-04-08T00:00:00.000Z"
    },
    participants: [
      {
        call_id: "call-1",
        conversation_id: "server-conversation-1",
        user_id: 2,
        device_id: "peer-device",
        participant_role: CALL_PARTICIPANT_ROLE_INVITEE,
        participant_status: CALL_PARTICIPANT_STATUS_INVITED,
        audio_enabled: true,
        video_enabled: false,
        participation_mode: "audio_only",
        created_at: "2026-04-08T00:00:00.000Z",
        updated_at: "2026-04-08T00:00:00.000Z"
      }
    ],
    local_audio_enabled: true,
    local_video_enabled: false,
    local_participation_mode: "audio_only",
    ...overrides
  };
}

export function createMockState(overrides: MockStateOverrides = {}) {
  const activeConversation = createMockConversation();
  const state: Record<string, unknown> = {
    snapshot: {
      auth: {
        accessToken: "token",
        refreshToken: "refresh",
        user: {
          userId: 1,
          username: "alice",
          nickname: "Alice",
          device_id: "device-1"
        },
        profile: null
      },
      data: {
        conversations: [activeConversation],
        contacts: [createMockFriend()],
        messagesByConversation: {
          [activeConversation.client_conversation_id]: [createMockMessage()]
        }
      },
      // HomeScreen 读取 snapshot.metrics.{syncing,completedAt}（首屏 sync 状态）。
      metrics: {
        syncing: false,
        completedAt: null,
        startedAt: null
      }
    },
    conversations: [activeConversation],
    friends: [createMockFriend()],
    activeConversation,
    activeConversationId: activeConversation.client_conversation_id,
    composerText: "",
    composerToolsVisible: false,
    sendImageAsOriginal: false,
    pendingImageAsset: null,
    imagePreviewVisible: false,
    imagePreviewSendTopRight: false,
    cameraOverlayVisible: false,
    userPresenceByUserId: {},
    typingConversationId: null,
    peerTypingActivity: null,
    peerProfileVisible: false,
    peerProfileTargetUserId: null,
    peerProfileFallbackNickname: "",
    peerProfileFallbackAvatar: null,
    addEntryMenuVisible: false,
    contactRequestsVisible: false,
    replyTargetId: null,
    selectedMessageId: null,
    forwardingMessageId: null,
    previewImageUrl: null,
    previewImageName: "",
    previewVideo: null,
    selectedStrangerProfiles: [],
    highlightedMessageId: null,
    highlightRequestNonce: 0,
    isSearchNavigating: false,
    pending: false,
    error: "",
    status: { text: "", level: "user" as const, ts: 0 },
    catchingUp: false,
    typersByConversationId: {},
    pinnedRefreshNonce: 0,
    pinnedMessages: [],
    pinnedMessagesVisible: false,
    isSearchVisible: false,
    searchFilter: "all",
    activeMessages: [],
    tab: "chats",
    isAuthenticated: true,
    devices: [],
    securityEvents: [],
    devicesLoading: false,
    privacySettings: {
      discoverable_by_username: 0,
      discoverable_by_phone: 1,
      message_permission: 1
    },
    privacyLoading: false,
    addressBookMatches: [],
    addressBookPermission: "unknown",
    addressBookSyncing: false,
    attachmentCenterVisible: false,
    attachmentTab: "media",
    attachmentItems: { media: [], files: [] },
    groupManageVisible: false,
    groupNameDraft: "测试群",
    groupDescriptionDraft: "",
    groupAnnouncementDraft: "",
    groupMuteAll: false,
    groupInvitePermission: "all_members",
    groupProfileEditPermission: "admins",
    groupSettings: {
      mute_all: false,
      invite_permission: "all_members",
      profile_edit_permission: "admins"
    },
    selectedAddMemberIds: [],
    searchKeyword: "",
    searchResults: [],
    profileForm: {
      nickname: "Alice",
      avatar_url: "",
      email: "",
      phone: "",
      gender: 0,
      birthday: "",
      signature: "hello"
    },
    voiceRecordingActive: false,
    voicePlayingMessageId: null,
    voicePlayingPositionMs: 0,
    voiceMeteringSamplesRef: { current: [] as number[] },
    currentGroupMember: null,
    callSession: null,
    localCallStreamUrl: null,
    remoteCallStreamUrl: null,
    callIceInfo: null,
    callRoomInfo: null,
    callDismissTimerRef: {
      current: null as ReturnType<typeof setTimeout> | null
    },
    callSessionRef: { current: null as MobileCallUiSession | null },
    localCallStreamRef: { current: null },
    remoteCallStreamRef: { current: null },
    peerConnectionRef: { current: null },
    peerConnectionCallIdRef: { current: null as string | null },
    pendingIceCandidatesRef: {
      current: [] as Array<{
        candidate: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      }>
    },
    offerCreationKeyRef: { current: null as string | null },
    typingIndicatorTimerRef: {
      current: null as ReturnType<typeof setTimeout> | null
    },
    typingSignalTimerRef: {
      current: null as ReturnType<typeof setTimeout> | null
    },
    lastTypingSignalKeyRef: { current: "" },
    typersIdleTimersRef: {
      current: {} as Record<string, ReturnType<typeof setTimeout>>
    }
  };

  Object.assign(state, overrides);

  // setStatus has a level-aware signature: `(text, level = "user") => void`.
  // The mock stores the full StatusMessage object so assertions can inspect
  // both `.text` and `.level`.
  state.setStatus = (
    text: string,
    level: "user" | "silent" | "debug" = "user"
  ) => {
    state.status = { text, level, ts: Date.now() };
  };
  state.setCatchingUp = createSetter<boolean>(state, "catchingUp");
  state.setTypersByConversationId = createSetter<Record<number, unknown>>(
    state,
    "typersByConversationId"
  );
  state.setPinnedMessages = createSetter<unknown[]>(state, "pinnedMessages");
  state.setPinnedMessagesVisible = createSetter<boolean>(
    state,
    "pinnedMessagesVisible"
  );
  state.setIsSearchVisible = createSetter<boolean>(state, "isSearchVisible");
  state.setSnapshot = createSetter<Record<string, unknown>>(state, "snapshot");
  state.setError = createSetter<string>(state, "error");
  state.setPending = createSetter<boolean>(state, "pending");
  state.setTab = createSetter<string>(state, "tab");
  state.setComposerText = createSetter<string>(state, "composerText");
  state.setComposerToolsVisible = createSetter<boolean>(
    state,
    "composerToolsVisible"
  );
  state.setSendImageAsOriginal = createSetter<boolean>(
    state,
    "sendImageAsOriginal"
  );
  state.setPendingImageAsset = createSetter<unknown>(
    state,
    "pendingImageAsset"
  );
  state.setImagePreviewVisible = createSetter<boolean>(
    state,
    "imagePreviewVisible"
  );
  state.setImagePreviewSendTopRight = createSetter<boolean>(
    state,
    "imagePreviewSendTopRight"
  );
  state.setCameraOverlayVisible = createSetter<boolean>(
    state,
    "cameraOverlayVisible"
  );
  state.setReplyTargetId = createSetter<string | null>(state, "replyTargetId");
  state.setSelectedMessageId = createSetter<string | null>(
    state,
    "selectedMessageId"
  );
  state.setForwardingMessageId = createSetter<string | null>(
    state,
    "forwardingMessageId"
  );
  state.setHighlightedMessageId = createSetter<string | null>(
    state,
    "highlightedMessageId"
  );
  state.bumpHighlightRequestNonce = () => {
    state.highlightRequestNonce = Number(state.highlightRequestNonce || 0) + 1;
  };
  state.bumpPinnedRefresh = () => {
    state.pinnedRefreshNonce = Number(state.pinnedRefreshNonce || 0) + 1;
  };
  state.clearPreviewImage = jest.fn(() => {
    state.previewImageUrl = null;
    state.previewImageName = "";
  });
  state.setIsSearchNavigating = createSetter<boolean>(
    state,
    "isSearchNavigating"
  );
  state.setActiveConversationId = createSetter<string | null>(
    state,
    "activeConversationId"
  );
  state.setUserPresenceByUserId = createSetter<Record<number, unknown>>(
    state,
    "userPresenceByUserId"
  );
  state.setTypingConversationId = createSetter<string | null>(
    state,
    "typingConversationId"
  );
  state.setPeerTypingActivity = createSetter<"text" | "voice" | null>(
    state,
    "peerTypingActivity"
  );
  state.setPeerProfileVisible = createSetter<boolean>(
    state,
    "peerProfileVisible"
  );
  state.setPeerProfileTargetUserId = createSetter<number | null>(
    state,
    "peerProfileTargetUserId"
  );
  state.setPeerProfileFallbackNickname = createSetter<string>(
    state,
    "peerProfileFallbackNickname"
  );
  state.setPeerProfileFallbackAvatar = createSetter<string | null>(
    state,
    "peerProfileFallbackAvatar"
  );
  state.setAddEntryMenuVisible = createSetter<boolean>(
    state,
    "addEntryMenuVisible"
  );
  state.setContactRequestsVisible = createSetter<boolean>(
    state,
    "contactRequestsVisible"
  );
  state.setPreviewImageUrl = createSetter<string | null>(
    state,
    "previewImageUrl"
  );
  state.setPreviewImageName = createSetter<string>(state, "previewImageName");
  state.setPreviewVideo = createSetter<{
    uri: string;
    uploadId?: string | null;
  } | null>(state, "previewVideo");
  state.setSelectedStrangerProfiles = createSetter<unknown[]>(
    state,
    "selectedStrangerProfiles"
  );
  state.setAttachmentCenterVisible = createSetter<boolean>(
    state,
    "attachmentCenterVisible"
  );
  state.setAttachmentItems = createSetter<{
    media: unknown[];
    files: unknown[];
  }>(state, "attachmentItems");
  state.setAttachmentTab = createSetter<string>(state, "attachmentTab");
  state.setGroupManageVisible = createSetter<boolean>(
    state,
    "groupManageVisible"
  );
  state.setSearchKeyword = createSetter<string>(state, "searchKeyword");
  state.setSearchResults = createSetter<unknown[]>(state, "searchResults");
  state.setDevices = createSetter<unknown[]>(state, "devices");
  state.setSecurityEvents = createSetter<unknown[]>(state, "securityEvents");
  state.setDevicesLoading = createSetter<boolean>(state, "devicesLoading");
  state.setPrivacySettings = createSetter<unknown>(state, "privacySettings");
  state.setPrivacyLoading = createSetter<boolean>(state, "privacyLoading");
  state.setAddressBookMatches = createSetter<unknown[]>(
    state,
    "addressBookMatches"
  );
  state.setAddressBookPermission = createSetter<string>(
    state,
    "addressBookPermission"
  );
  state.setAddressBookSyncing = createSetter<boolean>(
    state,
    "addressBookSyncing"
  );
  state.setProfileForm = createSetter<Record<string, unknown>>(
    state,
    "profileForm"
  );
  state.setGroupNameDraft = createSetter<string>(state, "groupNameDraft");
  state.setGroupDescriptionDraft = createSetter<string>(
    state,
    "groupDescriptionDraft"
  );
  state.setGroupAnnouncementDraft = createSetter<string>(
    state,
    "groupAnnouncementDraft"
  );
  state.setGroupMuteAll = createSetter<boolean>(state, "groupMuteAll");
  state.setGroupInvitePermission = createSetter<string>(
    state,
    "groupInvitePermission"
  );
  state.setGroupProfileEditPermission = createSetter<string>(
    state,
    "groupProfileEditPermission"
  );
  state.setSelectedAddMemberIds = createSetter<number[]>(
    state,
    "selectedAddMemberIds"
  );
  state.setVoiceRecordingActive = createSetter<boolean>(
    state,
    "voiceRecordingActive"
  );
  state.setVoicePlayingMessageId = createSetter<string | null>(
    state,
    "voicePlayingMessageId"
  );
  state.setVoicePlayingPositionMs = createSetter<number>(
    state,
    "voicePlayingPositionMs"
  );
  state.setCallSession = createSetter<MobileCallUiSession | null>(
    state,
    "callSession"
  );
  state.setLocalCallStreamUrl = createSetter<string | null>(
    state,
    "localCallStreamUrl"
  );
  state.setRemoteCallStreamUrl = createSetter<string | null>(
    state,
    "remoteCallStreamUrl"
  );
  state.setCallIceInfo = createSetter<unknown>(state, "callIceInfo");
  state.setCallRoomInfo = createSetter<unknown>(state, "callRoomInfo");
  const callDismissTimerRef = state.callDismissTimerRef as {
    current: ReturnType<typeof setTimeout> | null;
  };
  const callSessionRef = state.callSessionRef as {
    current: MobileCallUiSession | null;
  };
  state.clearCallDismissTimer = jest.fn(() => {
    if (callDismissTimerRef.current) {
      clearTimeout(callDismissTimerRef.current);
      callDismissTimerRef.current = null;
    }
  });
  state.dismissCallSessionNow = jest.fn(() => {
    (state.clearCallDismissTimer as () => void)();
    state.callSession = null;
    state.localCallStreamUrl = null;
    state.remoteCallStreamUrl = null;
    callSessionRef.current = null;
    state.callRoomInfo = null;
    state.callIceInfo = null;
    (state.localCallStreamRef as { current: unknown }).current = null;
    (state.remoteCallStreamRef as { current: unknown }).current = null;
    (state.peerConnectionRef as { current: unknown }).current = null;
    (state.peerConnectionCallIdRef as { current: string | null }).current =
      null;
    (
      state.pendingIceCandidatesRef as {
        current: Array<{
          candidate: string;
          sdpMid?: string | null;
          sdpMLineIndex?: number | null;
          usernameFragment?: string | null;
        }>;
      }
    ).current = [];
    (state.offerCreationKeyRef as { current: string | null }).current = null;
  });

  return state as any;
}

export function createRunAction(state?: {
  setStatus: (text: string, level?: "user" | "silent" | "debug") => void;
  setError?: (value: string) => void;
  setPending?: (value: boolean) => void;
}) {
  return jest.fn(
    async (
      nextStatus: string,
      action: () => Promise<unknown>,
      doneStatus: string
    ) => {
      state?.setPending?.(true);
      state?.setError?.("");
      state?.setStatus(nextStatus);
      try {
        await action();
        state?.setStatus(doneStatus);
      } finally {
        state?.setPending?.(false);
      }
    }
  );
}

export async function flushMicrotasks() {
  await new Promise<void>(resolve => {
    setImmediate(() => resolve());
  });
}
