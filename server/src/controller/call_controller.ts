import { Request, Response } from "express";
import crypto from "crypto";
import type {
  CallEndReason,
  CallMediaType,
  CallParticipant,
  CallParticipantRole,
  CallParticipantStatus,
  CallScope,
  CallSession,
  CallStatus,
  CallIceConfigResponse,
  CallRoomConfigResponse,
  CallStateResponse
} from "@mushroom/shared";
import CallRoomService from "../service/call_room_service";
import CallService from "../service/call_service";
import type {
  CallParticipantRecord,
  CallSessionRecord
} from "../repository/models";
import { wrapAsync } from "../handler/response_wrapper";
import { BusinessError } from "../handler/business_error";
import { config } from "../utils/config";
import { optionalQueryString } from "../handler/request_parser";

function mapCallSession(record: CallSessionRecord): CallSession {
  return {
    call_id: record.call_id,
    conversation_id: record.conversation_id,
    call_scope: record.call_scope as CallScope,
    media_type: record.media_type as CallMediaType,
    initiator_user_id: record.initiator_user_id,
    status: record.status as CallStatus,
    active_device_count: record.active_device_count,
    participant_count: record.participant_count,
    started_at: record.started_at.toISOString(),
    answered_at: record.answered_at ? record.answered_at.toISOString() : null,
    ended_at: record.ended_at ? record.ended_at.toISOString() : null,
    end_reason: (record.end_reason as CallEndReason | null | undefined) ?? null,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString()
  };
}

function mapCallParticipant(record: CallParticipantRecord): CallParticipant {
  return {
    call_id: record.call_id,
    conversation_id: record.conversation_id,
    user_id: record.user_id,
    device_id: record.device_id,
    participant_role: record.participant_role as CallParticipantRole,
    participant_status: record.participant_status as CallParticipantStatus,
    ringing_at: record.ringing_at ? record.ringing_at.toISOString() : null,
    answered_at: record.answered_at ? record.answered_at.toISOString() : null,
    joined_at: record.joined_at ? record.joined_at.toISOString() : null,
    left_at: record.left_at ? record.left_at.toISOString() : null,
    end_reason: (record.end_reason as CallEndReason | null | undefined) ?? null,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString()
  };
}

export class CallController {
  static getCallIceConfig = wrapAsync(
    async (req: Request, res: Response): Promise<CallIceConfigResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const issuedAt = new Date();
      const iceServers: CallIceConfigResponse["ice_servers"] = config.call
        .stunUrls.length
        ? [{ urls: config.call.stunUrls }]
        : [];

      if (config.call.turnUrls.length > 0) {
        if (config.call.turnSecret) {
          const expiresAt =
            Math.floor(issuedAt.getTime() / 1000) + config.call.turnTtlSeconds;
          const username = `${expiresAt}:${userId}`;
          const credential = crypto
            .createHmac("sha1", config.call.turnSecret)
            .update(username)
            .digest("base64");

          iceServers.push({
            urls: config.call.turnUrls,
            username,
            credential
          });
        } else if (config.call.turnUsername && config.call.turnCredential) {
          iceServers.push({
            urls: config.call.turnUrls,
            username: config.call.turnUsername,
            credential: config.call.turnCredential
          });
        }
      }

      return {
        issued_at: issuedAt.toISOString(),
        ttl_seconds: config.call.turnTtlSeconds,
        ice_servers: iceServers
      };
    }
  );

  static getCallRoomConfig = wrapAsync(
    async (req: Request, res: Response): Promise<CallRoomConfigResponse> => {
      void res;
      const callId = optionalQueryString(req, "callId");
      if (!callId) {
        throw new BusinessError("callId is required");
      }

      return CallRoomService.getGroupRoomConfig({
        callId,
        userId: req.JwtPayload!.userId,
        deviceId: req.JwtPayload!.deviceId ?? null
      });
    }
  );

  static getCallState = wrapAsync(
    async (req: Request, res: Response): Promise<CallStateResponse> => {
      void res;
      const callId = optionalQueryString(req, "callId");
      if (!callId) {
        throw new BusinessError("callId is required");
      }

      const state = await CallService.getCallStateForUser(
        callId,
        req.JwtPayload!.userId
      );
      return {
        session: mapCallSession(state.session),
        participants: state.participants.map(mapCallParticipant)
      };
    }
  );
}
