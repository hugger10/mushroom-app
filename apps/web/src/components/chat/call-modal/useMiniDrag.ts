import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  clampMiniPosition,
  getDefaultMiniPosition,
  MINI_MARGIN,
  type MiniPosition
} from "./callModalUtils";

interface UseMiniDragArgs {
  /** Electron 独立通话窗形态：浮窗内嵌填满 OS 小窗，无 fixed 定位 / 无拖拽。 */
  isWindowMode: boolean;
  /** overlay 形态下是否处于最小化（in-window 浮窗）。 */
  isMinimized: boolean;
  miniSize: { width: number; height: number };
}

type MiniDragProps = Pick<
  React.HTMLAttributes<HTMLDivElement>,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
>;

interface UseMiniDragResult {
  miniContainerRef: React.RefObject<HTMLDivElement | null>;
  miniPos: MiniPosition | null;
  /** 新会话开始时复位位置。 */
  resetMiniPos: () => void;
  /** in-window 浮窗内联样式（window 形态返回空对象）。 */
  miniStyle: CSSProperties;
  /** 拖拽事件绑定（window 形态返回空对象，禁用拖拽）。 */
  dragProps: MiniDragProps;
}

/**
 * overlay（Web）形态下 in-window 浮窗的拖拽与视口钳位逻辑。window（Electron 独立
 * 通话窗）形态不拖拽 —— 小窗由主进程收缩 OS 窗口实现，故全部返回空 / 禁用。
 */
export function useMiniDrag({
  isWindowMode,
  isMinimized,
  miniSize
}: UseMiniDragArgs): UseMiniDragResult {
  const miniContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    size: { width: number; height: number };
  } | null>(null);
  const [miniPos, setMiniPos] = useState<MiniPosition | null>(null);

  const resetMiniPos = useCallback(() => setMiniPos(null), []);

  const handleMiniPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest("button")) {
        return;
      }
      const el = miniContainerRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      dragStateRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        size: { width: rect.width, height: rect.height }
      };
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        /* noop */
      }
      event.preventDefault();
    },
    []
  );

  const handleMiniPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }
      const next = clampMiniPosition(
        {
          x: event.clientX - state.offsetX,
          y: event.clientY - state.offsetY
        },
        state.size
      );
      setMiniPos(next);
    },
    []
  );

  const handleMiniPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }
      dragStateRef.current = null;
      const el = miniContainerRef.current;
      if (el) {
        try {
          el.releasePointerCapture(event.pointerId);
        } catch {
          /* noop */
        }
      }
    },
    []
  );

  // 窗口缩放时把浮窗钳回视口内（overlay/Web only —— window 形态由主进程缩窗）。
  useEffect(() => {
    if (isWindowMode || !isMinimized) {
      return undefined;
    }
    const handleResize = () => {
      setMiniPos(prev => (prev ? clampMiniPosition(prev, miniSize) : prev));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isWindowMode, isMinimized, miniSize]);

  useLayoutEffect(() => {
    if (!isWindowMode && isMinimized && !miniPos) {
      setMiniPos(getDefaultMiniPosition(miniSize));
    }
  }, [isWindowMode, isMinimized, miniPos, miniSize]);

  const miniStyle: CSSProperties = isWindowMode
    ? {}
    : miniPos
      ? {
          left: miniPos.x + "px",
          top: miniPos.y + "px",
          width: miniSize.width + "px"
        }
      : {
          right: MINI_MARGIN + "px",
          bottom: MINI_MARGIN + "px",
          width: miniSize.width + "px",
          visibility: "hidden"
        };

  const dragProps: MiniDragProps = isWindowMode
    ? {}
    : {
        onPointerDown: handleMiniPointerDown,
        onPointerMove: handleMiniPointerMove,
        onPointerUp: handleMiniPointerUp,
        onPointerCancel: handleMiniPointerUp
      };

  return {
    miniContainerRef,
    miniPos,
    resetMiniPos,
    miniStyle,
    dragProps
  };
}
