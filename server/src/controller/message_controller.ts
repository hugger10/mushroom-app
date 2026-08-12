import { Request, Response } from "express";
import type {
  ListMessageReactionsResponse,
  ListReactionDeltaResponse,
  MessageDeltaResponse,
  MessageListResponse,
  MessageStateRecord,
  MessageStateSyncResponse,
  MessageSyncCursor,
  RecallMessageResponse,
  RemoteMessage,
  SetMessageReactionResponse,
  UpdateMessageStateResponse
} from "@mushroom/shared";
import MessageService from "../service/message_service";
import MessageReactionService from "../service/message_reaction_service";
import MessageReactionRepository from "../repository/message_reaction_repository";
import { wrapAsync } from "../handler/response_wrapper";
import { toRemoteMessage } from "../utils/dto";
import { enrichMessagesWithAttachmentUrls } from "../service/attachment_url_resolver";
import { BusinessError } from "../handler/business_error";
import {
  optionalNumberField,
  optionalQueryNumber,
  optionalQueryString,
  requireStringField
} from "../handler/request_parser";
import { decodeSyncCursor } from "../utils/sync_cursor";

export class MessageController {
  static sync = wrapAsync(
    async (req: Request, res: Response): Promise<RemoteMessage[]> => {
      void res;
      const convs = req.body;
      if (!Array.isArray(convs)) {
        throw new BusinessError(
          "Request body must be a message sync cursor list"
        );
      }
      const userId = req.JwtPayload!.userId;
      const messages = await MessageService.getMessages(
        convs as MessageSyncCursor[],
        userId
      );
      const ids = messages.map(m => String(m.id));
      const reactionRecords = ids.length
        ? await MessageReactionRepository.findActiveByMessageIds(ids)
        : [];
      const reactionsMap = new Map<
        string,
        Array<{
          message_id: string;
          conversation_id: string;
          user_id: number;
          emoji: string;
          sequence: number;
          updated_at: string;
        }>
      >();
      for (const r of reactionRecords) {
        const id = String(r.message_id);
        const list = reactionsMap.get(id) ?? [];
        list.push({
          message_id: id,
          conversation_id: String(r.conversation_id),
          user_id: r.user_id,
          emoji: r.emoji,
          sequence: Number(r.sequence ?? 0),
          updated_at: r.updated_at.toISOString()
        });
        reactionsMap.set(id, list);
      }
      return enrichMessagesWithAttachmentUrls(
        messages.map(m => toRemoteMessage(m, reactionsMap.get(String(m.id))))
      );
    }
  );

  static syncState = wrapAsync(
    async (req: Request, res: Response): Promise<MessageStateSyncResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const syncCursor =
        decodeSyncCursor(optionalQueryString(req, "syncCursor")) ??
        (() => {
          const legacy = optionalQueryString(req, "lastSyncTime");
          return legacy
            ? {
                updated_at: new Date(legacy).toISOString(),
                entity_id: "0"
              }
            : null;
        })();
      return MessageService.syncMessageStates(
        userId,
        syncCursor,
        optionalQueryNumber(req, "pageSize") ?? 200
      );
    }
  );

  static delta = wrapAsync(
    async (req: Request, res: Response): Promise<MessageDeltaResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const conversationId = optionalQueryString(req, "conversationId");
      const clientConversationId = optionalQueryString(
        req,
        "clientConversationId"
      );
      if (!conversationId || !clientConversationId) {
        throw new BusinessError(
          "conversationId and clientConversationId are required"
        );
      }

      return MessageService.getMessageDelta(
        {
          conversationId,
          clientConversationId,
          afterSequence: optionalQueryNumber(req, "afterSequence") ?? 0,
          limit: optionalQueryNumber(req, "limit") ?? 200
        },
        userId
      );
    }
  );

  static list = wrapAsync(
    async (req: Request, res: Response): Promise<MessageListResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const conversationId = optionalQueryString(req, "conversationId");
      const clientConversationId = optionalQueryString(
        req,
        "clientConversationId"
      );
      if (!conversationId || !clientConversationId) {
        throw new BusinessError(
          "conversationId and clientConversationId are required"
        );
      }

      return MessageService.listMessages(
        {
          conversationId,
          clientConversationId,
          beforeSequence: optionalQueryNumber(req, "beforeSequence"),
          limit: optionalQueryNumber(req, "limit") ?? 50
        },
        userId
      );
    }
  );

  static around = wrapAsync(
    async (req: Request, res: Response): Promise<MessageListResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const conversationId = optionalQueryString(req, "conversationId");
      const clientConversationId = optionalQueryString(
        req,
        "clientConversationId"
      );
      if (!conversationId || !clientConversationId) {
        throw new BusinessError(
          "conversationId and clientConversationId are required"
        );
      }
      const pivotSequence = optionalQueryNumber(req, "pivotSequence");
      if (pivotSequence === undefined || pivotSequence === null) {
        throw new BusinessError("pivotSequence is required");
      }

      return MessageService.listMessagesAround(
        {
          conversationId,
          clientConversationId,
          pivotSequence,
          limit: optionalQueryNumber(req, "limit") ?? 50
        },
        userId
      );
    }
  );

  static updateState = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<UpdateMessageStateResponse> => {
      void res;
      const body = req.body as Record<string, unknown>;
      const messageId = requireStringField(
        body,
        "messageId",
        "messageId is required"
      );
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );
      const isFavorited = optionalNumberField(body, "is_favorited");
      const isPinned = optionalNumberField(body, "is_pinned");

      if (isFavorited === undefined && isPinned === undefined) {
        throw new BusinessError("At least one message state patch is required");
      }

      return MessageService.updateMessageState(
        req.JwtPayload!.userId,
        conversationId,
        messageId,
        {
          is_favorited: isFavorited,
          is_pinned: isPinned
        }
      ) as Promise<MessageStateRecord>;
    }
  );

  static recall = wrapAsync(
    async (req: Request, res: Response): Promise<RecallMessageResponse> => {
      void res;
      const messageId = requireStringField(
        req.body as Record<string, unknown>,
        "messageId",
        "messageId is required"
      );
      const conversationId = requireStringField(
        req.body as Record<string, unknown>,
        "conversationId",
        "conversationId is required"
      );
      const userId = req.JwtPayload!.userId;

      const result = await MessageService.recallMessage(
        userId,
        conversationId,
        messageId
      );

      return {
        message_id: result.server_message_id,
        conversation_id: result.server_conversation_id,
        sequence: result.sequence,
        client_message_id: result.client_message_id,
        content: result.content,
        updated_at: result.updated_at,
        recaller_id: result.recaller_id
      };
    }
  );

  static setReaction = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<SetMessageReactionResponse> => {
      void res;
      const body = req.body as Record<string, unknown>;
      const messageId = requireStringField(
        body,
        "messageId",
        "messageId is required"
      );
      const conversationId = requireStringField(
        body,
        "conversationId",
        "conversationId is required"
      );
      const rawEmoji = body.emoji;
      let emoji: string | null;
      if (rawEmoji === null || rawEmoji === undefined) {
        emoji = null;
      } else if (typeof rawEmoji === "string") {
        emoji = rawEmoji;
      } else {
        throw new BusinessError("emoji must be a string or null");
      }

      return MessageReactionService.setReaction(
        req.JwtPayload!.userId,
        conversationId,
        messageId,
        emoji
      );
    }
  );

  static listReactions = wrapAsync(
    async (
      req: Request,
      res: Response
    ): Promise<ListMessageReactionsResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const raw = optionalQueryString(req, "messageIds");
      if (!raw) {
        return { reactions: [] };
      }
      const messageIds = raw
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const reactions = await MessageReactionService.listReactionsByMessageIds(
        userId,
        messageIds
      );
      return { reactions };
    }
  );

  static listReactionDeltas = wrapAsync(
    async (req: Request, res: Response): Promise<ListReactionDeltaResponse> => {
      void res;
      const userId = req.JwtPayload!.userId;
      const conversationId = optionalQueryString(req, "conversationId");
      if (!conversationId) {
        throw new BusinessError("conversationId is required");
      }
      const afterSequence = optionalQueryNumber(req, "afterSequence") ?? 0;
      const limit = optionalQueryNumber(req, "limit");

      return MessageReactionService.listReactionDeltas(
        userId,
        conversationId,
        afterSequence,
        limit
      );
    }
  );
}
