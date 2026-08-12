import { useEffect, useRef, type RefObject } from "react";
import { collectAttachmentUploadIds } from "@mushroom/shared";
import { mobileAppController } from "../../../services/app-runtime";
import {
  refreshAttachmentUrlsAndCache,
  conversationPreRefreshedAt,
  PRE_REFRESH_TTL_MS
} from "../../../services/refresh-attachment-urls";
import { getReadableErrorMessage } from "../../../utils/error-message";
import type { MobileAppState } from "../useMobileAppState";

export function useMobileUiStateEffects(params: {
  state: MobileAppState;
  meDataLoadedRef: RefObject<boolean>;
  refreshMeDataEvent: () => Promise<void>;
}) {
  const { state, meDataLoadedRef, refreshMeDataEvent } = params;

  // 把 highlightedMessageId 镜像到 ref，确保下方搜索 effect 里的延时回调
  // 拿到的是最新值（用户已经通过上/下箭头切换过其他结果时不被覆盖）。
  const highlightedMessageIdRef = useRef(state.highlightedMessageId);
  useEffect(() => {
    highlightedMessageIdRef.current = state.highlightedMessageId;
  }, [state.highlightedMessageId]);

  useEffect(() => {
    if (!state.activeConversationId) {
      void mobileAppController.setActiveConversation(null, false);
      return;
    }

    void mobileAppController.setActiveConversation(state.activeConversationId);
  }, [state.activeConversationId]);

  // A 方案：会话切换后，把首屏可见消息中的附件 upload_id 一次性预刷新；
  // 服务端 ≤100 ids/请求，refresh-urls 内部会再做微批 + 分批。
  // 使用模块级缓存（见文件底部 conversationPreRefreshedAt），
  // 同一会话在 TTL（30 分钟，约 presigned TTL 的一半）内不重复发起请求，
  // 避免来回切换/二次进入会话时反复调用 /file/attachment/refresh-urls。
  useEffect(() => {
    const convId = state.activeConversationId;
    if (!convId) return;
    const messages = state.activeMessages;
    if (!messages || messages.length === 0) return;
    const lastAt = conversationPreRefreshedAt.get(convId) ?? 0;
    if (Date.now() - lastAt < PRE_REFRESH_TTL_MS) {
      return;
    }
    // 仅取最近 N 条以贴近首屏可见范围，避免无谓的刷新放大。
    const VISIBLE_TAIL = 50;
    const tail =
      messages.length > VISIBLE_TAIL ? messages.slice(-VISIBLE_TAIL) : messages;
    const messageIds: Record<string, string> = {};
    const ids = collectAttachmentUploadIds(tail, (msg, uploadId) => {
      const mid = msg.client_message_id || msg.server_message_id;
      if (mid && !messageIds[uploadId]) {
        messageIds[uploadId] = String(mid);
      }
    });
    if (ids.length === 0) {
      // 没有附件时也打个时间戳，避免后续 messages 变化继续进入这里再 collect 一次。
      conversationPreRefreshedAt.set(convId, Date.now());
      return;
    }
    conversationPreRefreshedAt.set(convId, Date.now());
    void refreshAttachmentUrlsAndCache(ids, { messageIds }).catch(() => {
      // 预刷新失败不影响 UI，等待 onError 自愈兜底；
      // 失败后立即回退时间戳，让用户下次进入时可重试。
      conversationPreRefreshedAt.delete(convId);
    });
  }, [state.activeConversationId, state.activeMessages]);

  useEffect(() => {
    if (!state.activeConversation) {
      state.setReplyTargetId(null);
      state.setSelectedMessageId(null);
      state.setForwardingMessageId(null);
      state.setIsSearchVisible(false);
      state.setSearchKeyword("");
      state.setSearchResults([]);
      state.setPinnedMessages([]);
      state.setPinnedMessagesVisible(false);
      return;
    }

    state.setGroupNameDraft(state.activeConversation.name || "");
    state.setGroupDescriptionDraft(state.activeConversation.description || "");
    state.setGroupAnnouncementDraft(state.groupSettings.announcement || "");
    state.setGroupMuteAll(Boolean(state.groupSettings.mute_all));
    state.setGroupInvitePermission(
      state.groupSettings.invite_permission || "all_members"
    );
    state.setGroupProfileEditPermission(
      state.groupSettings.profile_edit_permission || "admins"
    );
    state.setSelectedAddMemberIds([]);
    state.setSelectedStrangerProfiles([]);
  }, [
    state.activeConversation,
    state.groupSettings,
    state.setReplyTargetId,
    state.setSelectedMessageId,
    state.setForwardingMessageId,
    state.setIsSearchVisible,
    state.setSearchKeyword,
    state.setSearchResults,
    state.setPinnedMessages,
    state.setPinnedMessagesVisible,
    state.setGroupNameDraft,
    state.setGroupDescriptionDraft,
    state.setGroupAnnouncementDraft,
    state.setGroupMuteAll,
    state.setGroupInvitePermission,
    state.setGroupProfileEditPermission,
    state.setSelectedAddMemberIds,
    state.setSelectedStrangerProfiles
  ]);

  useEffect(() => {
    state.setProfileForm({
      nickname:
        state.snapshot?.auth.profile?.nickname ||
        state.snapshot?.auth.user?.nickname ||
        "",
      avatar_url:
        state.snapshot?.auth.profile?.avatar_url ||
        state.snapshot?.auth.user?.avatar ||
        "",
      email: state.snapshot?.auth.profile?.email || "",
      phone: state.snapshot?.auth.profile?.phone || "",
      gender: state.snapshot?.auth.profile?.gender ?? 0,
      birthday: state.snapshot?.auth.profile?.birthday || "",
      signature: state.snapshot?.auth.profile?.signature || ""
    });
  }, [
    state.snapshot?.auth.profile?.avatar_url,
    state.snapshot?.auth.profile?.birthday,
    state.snapshot?.auth.profile?.email,
    state.snapshot?.auth.profile?.gender,
    state.snapshot?.auth.profile?.nickname,
    state.snapshot?.auth.profile?.phone,
    state.snapshot?.auth.profile?.signature,
    state.snapshot?.auth.user?.avatar,
    state.snapshot?.auth.user?.nickname
  ]);

  useEffect(() => {
    if (!state.isAuthenticated || state.tab !== "me") {
      meDataLoadedRef.current = false;
      return;
    }

    if (meDataLoadedRef.current) {
      return;
    }

    meDataLoadedRef.current = true;
    void refreshMeDataEvent();
  }, [state.isAuthenticated, state.tab]);

  useEffect(() => {
    if (!state.activeConversation || !state.isAuthenticated) {
      return;
    }

    const activeConversation = state.activeConversation;
    const timer = setTimeout(() => {
      const remoteDraft = activeConversation.draft ?? "";
      if (state.composerText === remoteDraft) {
        return;
      }
      void mobileAppController.saveConversationDraft(
        activeConversation.client_conversation_id,
        state.composerText
      );
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [state.activeConversation, state.composerText, state.isAuthenticated]);

  useEffect(() => {
    if (!state.isSearchVisible || !state.activeConversationId) {
      state.setSearchResults([]);
      state.setHighlightedMessageId(null);
      return;
    }

    const trimmed = state.searchKeyword.trim();
    if (!trimmed) {
      state.setSearchResults([]);
      state.setHighlightedMessageId(null);
      return;
    }

    const timer = setTimeout(() => {
      void mobileAppController
        .searchMessages({
          keyword: state.searchKeyword,
          filter: state.searchFilter,
          scope: "current",
          matchScope: "body",
          clientConversationId: state.activeConversationId
        })
        .then(async results => {
          state.setSearchResults(results);
          // Default to the last match (most recent message), WhatsApp-style.
          if (results.length === 0) {
            state.setHighlightedMessageId(null);
            return;
          }
          const currentHighlighted = highlightedMessageIdRef.current;
          const stillExists =
            currentHighlighted &&
            results.some(
              r => r.message.client_message_id === currentHighlighted
            );
          if (stillExists) return;
          const last = results[results.length - 1];
          const targetId = last.message.client_message_id;
          const pivotSequence = Number(last.message.sequence || 0);
          const convId = state.activeConversationId;
          if (!convId) return;
          state.setIsSearchNavigating(true);
          try {
            await mobileAppController.ensureMessageVisible(convId, targetId, {
              pivotSequence: pivotSequence > 0 ? pivotSequence : undefined
            });
            state.setHighlightedMessageId(targetId);
          } catch (currentError) {
            state.setError(getReadableErrorMessage(currentError));
          } finally {
            state.setIsSearchNavigating(false);
          }
        })
        .catch(currentError => {
          state.setError(getReadableErrorMessage(currentError));
        });
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [
    state.activeConversationId,
    state.isSearchVisible,
    state.searchKeyword,
    state.searchFilter
  ]);

  // 当前会话「置顶消息」列表加载。
  //
  // 复用 searchMessages(filter: "pinned", scope: "current")（本地 SQLite 过滤）。
  // 为了避免每条新消息到达都触发一次全量扫描，这里用「置顶签名」做增量判断：
  // 仅当会话切换，或窗口内可见消息的置顶集合（is_pinned=1 的 id 列表）发生
  // 变化时才重新查询。置顶/取消置顶（走 publishSnapshot → activeMessages 更新）、
  // 回翻加载到更早的置顶消息都会改变签名 → 自动刷新。
  //
  // 例外：窗口外的置顶消息被取消置顶时，activeMessages 不变化（签名不变），
  // 由 handleTogglePin 在成功后 bumpPinnedRefresh() 强制跳过签名判断重查。
  const pinnedQueryRef = useRef<{
    conversationKey: string;
    signature: string | null;
    nonce: number;
  }>({ conversationKey: "", signature: null, nonce: -1 });
  const pinnedRequestTokenRef = useRef(0);
  useEffect(() => {
    const conversationKey = state.activeConversationId;
    if (!conversationKey || !state.activeConversation) {
      return;
    }
    const signature = (state.activeMessages ?? [])
      .filter(m => Number(m.is_pinned || 0) > 0)
      .map(m => m.client_message_id)
      .sort()
      .join(",");
    const prev = pinnedQueryRef.current;
    const forced = prev.nonce !== state.pinnedRefreshNonce;
    if (
      !forced &&
      prev.conversationKey === conversationKey &&
      prev.signature === signature
    ) {
      return;
    }
    if (prev.conversationKey !== conversationKey) {
      // 切换会话时先清空旧数据，避免横条短暂展示上一条会话的置顶消息。
      state.setPinnedMessages([]);
    }
    pinnedQueryRef.current = {
      conversationKey,
      signature,
      nonce: state.pinnedRefreshNonce
    };
    const requestToken = ++pinnedRequestTokenRef.current;
    void mobileAppController
      .searchMessages({
        scope: "current",
        filter: "pinned",
        clientConversationId: conversationKey
      })
      .then(results => {
        if (requestToken === pinnedRequestTokenRef.current) {
          state.setPinnedMessages(results);
        }
      })
      .catch(() => {
        // 查询失败不影响 UI，保留上一次结果，等待下次签名变化重试。
      });
  }, [
    state.activeConversationId,
    state.activeConversation,
    state.activeMessages,
    state.pinnedRefreshNonce,
    state.setPinnedMessages
  ]);
}
