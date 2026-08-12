import { createApiTransport, type ApiTransportOptions } from "./client";
import type {
  AddConversationMembersRequest,
  ApiResult,
  BlockUserRequest,
  CallIceConfigResponse,
  CallRoomConfigResponse,
  CallStateResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  ContactMatchRequest,
  ContactMatchResponse,
  LookupContactByPhoneRequest,
  LookupContactByPhoneResponse,
  ConversationMemberMutationResponse,
  ConversationSyncParams,
  ConversationSyncResponse,
  CreateConversationRequest,
  CreateConversationResponse,
  CreateDirectConversationRequest,
  DeleteConversationRequest,
  DisbandConversationRequest,
  LeaveConversationRequest,
  LoginRequest,
  LoginResponse,
  LogoutAllDevicesRequest,
  LogoutDevicesResponse,
  LogoutDeviceRequest,
  RefreshTokenRequest,
  RegisterCurrentDeviceRequest,
  RegisterCurrentDeviceResponse,
  RegisterRequest,
  UpdateDeviceStatusRequest,
  UpdateDeviceStatusResponse,
  UpdateUserNotificationSettingsRequest,
  MarkConversationReadRequest,
  MarkConversationReadResponse,
  ConversationReadStateResponse,
  MessageDeltaParams,
  MessageDeltaResponse,
  MessageListParams,
  MessageAroundParams,
  MessageListResponse,
  MessageSyncCursor,
  MessageStateSyncParams,
  MessageStateSyncResponse,
  RecallMessageRequest,
  RecallMessageResponse,
  SetMessageReactionRequest,
  SetMessageReactionResponse,
  ListMessageReactionsParams,
  ListMessageReactionsResponse,
  ListReactionDeltaParams,
  ListReactionDeltaResponse,
  RemoveConversationMemberRequest,
  RemoteConversationMember,
  RemoteMessage,
  SearchUsersParams,
  SaveContactRequest,
  SaveContactResponse,
  TransferConversationOwnerRequest,
  UpdateContactRequest,
  UnblockUserRequest,
  UpdateUserPrivacySettingsRequest,
  UpdateConversationAnnouncementRequest,
  UpdateConversationMemberMuteRequest,
  UpdateConversationSettingsRequest,
  UpdateMessageStateRequest,
  UpdateMessageStateResponse,
  UpdateConversationStateRequest,
  UpdateConversationProfileRequest,
  UpdateUserProfileRequest,
  UpdateConversationMemberRoleRequest,
  UserDevicesResponse,
  UserPresenceEntry,
  UserPresenceSummary,
  UserProfile,
  UserBlocksResponse,
  UserContactsResponse,
  UserNotificationSettings,
  UserPrivacySettingsEnvelope,
  UserSecurityEventsResponse,
  UserSessionSummary,
  UserSearchResult,
  AbortAttachmentUploadRequest,
  AbortAttachmentUploadResponse,
  RefreshAttachmentUrlsRequest,
  RefreshAttachmentUrlsResponse,
  AttachmentPartUrlRequest,
  AttachmentPartUrlResponse,
  CompleteAttachmentUploadRequest,
  CompleteAttachmentUploadResponse,
  InitiateAttachmentUploadRequest,
  InitiateAttachmentUploadResponse,
  LimitsConfigResponse
} from "../types/api";

export type MushroomApi = ReturnType<typeof createMushroomApi>;

export function createMushroomApi(options: ApiTransportOptions) {
  const transport = createApiTransport(options);

  return {
    login(body: LoginRequest): Promise<ApiResult<LoginResponse>> {
      return transport.post("/auth/login", { body });
    },
    refreshTokens(
      body: RefreshTokenRequest
    ): Promise<ApiResult<LoginResponse>> {
      return transport.post("/auth/refresh", { body });
    },
    registerCurrentDevice(
      body: RegisterCurrentDeviceRequest
    ): Promise<ApiResult<RegisterCurrentDeviceResponse>> {
      return transport.post("/auth/device/register", { body });
    },
    register(body: RegisterRequest): Promise<ApiResult<UserProfile>> {
      return transport.post("/auth/register", { body });
    },
    profile(): Promise<ApiResult<UserProfile>> {
      return transport.get("/auth/profile");
    },
    getUserProfile(userId: number): Promise<ApiResult<UserProfile>> {
      return transport.get("/auth/user", {
        query: {
          userId
        }
      });
    },
    updateProfile(
      body: UpdateUserProfileRequest
    ): Promise<ApiResult<UserProfile>> {
      return transport.post("/auth/profile", { body });
    },
    changePassword(
      body: ChangePasswordRequest
    ): Promise<ApiResult<ChangePasswordResponse>> {
      return transport.post("/auth/password", { body });
    },
    session(): Promise<ApiResult<UserSessionSummary>> {
      return transport.get("/auth/session");
    },
    presenceSummary(): Promise<ApiResult<UserPresenceSummary>> {
      return transport.get("/auth/presence-summary");
    },
    getUsersPresence(query: {
      user_ids: string;
    }): Promise<ApiResult<UserPresenceEntry[]>> {
      return transport.get("/auth/presence-batch", { query });
    },
    getDevices(): Promise<ApiResult<UserDevicesResponse>> {
      return transport.get("/auth/devices");
    },
    logoutCurrent(): Promise<ApiResult<null>> {
      return transport.post("/auth/logout");
    },
    /**
     * 客户端切换账号 / wipe-logout 前调用：清服务端登记的当前设备
     * `push_token` 并把设备状态置 2。device 完全取自 JWT，不接受 body。
     * 调用方应在拿到响应（无论成败）后再发 `logoutCurrent()`。
     */
    unregisterCurrentDevice(): Promise<ApiResult<{ updated: boolean }>> {
      return transport.post("/auth/device/unregister");
    },
    logoutDevice(
      body: LogoutDeviceRequest
    ): Promise<ApiResult<LogoutDevicesResponse>> {
      return transport.post("/auth/logout-device", { body });
    },
    logoutAllDevices(
      body: LogoutAllDevicesRequest
    ): Promise<ApiResult<LogoutDevicesResponse>> {
      return transport.post("/auth/logout-all", { body });
    },
    disableDevice(
      body: UpdateDeviceStatusRequest
    ): Promise<ApiResult<UpdateDeviceStatusResponse>> {
      return transport.post("/auth/device/disable", { body });
    },
    restoreDevice(
      body: UpdateDeviceStatusRequest
    ): Promise<ApiResult<UpdateDeviceStatusResponse>> {
      return transport.post("/auth/device/restore", { body });
    },
    getSecurityEvents(query?: {
      limit?: number;
    }): Promise<ApiResult<UserSecurityEventsResponse>> {
      return transport.get("/auth/security-events", { query });
    },
    getCallIceConfig(): Promise<ApiResult<CallIceConfigResponse>> {
      return transport.get("/auth/call/ice");
    },
    getCallRoomConfig(query: {
      callId: string;
    }): Promise<ApiResult<CallRoomConfigResponse>> {
      return transport.get("/auth/call/room", { query });
    },
    getCallState(query: {
      callId: string;
    }): Promise<ApiResult<CallStateResponse>> {
      return transport.get("/auth/call/state", { query });
    },
    searchUsers(
      query: SearchUsersParams
    ): Promise<ApiResult<UserSearchResult[]>> {
      return transport.get("/auth/search", { query });
    },
    getContacts(): Promise<ApiResult<UserContactsResponse>> {
      return transport.get("/auth/contacts");
    },
    matchContacts(
      body: ContactMatchRequest
    ): Promise<ApiResult<ContactMatchResponse>> {
      return transport.post("/auth/contacts/match", { body });
    },
    lookupContactByPhone(
      body: LookupContactByPhoneRequest
    ): Promise<ApiResult<LookupContactByPhoneResponse>> {
      return transport.post("/auth/contacts/lookup-phone", { body });
    },
    saveContact(
      body: SaveContactRequest
    ): Promise<ApiResult<SaveContactResponse>> {
      return transport.post("/auth/contacts", { body });
    },
    updateContact(
      contactUserId: number,
      body: UpdateContactRequest
    ): Promise<ApiResult<SaveContactResponse>> {
      return transport.put(`/auth/contacts/${contactUserId}`, { body });
    },
    getBlocks(): Promise<ApiResult<UserBlocksResponse>> {
      return transport.get("/auth/blocks");
    },
    getPrivacySettings(): Promise<ApiResult<UserPrivacySettingsEnvelope>> {
      return transport.get("/auth/privacy");
    },
    updatePrivacySettings(
      body: UpdateUserPrivacySettingsRequest
    ): Promise<ApiResult<UserPrivacySettingsEnvelope>> {
      return transport.put("/auth/privacy", { body });
    },
    getNotificationSettings(): Promise<ApiResult<UserNotificationSettings>> {
      return transport.get("/auth/notification-settings");
    },
    updateNotificationSettings(
      body: UpdateUserNotificationSettingsRequest
    ): Promise<ApiResult<UserNotificationSettings>> {
      return transport.put("/auth/notification-settings", { body });
    },
    createConversation(
      body: CreateConversationRequest
    ): Promise<ApiResult<CreateConversationResponse>> {
      return transport.post("/conversation/create", { body });
    },
    createDirectConversation(
      body: CreateDirectConversationRequest
    ): Promise<ApiResult<CreateConversationResponse>> {
      return transport.post("/conversation/direct", { body });
    },
    addConversationMembers(
      body: AddConversationMembersRequest
    ): Promise<ApiResult<ConversationMemberMutationResponse>> {
      return transport.post("/conversation/members/add", { body });
    },
    leaveConversation(
      body: LeaveConversationRequest
    ): Promise<ApiResult<ConversationMemberMutationResponse>> {
      return transport.post("/conversation/leave", { body });
    },
    deleteConversation(
      body: DeleteConversationRequest
    ): Promise<ApiResult<null>> {
      return transport.post("/conversation/delete", { body });
    },
    disbandConversation(
      body: DisbandConversationRequest
    ): Promise<ApiResult<null>> {
      return transport.post("/conversation/disband", { body });
    },
    removeConversationMember(
      body: RemoveConversationMemberRequest
    ): Promise<ApiResult<ConversationMemberMutationResponse>> {
      return transport.post("/conversation/members/remove", { body });
    },
    updateConversationMemberRole(
      body: UpdateConversationMemberRoleRequest
    ): Promise<ApiResult<ConversationMemberMutationResponse>> {
      return transport.post("/conversation/members/role", { body });
    },
    transferConversationOwner(
      body: TransferConversationOwnerRequest
    ): Promise<ApiResult<ConversationMemberMutationResponse>> {
      return transport.post("/conversation/owner/transfer", { body });
    },
    updateConversationProfile(
      body: UpdateConversationProfileRequest
    ): Promise<ApiResult<CreateConversationResponse>> {
      return transport.post("/conversation/profile", { body });
    },
    updateConversationAnnouncement(
      body: UpdateConversationAnnouncementRequest
    ): Promise<ApiResult<CreateConversationResponse>> {
      return transport.post("/conversation/announcement", { body });
    },
    updateConversationSettings(
      body: UpdateConversationSettingsRequest
    ): Promise<ApiResult<CreateConversationResponse>> {
      return transport.post("/conversation/settings", { body });
    },
    updateConversationState(
      body: UpdateConversationStateRequest
    ): Promise<ApiResult<CreateConversationResponse>> {
      return transport.post("/conversation/state", { body });
    },
    updateConversationMemberMute(
      body: UpdateConversationMemberMuteRequest
    ): Promise<ApiResult<ConversationMemberMutationResponse>> {
      return transport.post("/conversation/members/mute", { body });
    },
    syncConversations(
      query: ConversationSyncParams = {}
    ): Promise<ApiResult<ConversationSyncResponse>> {
      return transport.get("/conversation/sync", { query });
    },
    getConversationMembers(query: {
      conversationId: number;
    }): Promise<ApiResult<RemoteConversationMember[]>> {
      return transport.get("/conversation/members", { query });
    },
    markConversationRead(
      body: MarkConversationReadRequest
    ): Promise<ApiResult<MarkConversationReadResponse>> {
      return transport.post("/conversation/read", { body });
    },
    getConversationReadState(
      conversationId: number | string
    ): Promise<ApiResult<ConversationReadStateResponse>> {
      return transport.get(`/conversation/${conversationId}/read-state`);
    },
    deleteContactById(contactUserId: number): Promise<ApiResult<null>> {
      return transport.delete(`/auth/contacts/${contactUserId}`);
    },
    blockUser(body: BlockUserRequest): Promise<ApiResult<null>> {
      return transport.post("/auth/block", { body });
    },
    unblockUser(body: UnblockUserRequest): Promise<ApiResult<null>> {
      return transport.post("/auth/unblock", { body });
    },
    syncMessages(
      body: MessageSyncCursor[]
    ): Promise<ApiResult<RemoteMessage[]>> {
      return transport.post("/message/sync", { body });
    },
    listMessages(
      query: MessageListParams
    ): Promise<ApiResult<MessageListResponse>> {
      return transport.get("/message/list", { query });
    },
    listMessagesAround(
      query: MessageAroundParams
    ): Promise<ApiResult<MessageListResponse>> {
      return transport.get("/message/around", { query });
    },
    syncMessageDelta(
      query: MessageDeltaParams
    ): Promise<ApiResult<MessageDeltaResponse>> {
      return transport.get("/message/delta", { query });
    },
    recallMessage(
      body: RecallMessageRequest
    ): Promise<ApiResult<RecallMessageResponse>> {
      return transport.post("/message/recall", { body });
    },
    syncMessageStates(
      query: MessageStateSyncParams = {}
    ): Promise<ApiResult<MessageStateSyncResponse>> {
      return transport.get("/message/state/sync", { query });
    },
    updateMessageState(
      body: UpdateMessageStateRequest
    ): Promise<ApiResult<UpdateMessageStateResponse>> {
      return transport.post("/message/state", { body });
    },
    setMessageReaction(
      body: SetMessageReactionRequest
    ): Promise<ApiResult<SetMessageReactionResponse>> {
      return transport.post("/message/reaction", { body });
    },
    listMessageReactions(
      query: ListMessageReactionsParams
    ): Promise<ApiResult<ListMessageReactionsResponse>> {
      return transport.get("/message/reactions", { query });
    },
    /**
     * Pull reaction delta events for a conversation, ordered by per-conversation
     * sequence ascending. Returns both active reactions and tombstones (`is_deleted=1`).
     * Clients should use the largest returned sequence as the new cursor and continue
     * paging while `has_more` is true.
     */
    listReactionDeltas(
      query: ListReactionDeltaParams
    ): Promise<ApiResult<ListReactionDeltaResponse>> {
      return transport.get("/message/reactions/delta", { query });
    },
    /** 获取服务端下发的运行时限额（消息长度 / 附件大小 / 分片配置）。 */
    getLimits(): Promise<ApiResult<LimitsConfigResponse>> {
      return transport.get("/api/config/limits");
    },
    /** 开启一次附件上传，服务端会返回 single PUT URL 或 multipart uploadId。 */
    initiateAttachmentUpload(
      body: InitiateAttachmentUploadRequest
    ): Promise<ApiResult<InitiateAttachmentUploadResponse>> {
      return transport.post("/file/attachment/initiate", { body });
    },
    /** 获取 multipart 上传单个分片的 presigned PUT URL。 */
    getAttachmentPartUrl(
      body: AttachmentPartUrlRequest
    ): Promise<ApiResult<AttachmentPartUrlResponse>> {
      return transport.post("/file/attachment/part-url", { body });
    },
    /** 完成上传：single 模式确认对象存在；multipart 模式聚合分片。 */
    completeAttachmentUpload(
      body: CompleteAttachmentUploadRequest
    ): Promise<ApiResult<CompleteAttachmentUploadResponse>> {
      return transport.post("/file/attachment/complete", { body });
    },
    /** 终止上传：multipart 模式触发 abortMultipartUpload；single 模式删除占位记录。 */
    abortAttachmentUpload(
      body: AbortAttachmentUploadRequest
    ): Promise<ApiResult<AbortAttachmentUploadResponse>> {
      return transport.post("/file/attachment/abort", { body });
    },
    /**
     * 刷新一组附件的预签名 URL（缓存的旧消息加载 403 时调用）。
     * 服务端会基于 attachment_uploads.object_name 即时签发新 URL。
     */
    refreshAttachmentUrls(
      body: RefreshAttachmentUrlsRequest
    ): Promise<ApiResult<RefreshAttachmentUrlsResponse>> {
      return transport.post("/file/attachment/refresh-urls", { body });
    }
  };
}

export * from "./client";
