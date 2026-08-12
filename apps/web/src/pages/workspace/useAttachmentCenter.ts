import { useCallback, useState } from "react";
import {
  isFileMessageContent,
  isImageFileMessageContent
} from "@mushroom/shared";
import type { SearchMessageResult } from "../../types/chat";

export type AttachmentTab = "images" | "files";

interface UseAttachmentCenterOptions {
  attachConversationLabels: (
    items: SearchMessageResult[]
  ) => SearchMessageResult[];
}

/**
 * Encapsulates state and lazy-loading for the global attachment center
 * (images / files) modal.
 */
export function useAttachmentCenter({
  attachConversationLabels
}: UseAttachmentCenterOptions) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AttachmentTab>("images");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<{
    images: SearchMessageResult[];
    files: SearchMessageResult[];
  }>({ images: [], files: [] });

  const loadGlobalMedia = useCallback(
    async (kind: AttachmentTab) => {
      setLoading(true);
      try {
        const next = attachConversationLabels(
          ((await window.electronAPI.getGlobalMedia(
            kind,
            300
          )) as SearchMessageResult[]) || []
        );
        setItems(prev => ({
          ...prev,
          [kind]: next
        }));
      } finally {
        setLoading(false);
      }
    },
    [attachConversationLabels]
  );

  const handleTabChange = useCallback(
    (next: AttachmentTab) => {
      setTab(next);
      if (items[next].length === 0) {
        void loadGlobalMedia(next);
      }
    },
    [items, loadGlobalMedia]
  );

  const handleOpenImage = useCallback(
    (list: SearchMessageResult[], index: number) => {
      const item = list[index];
      if (
        item &&
        isFileMessageContent(item.content) &&
        isImageFileMessageContent(item.content)
      ) {
        window.open(item.content.url, "_blank", "noopener,noreferrer");
      }
    },
    []
  );

  return {
    open,
    setOpen,
    tab,
    loading,
    items,
    handleTabChange,
    handleOpenImage
  };
}
