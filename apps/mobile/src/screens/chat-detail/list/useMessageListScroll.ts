import { Message } from "@mushroom/shared";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  clearActiveConversationIfMatches,
  setActiveConversation
} from "../../../platform/active-conversation";
import type { MobileMessageSearchResult } from "@mushroom/app-core";
import {
  isDateSeparatorItem,
  type ChatListItem
} from "./MessageListItem.types";

export type UseMessageListScrollInput = {
  activeConversationKey: string;
  activeMessages: Message[];
  highlightedMessageId: string | null;
  /**
   * 单调递增的"高亮请求 nonce"。每次 onSearchPrev/Next 被点击都会自增；
   * 即使 highlightedMessageId 未变（首/末结果边界重按场景），
   * 也通过此依赖触发搜索定位 effect 重跑，给用户一次"补救滚动"的机会。
   */
  highlightRequestNonce?: number;
  isMultiSelectMode: boolean;
  currentUserId?: number | null;
  registerScrollToLatest?: (fn: ((animated: boolean) => void) | null) => void;
  isSearchVisible: boolean;
  listData: ChatListItem[];
  searchResults: MobileMessageSearchResult[];
  onLoadOlderMessages: () => void;
  isLoadingOlderMessages: boolean;
  hasMoreHistory: boolean;
};

export function useMessageListScroll(input: UseMessageListScrollInput) {
  const {
    activeConversationKey,
    activeMessages,
    highlightedMessageId,
    highlightRequestNonce,
    isMultiSelectMode,
    currentUserId,
    registerScrollToLatest,
    isSearchVisible,
    listData,
    searchResults,
    onLoadOlderMessages,
    isLoadingOlderMessages,
    hasMoreHistory
  } = input;

  const messageListRef = useRef<FlashListRef<ChatListItem> | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const scrollToBottomOpacity = useRef(new Animated.Value(0)).current;
  const canLoadOlderRef = useRef(false);
  // Whether the user is currently near the bottom of the message list. Used to
  // decide whether to auto-follow an incoming (peer) message. Default to true
  // so the first incoming message after opening a conversation is followed.
  const isNearBottomRef = useRef(true);
  // Tracks the id of the last (tail) message to distinguish "new tail message"
  // (appended at the bottom) from "older history loaded" (prepended at the
  // top). Only the former should trigger auto-scroll.
  const lastTailMessageIdRef = useRef<string | null>(null);
  // Tracks the conversation key that lastTailMessageIdRef belongs to, so that
  // switching conversations does not cause a spurious scroll.
  const tailTrackerConversationRef = useRef<string | null>(null);
  // Whether we have performed the one-time initial scroll-to-bottom for the
  // currently active conversation. Reset on conversation switch.
  const didInitialScrollRef = useRef(false);
  const listLayoutHeightRef = useRef(0);
  const listDataRef = useRef(listData);
  listDataRef.current = listData;

  const scrollToLatest = useCallback(
    (animated: boolean) => {
      if (isMultiSelectMode) {
        return;
      }
      messageListRef.current?.scrollToOffset({ offset: 0, animated });
    },
    [isMultiSelectMode]
  );

  // Mark this conversation as "active" while the screen is focused so that
  // the notification policy suppresses heads-up popups for incoming messages
  // belonging to it (WhatsApp/Telegram/微信 behaviour). The slot is persisted
  // in deviceStorage so the FCM background handler — which runs without our
  // React tree — can read it synchronously.
  useFocusEffect(
    useCallback(() => {
      setActiveConversation(activeConversationKey);
      return () => {
        clearActiveConversationIfMatches(activeConversationKey);
      };
    }, [activeConversationKey])
  );

  useEffect(() => {
    canLoadOlderRef.current = false;
    // Reset tail tracker for the new conversation so the tail-change effect
    // below does not treat the existing tail as a "new" message.
    tailTrackerConversationRef.current = activeConversationKey;
    const lastMessage = activeMessages[activeMessages.length - 1] ?? null;
    lastTailMessageIdRef.current = lastMessage?.client_message_id ?? null;
    // Newly opened conversation: assume we're at the bottom until the user
    // scrolls. This makes incoming messages auto-follow as expected.
    isNearBottomRef.current = true;
    // Allow one-shot initial scroll-to-bottom on first content layout for the
    // new conversation.
    didInitialScrollRef.current = false;
  }, [activeConversationKey, highlightedMessageId, isMultiSelectMode]);

  // Auto-follow newly appended messages (incoming peer messages) only when
  // the user is already near the bottom. This mirrors WhatsApp/Telegram/微信:
  // browsing history is not interrupted, and a floating "scroll to bottom"
  // button (rendered below) lets the user catch up manually.
  useEffect(() => {
    if (tailTrackerConversationRef.current !== activeConversationKey) {
      // Conversation switch handler above will reset the tracker.
      return;
    }
    const lastMessage = activeMessages[activeMessages.length - 1] ?? null;
    const nextTailId = lastMessage?.client_message_id ?? null;
    const previousTailId = lastTailMessageIdRef.current;
    if (nextTailId === previousTailId) {
      return;
    }
    lastTailMessageIdRef.current = nextTailId;
    if (!nextTailId) {
      return;
    }
    if (highlightedMessageId || isMultiSelectMode) {
      return;
    }
    // Messages sent by the current user are handled by an explicit
    // scroll-to-bottom call from the send pipeline (see
    // registerScrollToLatest below) so we don't need to scroll here.
    const isOwnMessage =
      lastMessage != null &&
      Number(lastMessage.sender_id) === Number(currentUserId);
    if (isOwnMessage) {
      return;
    }
    if (!isNearBottomRef.current) {
      return;
    }
    // Defer one frame so FlashList has rendered the new row.
    const handle = requestAnimationFrame(() => {
      messageListRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return () => cancelAnimationFrame(handle);
  }, [
    activeConversationKey,
    activeMessages,
    highlightedMessageId,
    isMultiSelectMode,
    currentUserId
  ]);

  // Expose an imperative "scroll to latest" hook to the parent so that the
  // send pipeline can force the list to the bottom right after inserting the
  // optimistic message — matching WhatsApp/Telegram/微信 behaviour where
  // sending always snaps the viewport to your new message.
  useEffect(() => {
    if (!registerScrollToLatest) {
      return;
    }
    const scroll = (animated: boolean) => {
      if (highlightedMessageId || isMultiSelectMode) {
        return;
      }
      // Defer one frame so the optimistic message row has been appended.
      requestAnimationFrame(() => {
        messageListRef.current?.scrollToOffset({ offset: 0, animated });
      });
    };
    registerScrollToLatest(scroll);
    return () => registerScrollToLatest(null);
  }, [registerScrollToLatest, highlightedMessageId, isMultiSelectMode]);

  const handleLoadOlderMessages = useCallback(() => {
    if (!canLoadOlderRef.current) {
      return;
    }
    if (isLoadingOlderMessages || !hasMoreHistory) {
      return;
    }
    onLoadOlderMessages();
  }, [onLoadOlderMessages, isLoadingOlderMessages, hasMoreHistory]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset } = event.nativeEvent;
      // With inverted FlashList, contentOffset.y = 0 means the viewport is
      // at the visual bottom (latest messages). As the user scrolls upward
      // to browse history, contentOffset.y increases, which directly measures
      // how far the user has scrolled away from the bottom.
      const distanceFromBottom = contentOffset.y;
      // ~120px is roughly one message bubble — close enough that the user is
      // still "at the bottom" and expects to follow new arrivals.
      isNearBottomRef.current = distanceFromBottom <= 120;
      const shouldShow = distanceFromBottom > 300;
      setShowScrollToBottom(shouldShow);
    },
    []
  );

  // Track the FlashList's viewport height so the initial-scroll heuristic
  // below can compare against the rendered content height.
  const handleListLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      listLayoutHeightRef.current = event.nativeEvent.layout.height;
    },
    []
  );

  // One-shot initial bottom-alignment when the conversation's content has
  // actually been laid out. With inverted mode, the list naturally anchors
  // to the bottom, so we just mark the initial scroll as complete.
  const handleContentSizeChange = useCallback(
    (_contentWidth: number, _contentHeight: number) => {
      if (didInitialScrollRef.current) {
        return;
      }
      if (highlightedMessageId || isMultiSelectMode) {
        didInitialScrollRef.current = true;
        return;
      }
      if (activeMessages.length === 0) {
        return;
      }
      didInitialScrollRef.current = true;
    },
    [activeMessages.length, highlightedMessageId, isMultiSelectMode]
  );

  const handleScrollBeginDrag = useCallback(() => {
    canLoadOlderRef.current = true;
  }, []);

  useEffect(() => {
    Animated.timing(scrollToBottomOpacity, {
      toValue: showScrollToBottom ? 1 : 0,
      duration: 200,
      useNativeDriver: true
    }).start();
  }, [showScrollToBottom, scrollToBottomOpacity]);

  const searchCurrentIndex = useMemo(() => {
    if (!highlightedMessageId) {
      return -1;
    }
    return searchResults.findIndex(
      r => r.message.client_message_id === highlightedMessageId
    );
  }, [searchResults, highlightedMessageId]);

  // Scroll to highlighted message whenever it changes (search or jump-to-reply).
  useEffect(() => {
    if (!highlightedMessageId) {
      return;
    }
    // 跨页跳转（ensureMessageVisible 扩窗 / loadMessagesAround）后，
    // FlashList 不一定在同一帧就 render 出目标行；单次 rAF + scrollToIndex
    // 容易静默失败。改用带帧上限的重试：每帧重新在 listData 内查找 index，
    // 找到立即滚动；超时（~15 帧 / ~250ms）后放弃。
    const targetId = highlightedMessageId;
    const list = messageListRef.current;
    if (!list) {
      return;
    }
    let rafHandle = 0;
    let cancelled = false;
    let frames = 0;
    const MAX_FRAMES = 15;

    const tryScroll = () => {
      if (cancelled) return;
      const currentListData = listDataRef.current;
      const idx = currentListData.findIndex(
        item =>
          !isDateSeparatorItem(item) && item.client_message_id === targetId
      );
      if (idx >= 0) {
        try {
          (
            list as {
              scrollToIndex?: (opts: {
                index: number;
                animated?: boolean;
                viewPosition?: number;
              }) => void;
            }
          ).scrollToIndex?.({
            index: idx,
            animated: true,
            viewPosition: 0.5
          });
          return;
        } catch {
          // 越界或尚未 layout：留待下一帧重试。
        }
      }
      frames += 1;
      if (frames >= MAX_FRAMES) {
        return;
      }
      rafHandle = requestAnimationFrame(() => tryScroll());
    };

    rafHandle = requestAnimationFrame(() => tryScroll());

    return () => {
      cancelled = true;
      if (rafHandle !== 0) {
        cancelAnimationFrame(rafHandle);
      }
    };
  }, [isSearchVisible, highlightedMessageId, highlightRequestNonce]);

  return {
    messageListRef,
    handleScroll,
    handleListLayout,
    handleContentSizeChange,
    handleLoadOlderMessages,
    handleScrollBeginDrag,
    showScrollToBottom,
    scrollToBottomOpacity,
    scrollToLatest,
    searchCurrentIndex
  };
}

// Re-export FlashList types so consumers can type their list ref without
// importing from the third-party package directly.
export type { FlashListRef, FlashList };
