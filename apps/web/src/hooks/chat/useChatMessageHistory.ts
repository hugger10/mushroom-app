import type { Dispatch, RefObject, SetStateAction } from "react";
import { fetchConversationTailMessages } from "../../sync/syncContext";
import type {
  Conversation,
  Message,
  SearchMessageResult
} from "../../types/chat";
import { sortMessagesForTimeline } from "../../utils/messageTimeline";
import { mergeMessageLists } from "../useChatHelpers";
import { i18n } from "../../i18n";

type UseChatMessageHistoryOptions = {
  activeConversation: Conversation | undefined;
  activeConversationRef: RefObject<Conversation | undefined>;
  conversations: Conversation[];
  conversationsRef: RefObject<Conversation[]>;
  messages: Record<string, Message[]>;
  isLoadingMore: boolean;
  setIsLoadingMore: Dispatch<SetStateAction<boolean>>;
  setHasMore: Dispatch<SetStateAction<Record<string, boolean>>>;
  setMessages: Dispatch<SetStateAction<Record<string, Message[]>>>;
  openConversation: (conversation: Conversation) => Promise<void>;
};

export function useChatMessageHistory({
  activeConversation,
  activeConversationRef,
  conversations,
  conversationsRef,
  messages,
  isLoadingMore,
  setIsLoadingMore,
  setHasMore,
  setMessages,
  openConversation
}: UseChatMessageHistoryOptions) {
  const loadMoreMessages = async (conversationId: string) => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const currentMsgs = messages[conversationId] || [];
      if (currentMsgs.length === 0) return;
      const conversation = conversationsRef.current.find(
        item => item.client_conversation_id === conversationId
      );
      const oldest = currentMsgs[0];
      const older = await window.electronAPI.getMessages(
        conversationId,
        50,
        Number(oldest.sequence ?? 0) > 0
          ? { beforeSequence: Number(oldest.sequence) }
          : {
              beforeLocalCreatedAt: new Date(oldest.created_at).toISOString()
            }
      );

      if (older.length === 0) {
        if (
          conversation &&
          Number(conversation.server_conversation_id || 0) > 0 &&
          Number(conversation.history_complete || 0) === 0 &&
          Number(oldest.sequence || 0) > 1
        ) {
          const remotePage = await fetchConversationTailMessages(
            String(conversation.server_conversation_id),
            conversationId,
            {
              beforeSequence: Number(oldest.sequence || 0)
            }
          );
          if (!remotePage) {
            // 远端调用失败或返回空：保守地关闭上拉，避免后续观察者继续触发。
            setHasMore(prev => ({ ...prev, [conversationId]: false }));
            return;
          }
          const remoteOlder = await window.electronAPI.getMessages(
            conversationId,
            50,
            {
              beforeSequence: Number(oldest.sequence || 0)
            }
          );
          if (remoteOlder.length === 0) {
            // 远端兜底也没拿回更老消息：把状态永久落库为"历史已完整"，
            // 避免下次打开会话时仍因 history_complete=0 触发幻影 loading。
            // 触发条件常见于：先「清空聊天记录」抬升了 local_hidden_before_seq，
            // 之后到达的新消息又与 cutoff 不严格相邻，使 reconcile 把
            // history_complete 复算回 0。
            if (!remotePage.has_more) {
              try {
                await window.electronAPI.markHistoryComplete({
                  clientConversationId: conversationId,
                  oldestVisibleSequence: Number(oldest.sequence || 0)
                });
              } catch (error) {
                console.warn(
                  "[useChatMessageHistory] markHistoryComplete failed",
                  error
                );
              }
            }
            setHasMore(prev => ({
              ...prev,
              [conversationId]: Boolean(remotePage.has_more)
            }));
            return;
          }
          setMessages(prev => ({
            ...prev,
            [conversationId]: mergeMessageLists(
              sortMessagesForTimeline(remoteOlder),
              prev[conversationId] || []
            )
          }));
          setHasMore(prev => ({
            ...prev,
            [conversationId]:
              remotePage.has_more ||
              Number(remotePage.loaded_from_sequence || 0) > 1
          }));
          return;
        }

        setHasMore(prev => ({ ...prev, [conversationId]: false }));
        return;
      }

      setMessages(prev => ({
        ...prev,
        [conversationId]: mergeMessageLists(
          sortMessagesForTimeline(older),
          prev[conversationId] || []
        )
      }));

      if (older.length < 50) {
        setHasMore(prev => ({ ...prev, [conversationId]: false }));
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSearchMessages = async (
    keyword: string,
    scope: "current" | "all" = "current"
  ): Promise<SearchMessageResult[]> => {
    if (!keyword.trim()) {
      return [];
    }

    const results =
      scope === "all"
        ? await window.electronAPI.searchAllMessages(keyword.trim(), 50)
        : activeConversation
          ? await window.electronAPI.searchMessages(
              activeConversation.client_conversation_id,
              keyword.trim(),
              30
            )
          : [];

    return results.map(result => {
      const conversation = conversations.find(
        item => item.client_conversation_id === result.client_conversation_id
      );
      return {
        ...result,
        conversation_label:
          conversation?.display_name ||
          conversation?.name ||
          i18n.t("conversationList.previewUnknownSender")
      };
    });
  };

  const handleJumpToMessage = async (target: {
    clientMessageId?: string;
    serverMessageId?: string;
    clientConversationId?: string;
  }) => {
    const targetConversation = target.clientConversationId
      ? conversations.find(
          item => item.client_conversation_id === target.clientConversationId
        )
      : activeConversation;

    if (!targetConversation) {
      return null;
    }

    const conversationId = targetConversation.client_conversation_id;
    if (
      activeConversationRef.current?.client_conversation_id !== conversationId
    ) {
      await openConversation(targetConversation);
    }

    // 通过 functional setState 读取最新 state，避免闭包里的 messages 已过期
    // （连续点击搜索结果上下箭头时，messages 可能尚未刷新到本闭包）。
    const readLatestMessages = (): Message[] => {
      let snapshot: Message[] = [];
      setMessages(prev => {
        snapshot = prev[conversationId] || [];
        return prev;
      });
      return snapshot;
    };

    let targetMessage: Message | null = target.clientMessageId
      ? (readLatestMessages().find(
          message => message.client_message_id === target.clientMessageId
        ) ?? null)
      : null;

    if (!targetMessage && target.serverMessageId) {
      targetMessage = await window.electronAPI.getMessageByServerId(
        conversationId,
        target.serverMessageId
      );
    }

    if (!targetMessage) {
      return null;
    }

    const finalTarget = targetMessage;
    const alreadyLoaded = readLatestMessages().some(
      message => message.client_message_id === finalTarget.client_message_id
    );

    if (!alreadyLoaded) {
      const contextMessages = await window.electronAPI.getMessageContext(
        conversationId,
        finalTarget.client_message_id,
        20,
        20
      );

      if (contextMessages.length > 0) {
        setMessages(prev => ({
          ...prev,
          [conversationId]: contextMessages
        }));
      }
    }

    return finalTarget.client_message_id;
  };

  const handleLoadConversationMedia = async (
    kind: "images" | "files" = "files"
  ) => {
    if (!activeConversation) {
      return [];
    }

    return window.electronAPI.getConversationMedia(
      activeConversation.client_conversation_id,
      kind,
      300
    );
  };

  return {
    loadMoreMessages,
    handleSearchMessages,
    handleJumpToMessage,
    handleLoadConversationMedia
  };
}
