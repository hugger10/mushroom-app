import {
  MENTION_ALL_TOKENS,
  normalizeMentionDraft,
  type MessageMention
} from "@mushroom/shared";
import type { MessageActionsCtx, MentionDraft } from "./types";
import { i18n } from "../../../i18n";

export function createComposerActions(ctx: MessageActionsCtx) {
  const { state } = ctx;

  function scheduleTypingStopSignal() {
    if (state.typingSignalTimerRef.current) {
      clearTimeout(state.typingSignalTimerRef.current);
    }

    state.typingSignalTimerRef.current = setTimeout(() => {
      void ctx.updateTypingState(false, "text");
      state.typingSignalTimerRef.current = null;
    }, 2200);
  }

  function buildMentionDraft(text: string): MentionDraft {
    if (!state.activeConversation || state.activeConversation.type !== 2) {
      return {
        mentions: [],
        mentionAll: false
      };
    }

    const mentions: MessageMention[] = (state.activeConversation.members ?? [])
      .filter(
        member =>
          Number(member.user_id) !== Number(state.snapshot?.auth.user?.userId)
      )
      .map(member => ({
        user_id: Number(member.user_id),
        nickname:
          member.nickname ||
          i18n.t("display.unknownUser", { id: member.user_id })
      }))
      .filter(mention => text.includes(`@${mention.nickname}`));
    const mentionAll = MENTION_ALL_TOKENS.some(token =>
      text.toLowerCase().includes(token.toLowerCase())
    );
    return normalizeMentionDraft(text, mentions, mentionAll);
  }

  function handleComposerTextChange(value: string) {
    state.setComposerText(value);
    void ctx.updateTypingState(value.trim().length > 0, "text");
  }

  return {
    scheduleTypingStopSignal,
    buildMentionDraft,
    handleComposerTextChange
  };
}
