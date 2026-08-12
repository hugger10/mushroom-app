import { useCallback, useEffect, useState } from "react";
import type { Message } from "../../../types/chat";

interface UseConversationMediaOptions {
  activeConversationId?: string;
  onLoadConversationMedia: (kind?: "images" | "files") => Promise<Message[]>;
}

export function useConversationMedia({
  activeConversationId,
  onLoadConversationMedia
}: UseConversationMediaOptions) {
  const [mediaItems, setMediaItems] = useState<{
    images: Message[];
    files: Message[];
  }>({
    images: [],
    files: []
  });
  const [isMediaLoading, setIsMediaLoading] = useState(false);

  const loadMediaItems = useCallback(
    async (kind?: "images" | "files") => {
      setIsMediaLoading(true);
      try {
        if (!kind || kind === "images") {
          const images = await onLoadConversationMedia("images");
          setMediaItems(prev => ({ ...prev, images }));
        }
        if (!kind || kind === "files") {
          const files = await onLoadConversationMedia("files");
          setMediaItems(prev => ({ ...prev, files }));
        }
      } finally {
        setIsMediaLoading(false);
      }
    },
    [onLoadConversationMedia]
  );

  useEffect(() => {
    setMediaItems({ images: [], files: [] });
  }, [activeConversationId]);

  return {
    mediaItems,
    isMediaLoading,
    loadMediaItems
  };
}
