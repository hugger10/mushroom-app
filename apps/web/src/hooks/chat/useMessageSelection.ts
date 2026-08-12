import { useCallback, useState } from "react";
import type { Message } from "../../types/chat";

export type BatchForwardMode = "one-by-one" | "merged";

export function useMessageSelection() {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set()
  );
  const [batchForwardMode, setBatchForwardMode] =
    useState<BatchForwardMode | null>(null);

  const enterSelectionMode = useCallback((initialMessageId?: string) => {
    setIsSelectionMode(true);
    setSelectedMessageIds(
      initialMessageId ? new Set([initialMessageId]) : new Set()
    );
    setBatchForwardMode(null);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedMessageIds(new Set());
    setBatchForwardMode(null);
  }, []);

  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const startBatchForward = useCallback((mode: BatchForwardMode) => {
    setBatchForwardMode(mode);
  }, []);

  const cancelBatchForward = useCallback(() => {
    setBatchForwardMode(null);
  }, []);

  /** Get selected messages sorted by time from a messages array. */
  const getSelectedMessages = useCallback(
    (messages: Message[]): Message[] => {
      return messages.filter(
        msg => selectedMessageIds.has(msg.client_message_id) && !msg.is_recalled
      );
    },
    [selectedMessageIds]
  );

  return {
    isSelectionMode,
    selectedMessageIds,
    batchForwardMode,
    enterSelectionMode,
    exitSelectionMode,
    toggleMessageSelection,
    startBatchForward,
    cancelBatchForward,
    getSelectedMessages
  };
}
