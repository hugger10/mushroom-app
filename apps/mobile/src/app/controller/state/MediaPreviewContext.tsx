import { createContext, useContext, type ReactNode } from "react";
import type { Message } from "@mushroom/shared";
import type { PreviewImageItem } from "./useChatInteractionState";

export type MediaPreviewActions = {
  openImagePreviewList: (
    images: PreviewImageItem[],
    startIndex: number
  ) => void;
  setPreviewVideo: (
    input: {
      uri: string;
      uploadId?: string | null;
      messageId?: string | null;
    } | null
  ) => void;
  openAttachment: (message: Message) => Promise<void>;
};

const MediaPreviewContext = createContext<MediaPreviewActions | null>(null);

export function MediaPreviewProvider(props: {
  value: MediaPreviewActions;
  children: ReactNode;
}) {
  return (
    <MediaPreviewContext.Provider value={props.value}>
      {props.children}
    </MediaPreviewContext.Provider>
  );
}

export function useMediaPreviewActions(): MediaPreviewActions {
  const value = useContext(MediaPreviewContext);
  if (!value) {
    throw new Error(
      "useMediaPreviewActions must be used inside MediaPreviewProvider"
    );
  }
  return value;
}
