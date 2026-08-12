import {
  createSystemMessageContent,
  detectAttachmentCategory,
  getMessageSummaryText,
  getMessageMentions,
  isFileMessageContent,
  isMentioningAll,
  parseGroupConversationSettings,
  type ChatMessage,
  type MessageDeltaResponse,
  type MessageListResponse,
  type MessageSyncCursor,
  type SyncCursorToken
} from "@mushroom/shared";
import { generateId } from "../utils/id_generator";
import { toRemoteMessage } from "../utils/dto";
import logger from "../utils/logger";
import { getRequestLogger } from "../utils/log_context";
import { logPayload } from "../utils/payload_logger";
import pg from "../db/pg";
import { BusinessError } from "../handler/business_error";
import { config } from "../utils/config";
import ConversationService from "./conversation/conversation_query_service";
import AttachmentRepository from "../repository/attachment_repository";
import MessageRepository from "../repository/message_repository";
import UserRepository from "../repository/user_repository";
import ConversationCoreRepository from "../repository/conversation/conversation_core_repository";
import ConversationMemberRepository from "../repository/conversation/conversation_member_repository";
import ConversationReadStateRepository from "../repository/conversation/conversation_read_state_repository";
import type { DbTx } from "../repository/conversation/conversation_core_repository";
import OutboxRepository from "../repository/outbox_repository";
import type { MessageRecord as Message } from "../repository/models";
import { mapMessages } from "../utils/mapper";
import PushNotificationService from "./push_notification_service";
import { enrichMessagesWithAttachmentUrls } from "./attachment_url_resolver";

function elapsedMs(startTime: bigint) {
  return Number(process.hrtime.bigint() - startTime) / 1_000_000;
}

export interface SavedMessageResult {
  message: Message;
  memberUserIds: number[];
  deliveryTargets: Array<{
    userId: number;
    excludeDeviceId?: string;
  }>;
  deliveryPayload: ChatMessage | null;
}

type SaveMessageInput = ChatMessage & {
  server_conversation_id: string;
  source_device_id?: string;
  peer_id?: number;
  is_pinned?: number;
  is_muted?: number;
  settings?: string;
};

class MessageService {
  async getMessages(
    convs: MessageSyncCursor[],
    userId: number
  ): Promise<(Message & { client_conversation_id: string })[] | []> {
    if (convs.length === 0) {
      return [];
    }

    return MessageRepository.findMessages(convs, userId);
  }

  async getMessageDelta(
    params: {
      conversationId: string;
      clientConversationId: string;
      afterSequence?: number;
      limit?: number;
    },
    userId: number
  ): Promise<MessageDeltaResponse> {
    const normalizedLimit = Math.min(Math.max(params.limit ?? 200, 1), 500);
    const rows = await MessageRepository.findMessageDelta({
      conversationId: params.conversationId,
      clientConversationId: params.clientConversationId,
      userId,
      afterSequence: Math.max(0, Number(params.afterSequence ?? 0)),
      limit: normalizedLimit + 1
    });
    const selectedRows = rows.slice(0, normalizedLimit);
    // P2-A：reactions 已由主查询子聚合带回（rows[i].reactions），toRemoteMessage 自动回退使用。
    const messages = selectedRows.map(row => toRemoteMessage(row));
    await enrichMessagesWithAttachmentUrls(messages);
    const deliveredTail = selectedRows.reduce(
      (maxValue, row) => Math.max(maxValue, Number(row.sequence || 0)),
      Math.max(0, Number(params.afterSequence ?? 0))
    );
    const visibleFromSequence = await MessageRepository.getVisibleFromSequence({
      conversationId: params.conversationId,
      userId
    });

    return {
      conversation_id: params.conversationId,
      client_conversation_id: params.clientConversationId,
      messages,
      has_more: rows.length > normalizedLimit,
      next_after_sequence:
        messages.length > 0
          ? Math.max(...messages.map(message => Number(message.sequence || 0)))
          : Math.max(0, Number(params.afterSequence ?? 0)),
      max_sequence: deliveredTail,
      visible_from_sequence: visibleFromSequence
    };
  }

  async listMessages(
    params: {
      conversationId: string;
      clientConversationId: string;
      beforeSequence?: number;
      limit?: number;
    },
    userId: number
  ): Promise<MessageListResponse> {
    const normalizedLimit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const rows = await MessageRepository.listMessages({
      conversationId: params.conversationId,
      clientConversationId: params.clientConversationId,
      userId,
      beforeSequence: params.beforeSequence,
      limit: normalizedLimit + 1
    });
    const selectedRows = rows.slice(0, normalizedLimit);
    const orderedRows = [...selectedRows].reverse();
    // P2-A：reactions 已由 list SQL 子聚合带回，无需再单独发 SQL。
    const messages = orderedRows.map(row => toRemoteMessage(row));
    await enrichMessagesWithAttachmentUrls(messages);
    const sequences = messages
      .map(message => Number(message.sequence || 0))
      .filter(sequence => sequence > 0);
    const hasMore = rows.length > normalizedLimit;
    const visibleFromSequence = await MessageRepository.getVisibleFromSequence({
      conversationId: params.conversationId,
      userId
    });
    const loadedFromSequence =
      sequences.length > 0 ? Math.min(...sequences) : 0;
    // 已到达"可见历史起点"的判定：
    //   1) 服务端再没有更早的页（has_more=false）；
    //   2) 且本页最早一条已经覆盖到可见起点（loaded_from_sequence <= visible_from_sequence）。
    // 空结果集（用户无可见消息）也视为 reached：has_more=false 时直接置 true，让
    // 客户端把 history_complete=1，避免空会话被反复排队历史拉取。
    const reachedHistoryStart =
      !hasMore &&
      (sequences.length === 0 ||
        loadedFromSequence <= Math.max(visibleFromSequence, 1));

    return {
      conversation_id: params.conversationId,
      client_conversation_id: params.clientConversationId,
      messages,
      has_more: hasMore,
      loaded_from_sequence: loadedFromSequence,
      loaded_to_sequence: sequences.length > 0 ? Math.max(...sequences) : 0,
      max_sequence: sequences.length > 0 ? Math.max(...sequences) : 0,
      visible_from_sequence: visibleFromSequence,
      reached_history_start: reachedHistoryStart
    };
  }

  async listMessagesAround(
    params: {
      conversationId: string;
      clientConversationId: string;
      pivotSequence: number;
      limit?: number;
    },
    userId: number
  ): Promise<MessageListResponse> {
    const normalizedLimit = Math.min(Math.max(params.limit ?? 50, 2), 200);
    const pivotSequence = Math.max(0, Number(params.pivotSequence ?? 0));
    const rows = await MessageRepository.listMessagesAround({
      conversationId: params.conversationId,
      clientConversationId: params.clientConversationId,
      userId,
      pivotSequence,
      limit: normalizedLimit
    });
    const orderedRows = [...rows].sort(
      (left, right) => Number(left.sequence) - Number(right.sequence)
    );
    // P2-A：reactions 已由 around SQL 子聚合带回。
    const messages = orderedRows.map(row => toRemoteMessage(row));
    await enrichMessagesWithAttachmentUrls(messages);
    const sequences = messages
      .map(message => Number(message.sequence || 0))
      .filter(sequence => sequence > 0);
    const visibleFromSequence = await MessageRepository.getVisibleFromSequence({
      conversationId: params.conversationId,
      userId
    });
    const loadedFromSequence =
      sequences.length > 0 ? Math.min(...sequences) : 0;
    // around 不分页向前，所以只要本次返回的最早一条覆盖了可见起点即可视为 reached。
    const reachedHistoryStart =
      sequences.length === 0 ||
      loadedFromSequence <= Math.max(visibleFromSequence, 1);

    return {
      conversation_id: params.conversationId,
      client_conversation_id: params.clientConversationId,
      messages,
      has_more: false,
      loaded_from_sequence: loadedFromSequence,
      loaded_to_sequence: sequences.length > 0 ? Math.max(...sequences) : 0,
      max_sequence: sequences.length > 0 ? Math.max(...sequences) : 0,
      visible_from_sequence: visibleFromSequence,
      reached_history_start: reachedHistoryStart
    };
  }

  async saveMessage(message: SaveMessageInput): Promise<SavedMessageResult> {
    const totalStart = process.hrtime.bigint();
    return pg.tx(async (t: DbTx) => {
      const memberLookupStart = process.hrtime.bigint();
      let replyToMessage: (Message & { sender_nickname?: string }) | null =
        null;
      const members = await ConversationService.getConversationMembers(
        message.server_conversation_id,
        t
      );
      if (members.length === 0) {
        throw new BusinessError(
          "Conversation does not exist or has no members"
        );
      }

      const senderId = Number(message.sender_id);
      const memberUserIds = new Set(
        members.map(member => Number(member.user_id))
      );
      const isSenderMember = memberUserIds.has(senderId);
      if (!isSenderMember) {
        throw new BusinessError("Sender is not a member of this conversation");
      }

      const conversation = await ConversationService.getConversationById(
        message.server_conversation_id,
        t
      );
      if (!conversation) {
        throw new BusinessError("Conversation not found");
      }
      const memberLookupMs = elapsedMs(memberLookupStart);

      if (!message.client_message_id) {
        throw new BusinessError("client_message_id is required");
      }

      const existingMessage =
        await MessageRepository.findMessageBySenderClientId(
          senderId,
          message.client_message_id,
          t
        );
      if (existingMessage) {
        return {
          message: existingMessage,
          memberUserIds: members.map(member => member.user_id),
          deliveryTargets: [],
          deliveryPayload: null
        };
      }

      const senderMember = members.find(
        member => Number(member.user_id) === senderId
      );
      if (!senderMember) {
        throw new BusinessError("Sender is not a member of this conversation");
      }
      const conversationSettings = parseGroupConversationSettings(
        conversation.settings ?? null
      );
      if (
        conversation.type === 2 &&
        conversationSettings.mute_all &&
        senderMember.role < 1
      ) {
        getRequestLogger().warn(
          {
            conversationId: message.server_conversation_id,
            senderId,
            reason: "group_muted"
          },
          "Chat message rejected"
        );
        throw new BusinessError("The group is muted for regular members");
      }
      if (
        senderMember.mute_until &&
        new Date(senderMember.mute_until).getTime() > Date.now()
      ) {
        getRequestLogger().warn(
          {
            conversationId: message.server_conversation_id,
            senderId,
            reason: "member_muted",
            muteUntil: senderMember.mute_until
          },
          "Chat message rejected"
        );
        throw new BusinessError("You are currently muted in this group");
      }

      if (conversation.type === 1) {
        const recipientId =
          members.find(member => Number(member.user_id) !== senderId)
            ?.user_id ?? 0;
        if (!recipientId) {
          throw new BusinessError("Invalid direct conversation members");
        }

        // P2-Task2: 单 SQL 同时取出双向 block / recipient privacy / contact 关系，
        // 替代原先 hasBlocked × 2 + getPrivacySettings + areContacts 的 4 次串行 round-trip。
        const gate = await UserRepository.loadDirectMessageGate(
          senderId,
          Number(recipientId),
          t
        );

        if (gate.sender_blocked_recipient) {
          getRequestLogger().warn(
            {
              conversationId: message.server_conversation_id,
              senderId,
              recipientId,
              reason: "sender_blocked_recipient"
            },
            "Chat message rejected"
          );
          throw new BusinessError("你已拉黑对方，无法发送消息");
        }

        if (gate.recipient_blocked_sender) {
          getRequestLogger().warn(
            {
              conversationId: message.server_conversation_id,
              senderId,
              recipientId,
              reason: "recipient_blocked_sender"
            },
            "Chat message rejected"
          );
          throw new BusinessError("对方已经将你拉黑，无法发送消息");
        }

        if (gate.recipient_message_permission === 2) {
          getRequestLogger().warn(
            {
              conversationId: message.server_conversation_id,
              senderId,
              recipientId,
              reason: "privacy_block_all"
            },
            "Chat message rejected"
          );
          throw new BusinessError("The user is not accepting direct messages");
        }
        if (
          gate.recipient_message_permission === 1 &&
          !gate.recipient_saved_sender
        ) {
          getRequestLogger().warn(
            {
              conversationId: message.server_conversation_id,
              senderId,
              recipientId,
              reason: "privacy_contacts_only"
            },
            "Chat message rejected"
          );
          throw new BusinessError(
            "The user only accepts messages from existing contacts"
          );
        }
      }

      if (message.type === 1) {
        const text = String(message.content?.text ?? "").trim();
        if (!text) {
          throw new BusinessError("Message text cannot be empty");
        }
        if (text.length > config.limits.maxTextLength) {
          throw new BusinessError(
            `消息长度不能超过 ${config.limits.maxTextLength} 字符`
          );
        }
      }

      type PendingAttachmentUpload = {
        id: string;
        // 与 AttachmentRepository 返回保持一致：pg BIGINT -> string。
        uploader_id: string;
        object_name: string;
        original_name: string;
        size: number;
        mime_type?: string | null;
        file_url: string | null;
        category?: "image" | "video" | "audio" | "voice" | "file";
        width?: number | null;
        height?: number | null;
        duration_ms?: number | null;
      };
      let attachmentUpload: PendingAttachmentUpload | null = null;
      let thumbnailAttachmentUpload: PendingAttachmentUpload | null = null;

      if (message.type === 2) {
        if (!isFileMessageContent(message.content)) {
          throw new BusinessError("Invalid file message payload");
        }

        const uploadId = String(message.content.upload_id ?? "").trim();
        if (!uploadId) {
          throw new BusinessError("File message is missing upload_id");
        }

        attachmentUpload = await AttachmentRepository.findPendingUploadForBind(
          t,
          uploadId,
          senderId
        );
        if (!attachmentUpload) {
          throw new BusinessError(
            "Attachment upload is invalid or already used"
          );
        }
        if (!attachmentUpload.file_url) {
          throw new BusinessError("Attachment upload is not yet completed");
        }

        // 服务端权威分类（不信任客户端 content.kind）：
        const rawContent = message.content as { kind?: string } & Record<
          string,
          unknown
        >;
        const category =
          attachmentUpload.category ??
          detectAttachmentCategory({
            mimeType: attachmentUpload.mime_type ?? undefined,
            name: attachmentUpload.original_name,
            isVoice: rawContent.kind === "voice_message"
          });
        const maxBytes = config.limits.attachment[category];
        if (Number(attachmentUpload.size) > maxBytes) {
          const mb = Math.max(1, Math.round(maxBytes / 1024 / 1024));
          throw new BusinessError(
            `${
              category === "image"
                ? "图片"
                : category === "video"
                  ? "视频"
                  : category === "audio"
                    ? "音频"
                    : category === "voice"
                      ? "语音"
                      : "文件"
            }不能超过 ${mb}MB`
          );
        }

        // 视频消息附带的首帧缩略图（独立 upload_id，必须为图片类型且属于当前发送者）。
        const thumbnailUploadId = String(
          rawContent.thumbnail_upload_id ?? ""
        ).trim();
        if (thumbnailUploadId) {
          thumbnailAttachmentUpload =
            await AttachmentRepository.findPendingUploadForBind(
              t,
              thumbnailUploadId,
              senderId
            );
          if (!thumbnailAttachmentUpload) {
            throw new BusinessError(
              "Video thumbnail upload is invalid or already used"
            );
          }
          if ((thumbnailAttachmentUpload.category ?? "file") !== "image") {
            throw new BusinessError(
              "Video thumbnail must be an image attachment"
            );
          }
          if (
            Number(thumbnailAttachmentUpload.size) >
            config.limits.attachment.image
          ) {
            throw new BusinessError("Video thumbnail exceeds image size limit");
          }
        }

        message.content = {
          ...message.content,
          upload_id: attachmentUpload.id,
          name: attachmentUpload.original_name,
          url: attachmentUpload.file_url,
          size: Number(attachmentUpload.size),
          mime_type: attachmentUpload.mime_type ?? message.content.mime_type,
          width:
            attachmentUpload.width ??
            (message.content as { width?: number }).width,
          height:
            attachmentUpload.height ??
            (message.content as { height?: number }).height,
          duration_ms:
            attachmentUpload.duration_ms ??
            (message.content as { duration_ms?: number }).duration_ms,
          thumb_status: category === "image" ? "pending" : undefined,
          thumbnail_upload_id: thumbnailAttachmentUpload
            ? thumbnailAttachmentUpload.id
            : undefined,
          thumb_url: thumbnailAttachmentUpload?.file_url ?? undefined
        };
      }

      const mentions = getMessageMentions(message.content);
      const mentionAll = isMentioningAll(message.content);
      if (mentions.length > 0) {
        const activeMemberIds = new Set(
          members.map(member => Number(member.user_id))
        );
        for (const mention of mentions) {
          if (!mention.user_id || !activeMemberIds.has(mention.user_id)) {
            throw new BusinessError(
              "Mentioned user is not a member of this conversation"
            );
          }
        }
      }
      if (mentionAll) {
        if (conversation.type !== 2) {
          throw new BusinessError(
            "@all is only supported in group conversations"
          );
        }
        if (!senderMember || senderMember.role < 1) {
          throw new BusinessError("Only group admins can use @all");
        }
      }

      if (message.reply_to_message_id) {
        const replyLookupStart = process.hrtime.bigint();
        replyToMessage = await MessageRepository.findMessageById(
          message.reply_to_message_id,
          undefined,
          t
        );
        if (!replyToMessage) {
          throw new BusinessError("Referenced message not found");
        }
        if (replyToMessage.conversation_id !== message.server_conversation_id) {
          throw new BusinessError(
            "Referenced message does not belong to this conversation"
          );
        }
        logger.debug(
          {
            clientMessageId: message.client_message_id,
            conversationId: message.server_conversation_id,
            replyLookupMs: Number(elapsedMs(replyLookupStart).toFixed(3))
          },
          "Message save reply lookup timing"
        );
      }

      const writeStart = process.hrtime.bigint();
      let persistedSenderNickname = senderMember.nickname;
      let persistedSenderAvatar = senderMember.avatar_url;
      const sequence =
        await ConversationCoreRepository.nextConversationSequence(
          t,
          message.server_conversation_id
        );

      const savedMessage = await MessageRepository.insertMessage(t, {
        id: generateId(),
        client_message_id: message.client_message_id,
        conversation_id: message.server_conversation_id,
        sender_id: message.sender_id,
        type: message.type,
        content: message.content,
        sequence,
        reply_to_message_id: message.reply_to_message_id
      });

      if (conversation.type === 1) {
        if (members.length !== 2) {
          throw new BusinessError("Invalid direct conversation members");
        }

        message.peer_id =
          members.find(member => Number(member.user_id) !== senderId)
            ?.user_id ?? 0;
      } else {
        message.peer_id = 0;
      }

      if (savedMessage.inserted) {
        if (attachmentUpload) {
          const boundUpload = await AttachmentRepository.bindUploadToMessage(
            t,
            {
              upload_id: attachmentUpload.id,
              uploader_id: senderId,
              message_id: String(savedMessage.id)
            }
          );
          if (!boundUpload) {
            throw new BusinessError("Attachment upload bind failed");
          }
          if (thumbnailAttachmentUpload) {
            // 缩略图是独立 upload，不占用 bound_message_id 唯一槽位，
            // 通过 parent_upload_id 关联到主附件并置 BOUND。
            const boundThumb =
              await AttachmentRepository.bindThumbnailUploadToMessage(t, {
                upload_id: thumbnailAttachmentUpload.id,
                uploader_id: senderId,
                parent_upload_id: attachmentUpload.id
              });
            if (!boundThumb) {
              throw new BusinessError("Video thumbnail bind failed");
            }
          }
        }

        // P2-Task3: insertMessage 已通过 CTE + LEFT JOIN users 一次性返回 sender_nickname / sender_avatar，
        // 因此省掉先前 inserted 路径上的 findMessageById 二次查询。
        if (savedMessage.sender_nickname) {
          persistedSenderNickname = savedMessage.sender_nickname;
        }
        if (savedMessage.sender_avatar) {
          persistedSenderAvatar = savedMessage.sender_avatar;
        }

        await ConversationCoreRepository.updateConversationPointers(t, {
          conversationId: savedMessage.conversation_id,
          lastMessageId: savedMessage.id,
          lastMessageAt: savedMessage.created_at
        });

        await ConversationReadStateRepository.applyMessageDeliveryStates(
          t,
          members.map(member => {
            // peer_id 必须按 member 视角计算：
            // - 群聊（type !== 1）：恒为 0
            // - 直聊（type === 1）：当前 member 的 peer 是会话里"另一个 member"
            // 历史 bug：曾经把所有 member 行都写成 message.peer_id（= sender 视角的对方），
            // 导致 receiver 行 peer_id 等于自己 user_id，进而引发 chat header 显示自己在线状态等问题。
            const memberUserId = Number(member.user_id);
            const memberPeerId =
              conversation.type === 1
                ? Number(
                    members.find(
                      other => Number(other.user_id) !== memberUserId
                    )?.user_id ?? 0
                  )
                : 0;
            return {
              conversation_id: savedMessage.conversation_id,
              user_id: member.user_id,
              last_read_seq:
                memberUserId === senderId ? savedMessage.sequence : 0,
              last_delivered_seq: savedMessage.sequence,
              unread_count:
                memberUserId === senderId
                  ? 0
                  : Math.max(savedMessage.sequence, 0),
              peer_id: memberPeerId,
              settings: message.settings ?? null,
              should_unarchive: memberUserId !== senderId,
              clear_draft: memberUserId === senderId
            };
          })
        );

        await ConversationMemberRepository.backfillMemberJoinSequence(
          t,
          savedMessage.conversation_id,
          savedMessage.sequence
        );

        const outboxPayload: ChatMessage = mapMessages({
          ...savedMessage,
          client_message_id: message.client_message_id,
          client_conversation_id: message.client_conversation_id,
          reply_to_sender_id: replyToMessage?.sender_id,
          reply_to_sender_nickname: replyToMessage?.sender_nickname,
          reply_to_content: replyToMessage?.content,
          sender_nickname: persistedSenderNickname,
          sender_avatar: persistedSenderAvatar
        });
        await OutboxRepository.insertEvents(
          t,
          members.map(member => ({
            event_type: "chat.message.deliver",
            message_id: String(savedMessage.id),
            conversation_id: savedMessage.conversation_id,
            target_user_id: member.user_id,
            target_device_id:
              Number(member.user_id) === senderId
                ? (message.source_device_id ?? null)
                : null,
            payload: outboxPayload
          }))
        );

        await OutboxRepository.insertEvents(
          t,
          members
            .filter(member => Number(member.user_id) !== senderId)
            .map(member => {
              const memberId = Number(member.user_id);
              return {
                event_type: "push.notification",
                message_id: String(savedMessage.id),
                conversation_id: savedMessage.conversation_id,
                target_user_id: member.user_id,
                payload: PushNotificationService.buildChatMessageNotification({
                  title:
                    conversation.type === 2
                      ? `${persistedSenderNickname || "新消息"} · ${
                          conversation.name || "群聊"
                        }`
                      : persistedSenderNickname || "新消息",
                  body: getMessageSummaryText(outboxPayload.content),
                  conversationId: savedMessage.conversation_id,
                  conversationName: conversation.name ?? null,
                  conversationType: conversation.type,
                  messageId: String(savedMessage.id),
                  isMention:
                    mentionAll ||
                    mentions.some(mention => mention.user_id === memberId),
                  senderUserId: senderId,
                  senderDeviceId: message.source_device_id
                })
              };
            })
        );

        logger.debug(
          {
            clientMessageId: message.client_message_id,
            conversationId: message.server_conversation_id,
            senderId,
            memberCount: members.length,
            messageType: message.type,
            memberLookupMs: Number(memberLookupMs.toFixed(3)),
            writePhaseMs: Number(elapsedMs(writeStart).toFixed(3)),
            totalDbTxMs: Number(elapsedMs(totalStart).toFixed(3))
          },
          "Message save timing"
        );

        logPayload(
          {
            scope: "message.save.outbox",
            userId: senderId,
            conversationId: message.server_conversation_id,
            messageId: String(savedMessage.id),
            classify: "chat"
          },
          outboxPayload
        );

        return {
          message: savedMessage,
          memberUserIds: members.map(member => member.user_id),
          deliveryTargets: [],
          deliveryPayload: null
        };
      }

      return {
        message: savedMessage,
        memberUserIds: members.map(member => member.user_id),
        deliveryTargets: [],
        deliveryPayload: null
      };
    });
  }

  async recallMessage(
    userId: number,
    conversationId: string,
    messageId: string
  ) {
    const result = await pg.tx(async (t: DbTx) => {
      const originalMessage = await MessageRepository.findMessageById(
        messageId,
        undefined,
        t
      );
      if (!originalMessage) {
        throw new BusinessError("Message recall failed");
      }

      // Phase 3：在事务内一次性读出附件记录，用于后续 attachment.delete 事件 payload。
      const boundAttachment = isFileMessageContent(originalMessage.content)
        ? await AttachmentRepository.findBoundUploadForMessage(t, messageId)
        : null;

      const recalledContent = createSystemMessageContent("message_recalled");
      const recalledMessage = await MessageRepository.recallMessage(t, {
        message_id: messageId,
        conversation_id: conversationId,
        sender_id: userId,
        content: recalledContent
      });

      if (!recalledMessage) {
        throw new BusinessError("Message recall failed");
      }

      await ConversationCoreRepository.updateConversationPointers(t, {
        conversationId,
        lastMessageId: String(recalledMessage.id),
        lastMessageAt: recalledMessage.updated_at
      });

      const members = await ConversationService.getConversationMembers(
        conversationId,
        t
      );
      const payload = {
        messageClassify: "message_recall" as const,
        server_message_id: String(recalledMessage.id),
        server_conversation_id: conversationId,
        client_message_id: recalledMessage.client_message_id ?? undefined,
        sequence: recalledMessage.sequence,
        recaller_id: userId,
        content: recalledContent,
        updated_at: recalledMessage.updated_at.toISOString()
      };

      const events: Parameters<typeof OutboxRepository.insertEvents>[1] =
        members.map(member => ({
          event_type: "message.recall",
          message_id: String(recalledMessage.id),
          conversation_id: conversationId,
          target_user_id: member.user_id,
          payload
        }));

      // Phase 3：附件删除改为 outbox 补偿事件，事务一并入队，避免事务外
      // best-effort 失败造成的 MinIO / DB 孤儿，由 outbox 重试 + 死信兜底。
      if (boundAttachment) {
        events.push({
          event_type: "attachment.delete",
          message_id: String(recalledMessage.id),
          conversation_id: conversationId,
          target_user_id: null,
          payload: {
            upload_id: boundAttachment.id,
            object_name: boundAttachment.object_name,
            thumb_object_key: boundAttachment.thumb_object_key ?? null,
            preview_object_key: boundAttachment.preview_object_key ?? null
          }
        });
      }

      // 视频首帧缩略图是独立 upload（parent_upload_id 关联主附件），撤回时
      // 一并清理对象与记录，避免残留孤儿。
      if (
        isFileMessageContent(originalMessage.content) &&
        originalMessage.content.thumbnail_upload_id
      ) {
        const thumbnailId = String(originalMessage.content.thumbnail_upload_id);
        const thumbnailUpload =
          await AttachmentRepository.findById(thumbnailId);
        if (
          thumbnailUpload &&
          thumbnailUpload.uploader_id === String(userId) &&
          thumbnailUpload.status !== 2
        ) {
          events.push({
            event_type: "attachment.delete",
            message_id: String(recalledMessage.id),
            conversation_id: conversationId,
            target_user_id: null,
            payload: {
              upload_id: thumbnailUpload.id,
              object_name: thumbnailUpload.object_name,
              thumb_object_key: thumbnailUpload.thumb_object_key ?? null,
              preview_object_key: thumbnailUpload.preview_object_key ?? null
            }
          });
        }
      }

      await OutboxRepository.insertEvents(t, events);

      return { payload };
    });

    getRequestLogger().info(
      {
        userId,
        conversationId,
        messageId,
        sequence: result.payload.sequence
      },
      "Message recalled"
    );

    return result.payload;
  }

  async updateMessageState(
    userId: number,
    conversationId: string,
    messageId: string,
    patch: {
      is_favorited?: number;
      is_pinned?: number;
    }
  ) {
    return pg.tx(async (t: DbTx) => {
      const member = await ConversationMemberRepository.findMember(
        t,
        conversationId,
        userId
      );
      if (!member) {
        throw new BusinessError("Conversation member not found");
      }

      const message = await MessageRepository.findMessageById(
        messageId,
        userId
      );
      if (!message || message.conversation_id !== conversationId) {
        throw new BusinessError("Message not found");
      }

      const result = await MessageRepository.upsertMessageUserState(t, {
        message_id: messageId,
        user_id: userId,
        is_favorited:
          patch.is_favorited === undefined
            ? undefined
            : Boolean(patch.is_favorited),
        is_pinned:
          patch.is_pinned === undefined ? undefined : Boolean(patch.is_pinned)
      });

      return {
        message_id: result.message_id,
        conversation_id: conversationId,
        is_favorited: (result.is_favorited ? 1 : 0) as 0 | 1,
        is_pinned: (result.is_pinned ? 1 : 0) as 0 | 1,
        updated_at: result.updated_at.toISOString()
      };
    });
  }

  async syncMessageStates(
    userId: number,
    syncCursor?: SyncCursorToken | null,
    pageSize = 200
  ) {
    const rows = await MessageRepository.findMessageStatesByUser(
      userId,
      syncCursor,
      pageSize + 1
    );
    const hasMore = rows.length > pageSize;
    const states = hasMore ? rows.slice(0, pageSize) : rows;
    const latest =
      states.length > 0
        ? states[states.length - 1].updated_at.toISOString()
        : (syncCursor?.updated_at ?? new Date().toISOString());
    const lastState = states[states.length - 1];

    return {
      states: states.map(item => ({
        message_id: item.message_id,
        conversation_id: item.conversation_id,
        is_favorited: (item.is_favorited ? 1 : 0) as 0 | 1,
        is_pinned: (item.is_pinned ? 1 : 0) as 0 | 1,
        updated_at: item.updated_at.toISOString()
      })),
      nextSyncCursor: lastState
        ? JSON.stringify({
            updated_at: lastState.updated_at.toISOString(),
            entity_id: String(lastState.message_id)
          } satisfies SyncCursorToken)
        : syncCursor
          ? JSON.stringify(syncCursor)
          : null,
      lastSyncTime: latest,
      hasMore
    };
  }
}

export default new MessageService();
