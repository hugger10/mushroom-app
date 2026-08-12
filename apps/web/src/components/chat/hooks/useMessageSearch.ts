import { isFileMessageContent } from "@mushroom/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchMessageResult } from "../../../types/chat";

export type SearchFilter = "all" | "text" | "images" | "files";

interface UseMessageSearchOptions {
  onSearchMessages: (
    keyword: string,
    scope?: "current" | "all"
  ) => Promise<SearchMessageResult[]>;
  onJumpFromSearchResult: (message: SearchMessageResult) => Promise<void>;
}

export function useMessageSearch({
  onSearchMessages,
  onJumpFromSearchResult
}: UseMessageSearchOptions) {
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchFilter, setSearchFilter] = useState<SearchFilter>("all");
  const [searchResults, setSearchResults] = useState<SearchMessageResult[]>([]);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  // selectedSearchIndex 的同步镜像。useCallback 闭包里 setSelectedSearchIndex
  // 是异步提交的，连续快速按上下箭头时下次回调读到的还是上次的旧值，
  // 导致"3 个结果只能跳到 2 个"的回归。用 ref 同步更新解决。
  const selectedSearchIndexRef = useRef(0);
  useEffect(() => {
    selectedSearchIndexRef.current = selectedSearchIndex;
  }, [selectedSearchIndex]);

  const filteredSearchResults = searchResults.filter(result => {
    switch (searchFilter) {
      case "text":
        return !isFileMessageContent(result.content);
      case "images":
        return false;
      case "files":
        return isFileMessageContent(result.content);
      default:
        return true;
    }
  });

  const resetSelectedIndex = useCallback(() => {
    selectedSearchIndexRef.current = 0;
    setSelectedSearchIndex(0);
  }, []);

  const handleSearch = useCallback(async () => {
    const keyword = searchKeyword.trim();
    if (!keyword) {
      setSearchResults([]);
      resetSelectedIndex();
      return;
    }
    setIsSearching(true);
    try {
      const results = await onSearchMessages(keyword, "current");
      setSearchResults(results);
      resetSelectedIndex();
    } finally {
      setIsSearching(false);
    }
  }, [onSearchMessages, resetSelectedIndex, searchKeyword]);

  const handleJumpFromSearch = useCallback(
    async (message: SearchMessageResult, closeAfterJump = false) => {
      await onJumpFromSearchResult(message);
      if (closeAfterJump) {
        setIsSearchVisible(false);
      }
    },
    [onJumpFromSearchResult, setIsSearchVisible]
  );

  const jumpToSelectedSearchResult = useCallback(
    async (direction?: 1 | -1) => {
      if (filteredSearchResults.length === 0) {
        return;
      }

      // 始终从 ref 读取最新 index，避免闭包陈旧。
      const current = selectedSearchIndexRef.current;
      let nextIndex = current;
      if (direction === 1) {
        nextIndex = Math.min(current + 1, filteredSearchResults.length - 1);
      } else if (direction === -1) {
        nextIndex = Math.max(current - 1, 0);
      }
      if (nextIndex !== current) {
        selectedSearchIndexRef.current = nextIndex;
        setSelectedSearchIndex(nextIndex);
      }

      await onJumpFromSearchResult(filteredSearchResults[nextIndex]);
    },
    [filteredSearchResults, onJumpFromSearchResult]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setIsSearchVisible(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isSearchVisible) {
      return;
    }

    const keyword = searchKeyword.trim();
    if (!keyword) {
      setSearchResults([]);
      resetSelectedIndex();
      return;
    }

    const timer = window.setTimeout(() => {
      setIsSearching(true);
      void onSearchMessages(keyword, "current")
        .then(results => {
          setSearchResults(results);
          resetSelectedIndex();
        })
        .finally(() => {
          setIsSearching(false);
        });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [isSearchVisible, onSearchMessages, resetSelectedIndex, searchKeyword]);

  useEffect(() => {
    resetSelectedIndex();
  }, [resetSelectedIndex, searchFilter]);

  return {
    isSearchVisible,
    searchKeyword,
    isSearching,
    searchFilter,
    searchResults,
    filteredSearchResults,
    selectedSearchIndex,
    setIsSearchVisible,
    setSearchKeyword,
    setSearchFilter,
    setSelectedSearchIndex,
    setSearchResults,
    handleSearch,
    handleJumpFromSearch,
    jumpToSelectedSearchResult
  };
}
