import { Request, Response } from "express";
import type {
  AddConversationMembersRequest,
  ConversationMemberMutationResponse,
  ConversationReadStateResponse,
  ConversationSyncResponse,
  CreateDirectConversationRequest,
  CreateConversationResponse,
  DeleteConversationRequest,
  DisbandConversationRequest,
  LeaveConversationRequest,
  MarkConversationReadResponse,
  RemoveConversationMemberRequest,
  RemoteConversationMember,
  TransferConversationOwnerRequest,
  UpdateConversationAnnouncementRequest,
  UpdateConversationMemberMuteRequest,
  UpdateConversationSettingsRequest,
  UpdateConversationStateRequest,
  UpdateConversationProfileRequest,
  UpdateConversationMemberRoleRequest
} from "@mushroom/shared";
import ConversationQueryService from "../service/conversation/conversation_query_service";
import ConversationLifecycleService from "../service/conversation/conversation_lifecycle_service";
import ConversationProfileService from "../service/conversation/conversation_profile_service";
import ConversationMemberService from "../service/conversation/conversation_member_service";
import ConversationReadStateRepository from "../repository/conversation/conversation_read_state_repository";
import PrivacyRepository from "../repository/privacy_repository";
import { wrapAsync } from "../handler/response_wrapper";
import {
  toRemoteConversation,
  toRemoteConversationMember,
  toRemoteMessage
} from "../utils/dto";
import { BusinessError } from "../handler/business_error";
import {
  optionalQueryNumber,
  optionalQueryString,
  optionalNumberField,
  requireNumberField,
  requireStringField
} from "../handler/request_parser";
import { wsServer } from "../websocket";
import { decodeSyncCursor, encodeSyncCursor } from "../utils/sync_cursor";

async function dispatchConversationUpsert(
  userIds: number[],
  conversationId: string
) {
  await Promise.allSettled(
    Array.from(new Set(userIds)).map(userId =>
      wsServer.dispatchToUser(userId, {
        messageClassify: "conversation_sync",
        action: "upsert",
        conversation_id: conversationId
      })
    )
  );
}

async function dispatchConversationRemove(
  userIds: number[],
  conversationId: string
) {
  await Promise.allSettled(
    Array.from(new Set(userIds)).map(userId =>
      wsServer.dispatchToUser(userId, {
        messageClassify: "conversation_sync",
        action: "remove",
        conversation_id: conversationId
      })
    )
  );
}

export class ConversationController {
  static sync = wrapAsync(
    async (req: Request, res: Response): Promise<ConversationSyncResponse> => {
      void res;
      const pageSize = optionalQueryNumber(req, "pageSize") ?? 500;
      const userId = req.JwtPayload!.userId;
      const syncCursor = decodeSyncCursor(
        optionalQueryString(req, "syncCursor")
      );
      const lastSyncTimeStr = optionalQueryString(req, "lastSyncTime");
      const conversations = await ConversationQueryService.getConversations(
        userId,
        pageSize,
        syncCursor ??
          (lastSyncTimeStr
            ? {
                updated_at: new Date(lastSyncTimeStr).toISOString(),
                entity_id: "0"
              }
            : null)
      );
      let conversationsWithMembers: ConversationSyncResponse["conversations"] =
        [];
      if (conversations) {
        const ids = conversations.map(row => row.id);
        const members =
          await ConversationQueryService.getConversationMembers(ids);
        const memberMap = new Map();
        for (const m of members) {
          if (!memberMap.has(m.conversation_id)) {
            memberMap.set(m.conversation_id, []);
          }
          memberMap.get(m.conversation_id).push(m);
        }
        conversationsWithMembers = conversations.map(c =>
          toRemoteConversation({
            ...c,
            members: (memberMap.get(c.id) || []).map(toRemoteConversationMember)
          })
        );
      }
      // 找到最新更新时间
      const newLastSyncTime =
        conversationsWithMembers.length > 0
          ? new Date(
              Math.max(
                ...conversationsWithMembers.map(c =>
                  new Date(c.updated_at ?? 0).getTime()
                )
              )
            )
          : syncCursor
            ? new Date(syncCursor.updated_at)
            : lastSyncTimeStr
              ? new Date(lastSyncTimeStr)
              : new Date();
      const lastConversation =
        conversationsWithMembers[conversationsWithMembers.length - 1];
      return {
        conversations: conversationsWithMembers,
        nextSyncCursor:
          lastConversation && conversationsWithMembers.length >= pageSize
            ? encodeSyncCursor({
                updated_at:
                  lastConversation.updated_at ?? newLastSyncTime.toISOString(),
                entity_id: String(lastConversation.id)
              })
            : null,
        lastSyncTime: newLastSyncTime.toISOString()
      };
    }
  );

  static getMember = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<RemoteConversationMember[]> => {
      void res;
      const conversationId = optionalQueryString(req, "conversationId");
      if (conversationId === undefined) {
        throw new BusinessError("conversationId is required");
      }
      const userId = req.JwtPayload!.userId;
      const members =
        await ConversationQueryService.getConversationMembers(conversationId);
      if (!members.some(member => Number(member.user_id) === Number(userId))) {
        throw new BusinessError(
          "User is not an active member of this conversation",
          403
        );
      }
      return members.map(toRemoteConversationMember);
    }
  );

  static create = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<CreateConversationResponse> => {
      void res;
      const conv = (req.body as Record<string, unknown>).conv;
      const members = (req.body as Record<string, unknown>).members;
      if (!conv || typeof conv !== "object") {
        throw new BusinessError("conv is required");
      }
      if (!Array.isArray(members)) {
        throw new BusinessError("members is required");
      }
      const userId = req.JwtPayload!.userId;
      const inputMembers = members.map(member => ({
        user_id: requireNumberField(
          member,
          "user_id",
          "member.user_id is required"
        ),
        role: 0,
        nickname:
          typeof (member as Record<string, unknown>).nickname === "string"
            ? ((member as Record<string, unknown>).nickname as string)
            : undefined
      }));
      const sanitizedMembers = Array.from(
        new Map(
          [
            ...inputMembers.filter(member => member.user_id !== userId),
            {
              user_id: userId,
              role: 2,
              nickname:
                typeof (conv as Record<string, unknown>).owner_nickname ===
                "string"
                  ? ((conv as Record<string, unknown>).owner_nickname as string)
                  : undefined
            }
          ].map(member => [member.user_id, member])
        ).values()
      );
      const createdConversation =
        await ConversationLifecycleService.createConversation(
          {
            ...(conv as CreateConversationResponse),
            type: 2,
            owner_id: userId
          },
          sanitizedMembers
        );
      await dispatchConversationUpsert(
        createdConversation.members.map(member => member.user_id),
        String(createdConversation.id)
      );
      return toRemoteConversation({
        ...createdConversation,
        members: undefined
      });
    }
  );

  static direct = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<CreateConversationResponse> => {
      void res;
      const body = req.body as CreateDirectConversationRequest;
      const targetUserId = requireNumberField(
        body,
        "target_user_id",
        "target_user_id is required"
      );
      const conversation =
        await ConversationLifecycleService.createDirectConversation(
          req.JwtPayload!.userId,
          targetUserId
        );

      await dispatchConversationUpsert(
        conversation.members.map(member => member.user_id),
        String(conversation.id)
      );

      return toRemoteConversation({
        ...conversation,
        members: undefined
      });
    }
  );

  static updateProfile = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<CreateConversationResponse> => {
      void res;
      const body = req.body as UpdateConversationProfileRequest;
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );
      const name = requireStringField(body, "name", "name is required");
      const description =
        typeof body.description === "string" ? body.description : undefined;
      const avatarUrl =
        typeof body.avatar_url === "string" ? body.avatar_url : undefined;

      const result = await ConversationProfileService.updateConversationProfile(
        req.JwtPayload!.userId,
        conversationId,
        name,
        description,
        avatarUrl
      );
      const members =
        await ConversationQueryService.getConversationMembers(conversationId);
      await dispatchConversationUpsert(
        members.map(member => member.user_id),
        String(result.id)
      );

      return toRemoteConversation(result);
    }
  );

  static updateAnnouncement = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<CreateConversationResponse> => {
      void res;
      const body = req.body as UpdateConversationAnnouncementRequest;
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );
      const announcement =
        typeof body.announcement === "string" ? body.announcement : undefined;

      const result =
        await ConversationProfileService.updateConversationAnnouncement(
          req.JwtPayload!.userId,
          conversationId,
          announcement
        );
      await dispatchConversationUpsert(
        result.members.map(member => member.user_id),
        String(result.conversation.id)
      );

      return toRemoteConversation({
        ...result.conversation,
        members: result.members.map(toRemoteConversationMember)
      });
    }
  );

  static updateSettings = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<CreateConversationResponse> => {
      void res;
      const body = req.body as UpdateConversationSettingsRequest;
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );

      const result =
        await ConversationProfileService.updateConversationSettings(
          req.JwtPayload!.userId,
          conversationId,
          {
            mute_all:
              typeof body.mute_all === "boolean" ? body.mute_all : undefined,
            invite_permission:
              body.invite_permission === "all_members" ||
              body.invite_permission === "admins_only"
                ? body.invite_permission
                : undefined,
            profile_edit_permission:
              body.profile_edit_permission === "admins" ||
              body.profile_edit_permission === "owner_only"
                ? body.profile_edit_permission
                : undefined
          }
        );
      await dispatchConversationUpsert(
        result.members.map(member => member.user_id),
        String(result.conversation.id)
      );

      return toRemoteConversation({
        ...result.conversation,
        members: result.members.map(toRemoteConversationMember)
      });
    }
  );

  static updateState = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<CreateConversationResponse> => {
      void res;
      const body = req.body as UpdateConversationStateRequest;
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );
      const isPinned = optionalNumberField(body, "is_pinned");
      const isMuted = optionalNumberField(body, "is_muted");
      const isArchived = optionalNumberField(body, "is_archived");
      const hasDraft = Object.prototype.hasOwnProperty.call(body, "draft");
      const draft =
        hasDraft && typeof body.draft === "string"
          ? body.draft
          : hasDraft
            ? null
            : undefined;

      const result = await ConversationProfileService.updateConversationState(
        req.JwtPayload!.userId,
        conversationId,
        {
          isPinned: isPinned === undefined ? undefined : isPinned > 0,
          isMuted: isMuted === undefined ? undefined : isMuted > 0,
          isArchived: isArchived === undefined ? undefined : isArchived > 0,
          draft,
          draftProvided: hasDraft
        }
      );

      return toRemoteConversation(result);
    }
  );

  static deleteForSelf = wrapAsync(
    async (req: Request, res: Response): Promise<null> => {
      void res;
      const body = req.body as DeleteConversationRequest;
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );
      await ConversationProfileService.deleteConversationForSelf(
        req.JwtPayload!.userId,
        conversationId
      );
      return null;
    }
  );

  static markRead = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<MarkConversationReadResponse> => {
      void res;
      const body = req.body as Record<string, unknown>;
      const conversationIdRaw = body.conversationId;
      if (
        (typeof conversationIdRaw !== "string" ||
          conversationIdRaw.trim() === "") &&
        typeof conversationIdRaw !== "number"
      ) {
        throw new BusinessError("conversationId is required");
      }
      const conversationId = String(conversationIdRaw);
      const readSequence = optionalNumberField(body, "readSequence");
      const userId = req.JwtPayload!.userId;

      // P1 幂等短路：先用一次 SELECT 判断是否真的需要前进 last_read_seq。
      // 若 readSequence 未提供则默认推进到会话当前 message_seq；命中短路时
      // 直接返回当前状态，跳过事务、跳过 outbox 写入、跳过广播，避免重复 read
      // 在大群里造成 N×成员的写放大与 WS 风暴。
      const fastState = await ConversationReadStateRepository.getReadFastState(
        conversationId,
        userId
      );
      if (!fastState) {
        throw new BusinessError("User is not a member of this conversation");
      }
      const messageSeqUpperBound = fastState.message_seq;
      const desiredReadSeq = Math.max(
        0,
        Math.min(readSequence ?? messageSeqUpperBound, messageSeqUpperBound)
      );
      if (desiredReadSeq <= fastState.last_read_seq) {
        return {
          conversation_id: conversationId,
          read_seq: fastState.last_read_seq,
          unread_count: fastState.unread_count,
          updated_at: fastState.updated_at.toISOString()
        };
      }

      const members =
        await ConversationQueryService.getConversationMembers(conversationId);

      const result = await ConversationQueryService.markConversationRead(
        userId,
        conversationId,
        readSequence,
        {
          messageSeq: messageSeqUpperBound,
          memberUserIds: members.map(member => Number(member.user_id)),
          conversationType: fastState.conversation_type
        }
      );

      return {
        conversation_id: result.conversation_id,
        read_seq: result.read_seq,
        unread_count: result.unread_count,
        updated_at: result.updated_at.toISOString()
      };
    }
  );

  /**
   * GET /api/conversation/:id/read-state
   *
   * 群聊已读高水位补齐：当 WS 重连 / 打开会话 / 收到新成员消息时调用，
   * 客户端用返回的 entries 覆盖本端 (conv, user) -> last_read_seq 缓存（取 max）。
   *
   * 隐私规则：
   * - 仅会话成员可调用，否则 403。
   * - 调用者自身会被排除（自己的高水位本就由 /read 写入）。
   * - 任意 reader 若 read_receipts_visibility = 2（关闭已读回执），其行会被过滤掉。
   *   关闭后他人无法通过此端点感知该 reader 是否已读，与 WS group_read 通道行为一致。
   */
  static getReadState = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<ConversationReadStateResponse> => {
      void res;
      const conversationIdRaw = req.params.id;
      if (!conversationIdRaw || conversationIdRaw.trim() === "") {
        throw new BusinessError("conversation id is required");
      }
      const conversationId = String(conversationIdRaw);
      const userId = Number(req.JwtPayload!.userId);

      // 成员校验（顺便拿到 unread / message_seq；这里只需要确认是成员）
      const fastState = await ConversationReadStateRepository.getReadFastState(
        conversationId,
        userId
      );
      if (!fastState) {
        throw new BusinessError("User is not a member of this conversation");
      }

      const [entries, members, callerPrivacy] = await Promise.all([
        ConversationReadStateRepository.findReadStateByConversation(
          conversationId
        ),
        ConversationQueryService.getConversationMembers(conversationId),
        PrivacyRepository.findByUserId(userId)
      ]);

      // 双向失效：调用者自己关闭了已读回执，则也看不到他人的已读高水位
      if (callerPrivacy.read_receipts_visibility === 2) {
        return { conversation_id: conversationId, entries: [] };
      }

      const memberIds = members.map(m => Number(m.user_id));
      const privacyRows = await PrivacyRepository.findManyByUserIds(memberIds);
      const optedOutReaders = new Set(
        privacyRows
          .filter(p => p.read_receipts_visibility === 2)
          .map(p => Number(p.user_id))
      );

      return {
        conversation_id: conversationId,
        entries: entries
          .filter(
            entry =>
              entry.user_id !== userId && !optedOutReaders.has(entry.user_id)
          )
          .map(entry => ({
            user_id: entry.user_id,
            last_read_seq: entry.last_read_seq,
            updated_at: entry.updated_at.toISOString()
          }))
      };
    }
  );

  static addMembers = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<ConversationMemberMutationResponse> => {
      void res;
      const body = req.body as AddConversationMembersRequest;
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );
      if (!Array.isArray(body.members) || body.members.length === 0) {
        throw new BusinessError("members is required");
      }

      const result = await ConversationMemberService.addConversationMembers(
        req.JwtPayload!.userId,
        conversationId,
        body.members.map(member => ({
          user_id: requireNumberField(
            member,
            "user_id",
            "member.user_id is required"
          ),
          role: requireNumberField(member, "role", "member.role is required"),
          nickname:
            typeof member.nickname === "string" ? member.nickname : undefined
        }))
      );
      await dispatchConversationUpsert(
        body.members.map(member => Number(member.user_id)),
        String(result.conversation.id)
      );

      return {
        conversation_id: result.conversation.id,
        members: result.members.map(toRemoteConversationMember),
        messages: result.messages.map(m => toRemoteMessage(m))
      };
    }
  );

  static leave = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<ConversationMemberMutationResponse> => {
      void res;
      const body = req.body as LeaveConversationRequest;
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );

      const result = await ConversationMemberService.leaveConversation(
        req.JwtPayload!.userId,
        conversationId
      );
      await dispatchConversationUpsert(
        result.members.map(member => member.user_id),
        String(result.conversation.id)
      );
      // 与 removeMember 对齐：让离群者自己的客户端把该会话从本地列表
      // 移除，避免桌面端/移动端继续显示陈旧成员。
      await dispatchConversationRemove(
        [req.JwtPayload!.userId],
        String(result.conversation.id)
      );

      return {
        conversation_id: result.conversation.id,
        members: result.members.map(toRemoteConversationMember),
        messages: result.messages.map(m => toRemoteMessage(m))
      };
    }
  );

  static removeMember = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<ConversationMemberMutationResponse> => {
      void res;
      const body = req.body as RemoveConversationMemberRequest;
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );
      const targetUserId = requireNumberField(
        body,
        "userId",
        "userId is required"
      );

      const result = await ConversationMemberService.removeConversationMember(
        req.JwtPayload!.userId,
        conversationId,
        targetUserId
      );
      await dispatchConversationUpsert(
        result.members.map(member => member.user_id),
        String(result.conversation.id)
      );
      await dispatchConversationRemove(
        [targetUserId],
        String(result.conversation.id)
      );

      return {
        conversation_id: result.conversation.id,
        members: result.members.map(toRemoteConversationMember),
        messages: result.messages.map(m => toRemoteMessage(m))
      };
    }
  );

  static updateMemberRole = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<ConversationMemberMutationResponse> => {
      void res;
      const body = req.body as UpdateConversationMemberRoleRequest;
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );
      const targetUserId = requireNumberField(
        body,
        "userId",
        "userId is required"
      );
      const role = requireNumberField(body, "role", "role is required");

      const result =
        await ConversationMemberService.updateConversationMemberRole(
          req.JwtPayload!.userId,
          conversationId,
          targetUserId,
          role
        );
      await dispatchConversationUpsert(
        result.members.map(member => member.user_id),
        String(result.conversation.id)
      );

      return {
        conversation_id: result.conversation.id,
        members: result.members.map(toRemoteConversationMember),
        messages: result.messages.map(m => toRemoteMessage(m))
      };
    }
  );

  static updateMemberMute = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<ConversationMemberMutationResponse> => {
      void res;
      const body = req.body as UpdateConversationMemberMuteRequest;
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );
      const targetUserId = requireNumberField(
        body,
        "userId",
        "userId is required"
      );
      const muteMinutes = Object.prototype.hasOwnProperty.call(
        body,
        "mute_minutes"
      )
        ? (optionalNumberField(body, "mute_minutes") ?? null)
        : undefined;

      const result =
        await ConversationMemberService.updateConversationMemberMute(
          req.JwtPayload!.userId,
          conversationId,
          targetUserId,
          muteMinutes
        );
      await dispatchConversationUpsert(
        result.members.map(member => member.user_id),
        String(result.conversation.id)
      );

      return {
        conversation_id: result.conversation.id,
        members: result.members.map(toRemoteConversationMember),
        messages: result.messages.map(m => toRemoteMessage(m))
      };
    }
  );

  static transferOwner = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<ConversationMemberMutationResponse> => {
      void res;
      const body = req.body as TransferConversationOwnerRequest;
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );
      const targetUserId = requireNumberField(
        body,
        "userId",
        "userId is required"
      );

      const result = await ConversationMemberService.transferConversationOwner(
        req.JwtPayload!.userId,
        conversationId,
        targetUserId
      );
      await dispatchConversationUpsert(
        result.members.map(member => member.user_id),
        String(result.conversation.id)
      );

      return {
        conversation_id: result.conversation.id,
        members: result.members.map(toRemoteConversationMember),
        messages: result.messages.map(m => toRemoteMessage(m))
      };
    }
  );

  static disband = wrapAsync(
    async (req: Request, res: Response): Promise<null> => {
      void res;
      const body = req.body as DisbandConversationRequest;
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );
      await ConversationLifecycleService.disbandConversation(
        req.JwtPayload!.userId,
        conversationId
      );
      const members =
        await ConversationQueryService.getConversationMembers(conversationId);
      await dispatchConversationRemove(
        members.map(member => member.user_id),
        conversationId
      );
      return null;
    }
  );
}
