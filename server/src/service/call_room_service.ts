import jwt from "jsonwebtoken";
import type { CallRoomConfigResponse } from "@mushroom/shared";
import {
  CALL_PARTICIPANT_STATUS_JOINED,
  CALL_SCOPE_GROUP,
  CALL_STATUS_CANCELLED,
  CALL_STATUS_ENDED
} from "@mushroom/shared";
import { config } from "../utils/config";
import { BusinessError } from "../handler/business_error";
import CallService from "./call_service";

function getLiveKitTokenTtlSeconds() {
  return Math.max(30, Number(config.call.liveKitTokenTtlSeconds || 3600));
}

export function normalizeLiveKitServerUrl(rawUrl: string) {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return trimmedUrl;
  }

  if (trimmedUrl.startsWith("ws://") || trimmedUrl.startsWith("wss://")) {
    return trimmedUrl;
  }

  if (trimmedUrl.startsWith("http://")) {
    return trimmedUrl.replace(/^http:\/\//, "ws://");
  }

  if (trimmedUrl.startsWith("https://")) {
    return trimmedUrl.replace(/^https:\/\//, "wss://");
  }

  return `ws://${trimmedUrl}`;
}

export function buildLiveKitParticipantIdentity(
  callId: string,
  userId: number,
  deviceId: string
) {
  return `${callId}:${userId}:${deviceId}`;
}

export function isLiveKitConfigured() {
  return Boolean(
    config.call.liveKitUrl &&
      config.call.liveKitApiKey &&
      config.call.liveKitApiSecret
  );
}

class CallRoomService {
  assertGroupCallingConfigured() {
    if (!isLiveKitConfigured()) {
      throw new BusinessError(
        "群聊通话未配置 LiveKit，请先填写 CALL_LIVEKIT_URL / CALL_LIVEKIT_API_KEY / CALL_LIVEKIT_API_SECRET"
      );
    }
  }

  async getGroupRoomConfig(params: {
    callId: string;
    userId: number;
    deviceId?: string | null;
  }): Promise<CallRoomConfigResponse> {
    this.assertGroupCallingConfigured();

    const deviceId = params.deviceId?.trim();
    if (!deviceId) {
      throw new BusinessError("当前设备标识不可用，无法加入群通话房间");
    }

    const callState = await CallService.getCallById(params.callId);
    if (!callState) {
      throw new BusinessError("Call not found");
    }
    if (callState.session.call_scope !== CALL_SCOPE_GROUP) {
      throw new BusinessError("当前通话不是群聊通话");
    }
    if (
      callState.session.status === CALL_STATUS_CANCELLED ||
      callState.session.status === CALL_STATUS_ENDED
    ) {
      throw new BusinessError("当前群通话已结束");
    }

    const participant = callState.participants.find(
      item =>
        Number(item.user_id) === Number(params.userId) &&
        String(item.device_id) === deviceId
    );
    if (!participant) {
      throw new BusinessError("当前设备不在通话参与列表中");
    }
    if (participant.participant_status !== CALL_PARTICIPANT_STATUS_JOINED) {
      throw new BusinessError("当前设备尚未接听群通话，无法加入房间");
    }

    const joinedCount = callState.participants.filter(
      item => item.participant_status === CALL_PARTICIPANT_STATUS_JOINED
    ).length;
    if (joinedCount > config.call.groupMaxParticipants) {
      throw new BusinessError("当前群通话人数已满");
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + getLiveKitTokenTtlSeconds();
    const roomName = callState.session.call_id;
    const participantIdentity = buildLiveKitParticipantIdentity(
      callState.session.call_id,
      params.userId,
      deviceId
    );
    const metadata = {
      call_id: callState.session.call_id,
      conversation_id: callState.session.conversation_id,
      user_id: params.userId,
      device_id: deviceId,
      media_type: callState.session.media_type
    };

    const accessToken = jwt.sign(
      {
        iss: config.call.liveKitApiKey,
        sub: participantIdentity,
        nbf: issuedAt,
        exp: expiresAt,
        name: `user-${params.userId}`,
        metadata: JSON.stringify(metadata),
        video: {
          room: roomName,
          roomJoin: true,
          canPublish: true,
          canPublishData: true,
          canSubscribe: true
        }
      },
      config.call.liveKitApiSecret,
      {
        algorithm: "HS256"
      }
    );

    return {
      provider: "livekit",
      issued_at: new Date(issuedAt * 1000).toISOString(),
      ttl_seconds: getLiveKitTokenTtlSeconds(),
      server_url: normalizeLiveKitServerUrl(config.call.liveKitUrl),
      room_name: roomName,
      access_token: accessToken,
      participant_identity: participantIdentity,
      participant_name: `user-${params.userId}`,
      max_participants: config.call.groupMaxParticipants,
      metadata
    };
  }
}

export default new CallRoomService();
