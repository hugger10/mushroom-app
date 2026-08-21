import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { deviceStorage } from "../data/storage";
import {
  normalizeChatBackgroundId,
  type ChatBackgroundId
} from "./chat-backgrounds";

const CHAT_BACKGROUND_STORAGE_KEY = "mushroom.mobile.chat-background";

type ChatBackgroundContextValue = {
  chatBackgroundId: ChatBackgroundId;
  setChatBackgroundId: (id: ChatBackgroundId) => void;
};

const fallbackChatBackgroundContext: ChatBackgroundContextValue = {
  chatBackgroundId: "doodle",
  setChatBackgroundId: () => undefined
};

const ChatBackgroundContext = createContext<ChatBackgroundContextValue>(
  fallbackChatBackgroundContext
);

function getStoredChatBackgroundId(): ChatBackgroundId {
  return normalizeChatBackgroundId(
    deviceStorage.getString(CHAT_BACKGROUND_STORAGE_KEY)
  );
}

/**
 * 设备级「聊天背景」全局偏好（跨账号、作用于所有会话）。
 * 与主题/语言偏好一致：持久化到 deviceStorage，通过 Context 使选择页
 * 实时预览、聊天页即时响应。
 */
export function ChatBackgroundProvider({ children }: PropsWithChildren) {
  const [chatBackgroundId, setChatBackgroundIdState] =
    useState<ChatBackgroundId>(getStoredChatBackgroundId);

  const setChatBackgroundId = useCallback((id: ChatBackgroundId) => {
    setChatBackgroundIdState(id);
    if (id === "doodle") {
      deviceStorage.remove(CHAT_BACKGROUND_STORAGE_KEY);
      return;
    }
    deviceStorage.set(CHAT_BACKGROUND_STORAGE_KEY, id);
  }, []);

  const contextValue = useMemo<ChatBackgroundContextValue>(
    () => ({ chatBackgroundId, setChatBackgroundId }),
    [chatBackgroundId, setChatBackgroundId]
  );

  return (
    <ChatBackgroundContext.Provider value={contextValue}>
      {children}
    </ChatBackgroundContext.Provider>
  );
}

export function useChatBackground() {
  return useContext(ChatBackgroundContext);
}
