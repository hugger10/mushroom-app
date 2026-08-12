import {
  getMessageSummaryText,
  isFileMessageContent,
  isImageFileMessageContent,
  isMergedForwardContent,
  isSystemMessageContent,
  isVideoFileMessageContent
} from "@mushroom/shared";
import type { ControllerContext } from "../context";
import type {
  MobileMessageSearchFilter,
  MobileMessageSearchMatchScope,
  MobileMessageSearchResult,
  MobileMessageSearchScope
} from "../../types";
import {
  buildMessageSearchText,
  matchesMessageSearchFilter
} from "../internal-helpers";

/**
 * SearchService 负责附件 Tab 列表与跨会话搜索。
 */
export class SearchService {
  private readonly ctx: ControllerContext;
  constructor(ctx: ControllerContext) {
    this.ctx = ctx;
  }

  async listAttachmentMessages(
    kind: "images" | "videos" | "media" | "files",
    clientConversationId?: string
  ) {
    const scope: MobileMessageSearchScope = clientConversationId
      ? "current"
      : "all";
    const baseQuery = {
      scope,
      clientConversationId: clientConversationId ?? null
    } as const;

    if (kind === "media") {
      const [images, videos] = await Promise.all([
        this.searchMessages({ ...baseQuery, filter: "images" }),
        this.searchMessages({ ...baseQuery, filter: "videos" })
      ]);
      const seen = new Map<string, (typeof images)[number]>();
      for (const item of [...images, ...videos]) {
        const id = item.message.client_message_id;
        if (id && !seen.has(id)) {
          seen.set(id, item);
        }
      }
      const combined = Array.from(seen.values());
      combined.sort((a, b) => {
        const ta = new Date(a.message.created_at).getTime() || 0;
        const tb = new Date(b.message.created_at).getTime() || 0;
        return tb - ta;
      });
      return combined;
    }

    const filter: MobileMessageSearchFilter =
      kind === "images" ? "images" : kind === "videos" ? "videos" : "files";

    const messages = await this.searchMessages({
      ...baseQuery,
      filter
    });

    return messages.filter(item => {
      if (!isFileMessageContent(item.message.content)) {
        return false;
      }
      if (kind === "images") {
        return isImageFileMessageContent(item.message.content);
      }
      if (kind === "videos") {
        return isVideoFileMessageContent(item.message.content);
      }
      // 'files': exclude images & videos so 文件 Tab 不重复列出媒体
      return (
        !isImageFileMessageContent(item.message.content) &&
        !isVideoFileMessageContent(item.message.content)
      );
    });
  }

  async searchMessages(input: {
    keyword?: string;
    filter?: MobileMessageSearchFilter;
    scope?: MobileMessageSearchScope;
    matchScope?: MobileMessageSearchMatchScope;
    clientConversationId?: string | null;
  }): Promise<MobileMessageSearchResult[]> {
    const repo = this.ctx.getRepository();
    const filter = input.filter ?? "all";
    const normalizedKeyword = input.keyword?.trim().toLowerCase() ?? "";
    const scope = input.scope ?? "current";
    const matchScope = input.matchScope ?? "all";
    const conversations = await repo.listConversations();
    const targets =
      scope === "all"
        ? conversations
        : conversations.filter(
            item => item.client_conversation_id === input.clientConversationId
          );

    const results: MobileMessageSearchResult[] = [];
    for (const conversation of targets) {
      const messages = await repo.listMessages(
        conversation.client_conversation_id
      );
      for (const message of messages) {
        if (!matchesMessageSearchFilter(message, filter)) {
          continue;
        }
        if (matchScope === "body") {
          if (Number(message.is_recalled || 0) > 0) {
            continue;
          }
          if (isSystemMessageContent(message.content)) {
            continue;
          }
          if (isFileMessageContent(message.content)) {
            continue;
          }
          if (isMergedForwardContent(message.content)) {
            continue;
          }
        }
        if (normalizedKeyword) {
          let searchableText: string;
          if (matchScope === "body") {
            const candidate = message.content as
              | Record<string, unknown>
              | null
              | undefined;
            const bodyText =
              candidate && typeof candidate.text === "string"
                ? candidate.text
                : "";
            if (!bodyText) {
              continue;
            }
            searchableText = bodyText;
          } else {
            searchableText = buildMessageSearchText(message);
          }
          if (!searchableText.toLowerCase().includes(normalizedKeyword)) {
            continue;
          }
        }
        results.push({
          conversation,
          message,
          summary: getMessageSummaryText(message.content)
        });
      }
    }

    return results.sort((left, right) =>
      String(right.message.created_at || "").localeCompare(
        String(left.message.created_at || "")
      )
    );
  }
}
