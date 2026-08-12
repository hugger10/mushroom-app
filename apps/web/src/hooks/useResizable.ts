import { useCallback, useRef } from "react";

interface UseResizableOptions {
  minWidth: number;
  maxWidth?: number;
}

export function useResizable(options: UseResizableOptions) {
  const { minWidth, maxWidth = 600 } = options;
  const ref = useRef<HTMLElement | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = ref.current;
      if (!el) return;

      startXRef.current = e.clientX;
      startWidthRef.current = el.getBoundingClientRect().width;

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const handle = e.target as HTMLElement;
      handle.classList.add("dragging");

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startXRef.current;
        const newWidth = Math.min(
          maxWidth,
          Math.max(minWidth, startWidthRef.current + delta)
        );
        el.style.setProperty("--sidebar-width", `${newWidth}px`);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        handle.classList.remove("dragging");
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [minWidth, maxWidth]
  );

  return { resizableRef: ref, onResizeMouseDown: onMouseDown };
}
