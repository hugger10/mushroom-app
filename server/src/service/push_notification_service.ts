import { CALL_MEDIA_TYPE_VIDEO, CALL_SCOPE_GROUP } from "@mushroom/shared";
import PushRouter from "./push/push_router";
import type { PushNotificationEnvelope } from "./push/types";

class PushNotificationService {
  async deliverToUser(userId: number, payload: PushNotificationEnvelope) {
    return PushRouter.deliverToUser(userId, payload);
  }

  buildChatMessageNotification(input: {
    title: string;
    body: string;
    conversationId: string;
    conversationName?: string | null;
    conversationType: number;
    messageId: string;
    isMention?: boolean;
    senderUserId: number;
    senderDeviceId?: string;
  }): PushNotificationEnvelope {
    return {
      type: "chat.message",
      title: input.title,
      body: input.body,
      conversation_id: input.conversationId,
      conversation_name: input.conversationName ?? undefined,
      conversation_type: input.conversationType,
      message_id: input.messageId,
      is_mention: input.isMention ?? false,
      sender_user_id: input.senderUserId,
      sender_device_id: input.senderDeviceId
    };
  }

  buildIncomingCallNotification(input: {
    callId: string;
    conversationId: string;
    conversationName?: string | null;
    senderUserId: number;
    senderDeviceId: string;
    timeoutSeconds: number;
    mediaType: number;
    callScope: number;
    senderName: string;
  }): PushNotificationEnvelope {
    const isGroupCall = input.callScope === CALL_SCOPE_GROUP;
    const isVideo = input.mediaType === CALL_MEDIA_TYPE_VIDEO;

    return {
      type: "call.invite",
      title: isGroupCall ? "群聊来电" : "来电邀请",
      body: `${input.senderName} 邀请你加入${isVideo ? "视频" : "语音"}通话`,
      call_id: input.callId,
      conversation_id: input.conversationId,
      conversation_name: input.conversationName ?? undefined,
      call_scope: input.callScope,
      media_type: input.mediaType,
      sender_user_id: input.senderUserId,
      sender_device_id: input.senderDeviceId,
      timeout_seconds: input.timeoutSeconds
    };
  }
}

export type { PushNotificationEnvelope } from "./push/types";

export default new PushNotificationService();
