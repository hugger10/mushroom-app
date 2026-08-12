import { useCallback, useState } from "react";
import type { SearchMessageResult } from "../../types/chat";

interface UseGlobalSearchOptions {
  handleSearchMessages: (
    keyword: string,
    scope?: "current" | "all"
  ) => Promise<SearchMessageResult[]>;
  attachConversationLabels: (
    items: SearchMessageResult[]
  ) => SearchMessageResult[];
}

/**
 * Encapsulates state and request flow for the global workspace search modal.
 * UI ownership (modal open/close) is also colocated to keep Home.tsx thin.
 */
export function useGlobalSearch({
  handleSearchMessages,
  attachConversationLabels
}: UseGlobalSearchOptions) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchMessageResult[]>([]);

  const runSearch = useCallback(async () => {
    if (!keyword.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const items = await handleSearchMessages(keyword.trim(), "all");
      setResults(attachConversationLabels(items));
    } finally {
      setLoading(false);
    }
  }, [attachConversationLabels, handleSearchMessages, keyword]);

  return {
    open,
    setOpen,
    keyword,
    setKeyword,
    loading,
    results,
    runSearch
  };
}
