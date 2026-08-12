import { useCallback, useEffect, useRef, useState } from "react";

interface UseMessageViewportOptions {
  activeConversationId?: string;
  isLoadingMore: boolean;
  hasMore: boolean;
  messageCount: number;
  loadMoreMessages: (clientConversationId: string) => Promise<void>;
}

export function useMessageViewport({
  activeConversationId,
  isLoadingMore,
  hasMore,
  messageCount,
  loadMoreMessages
}: UseMessageViewportOptions) {
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(
    null
  );
  const [pendingFocusMessageId, setPendingFocusMessageIdRaw] = useState<
    string | null
  >(null);
  // 每次外部请求聚焦时递增；effect 用 [id, nonce] 作为依赖，
  // 保证连续点击/边界点击（id 相同）也能重新触发滚动定位。
  const [pendingFocusNonce, setPendingFocusNonce] = useState(0);
  const setPendingFocusMessageId = useCallback((id: string | null) => {
    setPendingFocusMessageIdRaw(id);
    if (id !== null) {
      setPendingFocusNonce(n => n + 1);
    }
  }, []);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const loadingRef = useRef(false);
  const isUserAtBottomRef = useRef(true);
  const initialOpenRef = useRef(false);
  const skipObserverRef = useRef(false);
  const lastLoadTimeRef = useRef(0);
  // 处于"搜索结果跳转 → 等待目标 DOM 出现并滚动"窗口内时为 true。
  // 用于阻断自动贴底 / ResizeObserver 兜底贴底，避免抢占搜索定位滚动。
  const isFocusingRef = useRef(false);

  const instantScrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
    isUserAtBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, []);

  useEffect(() => {
    loadingRef.current = isLoadingMore;
  }, [isLoadingMore]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!activeConversationId || !container) {
      return;
    }

    instantScrollToBottom();
    initialOpenRef.current = true;
    skipObserverRef.current = true;

    // skipObserverRef：仅用于抑制顶部哨兵在打开瞬间被滚动惯性误触发
    // loadMore 的假阳。保持原始 300ms 即可——若用户主动在 0.3s 内
    // 滚到顶部，应当正常触发加载历史。
    const skipTimer = window.setTimeout(() => {
      skipObserverRef.current = false;
    }, 300);

    // initialOpenRef：贴底意图窗口。图片/视频等异步资源在解码完成后
    // 通过 ResizeObserver 触发"强制贴底"，慢网下需要较长窗口
    // （1500ms）覆盖 disk cache / 慢响应。
    const stickTimer = window.setTimeout(() => {
      initialOpenRef.current = false;
    }, 1500);

    return () => {
      clearTimeout(skipTimer);
      clearTimeout(stickTimer);
    };
  }, [activeConversationId, instantScrollToBottom]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    if (initialOpenRef.current) {
      instantScrollToBottom();
      initialOpenRef.current = false;
      return;
    }

    // 正在执行"搜索结果定位"，跳过自动贴底，避免把视口拉回最底导致
    // 看不到搜索命中的消息。
    if (pendingFocusMessageId || isFocusingRef.current) {
      return;
    }

    if (isUserAtBottomRef.current) {
      scrollToBottom();
    }
  }, [
    instantScrollToBottom,
    messageCount,
    pendingFocusMessageId,
    scrollToBottom
  ]);

  useEffect(() => {
    if (!pendingFocusMessageId) {
      return;
    }

    // 跨页跳转（重新加载 ±N 条上下文 + 图片/附件 reflow）后，目标 DOM 可能
    // 在几十到几百毫秒后才出现，单次 setTimeout 极易拿不到。改为：
    //   1) rAF 轮询查找（覆盖 React 提交后的下一帧）
    //   2) 同时挂 MutationObserver，DOM 子树变化立即尝试一次
    //   3) 超时上限 3000ms（覆盖慢网下的 IPC + 重排）
    // 找到立即 scrollIntoView({behavior:"auto"}) + 设置 highlight。
    isFocusingRef.current = true;
    const targetId = pendingFocusMessageId;
    const startTs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const TIMEOUT_MS = 3000;
    let rafHandle = 0;
    let cancelled = false;
    let mo: MutationObserver | null = null;

    const finish = () => {
      cancelled = true;
      if (rafHandle !== 0) {
        window.cancelAnimationFrame(rafHandle);
        rafHandle = 0;
      }
      if (mo) {
        mo.disconnect();
        mo = null;
      }
      isFocusingRef.current = false;
    };

    const tryScroll = () => {
      if (cancelled) return;
      const container = messagesContainerRef.current;
      const target = container?.querySelector<HTMLElement>(
        `[data-message-id="${targetId}"]`
      );
      if (target) {
        // 瞬时滚动，避免平滑动画与命中后 reflow 叠加造成抖动；
        // 高亮仅靠 .im-message-row-highlighted 背景色区分。
        target.scrollIntoView({ block: "center", behavior: "auto" });
        setHighlightMessageId(targetId);
        setPendingFocusMessageIdRaw(current =>
          current === targetId ? null : current
        );
        if (highlightTimerRef.current) {
          window.clearTimeout(highlightTimerRef.current);
        }
        highlightTimerRef.current = window.setTimeout(() => {
          setHighlightMessageId(current =>
            current === targetId ? null : current
          );
          highlightTimerRef.current = null;
        }, 1500);
        finish();
        return;
      }

      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - startTs >= TIMEOUT_MS) {
        // 超时仍未找到：清理 pending，防止下次同 id 跳转因 setState 短路而失效。
        setPendingFocusMessageIdRaw(current =>
          current === targetId ? null : current
        );
        finish();
        return;
      }
      rafHandle = window.requestAnimationFrame(tryScroll);
    };

    const container = messagesContainerRef.current;
    if (container && typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(() => {
        if (cancelled) return;
        // DOM 一旦变化（例如 setMessages 提交、图片加载完成插入节点）
        // 立即尝试一次，不必等 rAF 回调。
        tryScroll();
      });
      mo.observe(container, { childList: true, subtree: true });
    }

    rafHandle = window.requestAnimationFrame(tryScroll);

    return () => {
      finish();
    };
  }, [pendingFocusMessageId, pendingFocusNonce]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !activeConversationId ||
      !topSentinelRef.current ||
      !messagesContainerRef.current ||
      !hasMore
    ) {
      return;
    }

    const handleLoadMore = async () => {
      if (loadingRef.current || !hasMore) {
        return;
      }

      const now = Date.now();
      if (now - lastLoadTimeRef.current < 700) {
        return;
      }
      lastLoadTimeRef.current = now;

      const container = messagesContainerRef.current;
      if (!container) {
        return;
      }

      const prevScrollHeight = container.scrollHeight;
      loadingRef.current = true;

      try {
        await loadMoreMessages(activeConversationId);

        requestAnimationFrame(() => {
          setTimeout(() => {
            const newScrollHeight = container.scrollHeight;
            const delta = newScrollHeight - prevScrollHeight;
            container.scrollTop = (container.scrollTop || 0) + delta;
          }, 0);
        });
      } catch (error) {
        console.error("loadMoreMessages error:", error);
      } finally {
        loadingRef.current = false;
      }
    };

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      entries => {
        const [entry] = entries;
        if (entry.isIntersecting && !skipObserverRef.current) {
          void handleLoadMore();
        }
      },
      {
        root: messagesContainerRef.current,
        rootMargin: "20px",
        threshold: 0.1
      }
    );

    observerRef.current.observe(topSentinelRef.current);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [activeConversationId, hasMore, loadMoreMessages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const onScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const atBottom = distanceFromBottom <= 50;
      isUserAtBottomRef.current = atBottom;
      setShowScrollToBottom(!atBottom);
    };

    container.addEventListener("scroll", onScroll);
    onScroll();

    return () => {
      container.removeEventListener("scroll", onScroll);
    };
  }, [activeConversationId, messageCount]);

  // ResizeObserver 兜底：图片 / 视频 / 富链接卡片等子节点在异步资源
  // 解码完成后会撑高自身。此时如果用户位于底部（或处于初始打开的贴底窗口），
  // 必须重新把视口拉回最底，否则会出现"图片露一截"的回归（见 bug 描述）。
  //
  // 实现：用一个 ResizeObserver 观察滚动容器的所有直接子节点，并用一个
  // MutationObserver 在子节点增删时同步增删观察对象。命中后通过 RAF
  // 节流并比对 scrollHeight 是否增长，再按需 instantScrollToBottom。
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }
    if (
      typeof ResizeObserver === "undefined" ||
      typeof MutationObserver === "undefined"
    ) {
      return;
    }

    let lastScrollHeight = container.scrollHeight;
    let rafId = 0;

    const maybeStick = () => {
      rafId = 0;
      const el = messagesContainerRef.current;
      if (!el) return;
      const next = el.scrollHeight;
      if (next <= lastScrollHeight) {
        lastScrollHeight = next;
        return;
      }
      lastScrollHeight = next;
      // isFocusingRef 在搜索结果定位窗口内为 true；此时禁止贴底兜底，
      // 避免抢占 scrollIntoView。
      if (
        !isFocusingRef.current &&
        (initialOpenRef.current || isUserAtBottomRef.current)
      ) {
        // 直接复用 instantScrollToBottom 的副作用（贴底 + 重置 UI flag）。
        el.scrollTop = el.scrollHeight;
        isUserAtBottomRef.current = true;
        setShowScrollToBottom(false);
      }
    };

    const schedule = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(maybeStick);
    };

    const ro = new ResizeObserver(() => {
      schedule();
    });

    const observed = new Set<Element>();
    const observeChild = (node: Element) => {
      if (observed.has(node)) return;
      observed.add(node);
      ro.observe(node);
    };
    const unobserveChild = (node: Element) => {
      if (!observed.has(node)) return;
      observed.delete(node);
      ro.unobserve(node);
    };

    for (const child of Array.from(container.children)) {
      observeChild(child);
    }

    const mo = new MutationObserver(records => {
      for (const r of records) {
        r.addedNodes.forEach(n => {
          if (n.nodeType === 1) observeChild(n as Element);
        });
        r.removedNodes.forEach(n => {
          if (n.nodeType === 1) unobserveChild(n as Element);
        });
      }
      schedule();
    });
    mo.observe(container, { childList: true });

    return () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
      mo.disconnect();
      ro.disconnect();
      observed.clear();
    };
  }, [activeConversationId]);

  return {
    highlightMessageId,
    pendingFocusMessageId,
    showScrollToBottom,
    messagesEndRef,
    messagesContainerRef,
    topSentinelRef,
    instantScrollToBottom,
    scrollToBottom,
    setPendingFocusMessageId
  };
}
