import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent
} from "react";
import type { Message } from "../../../types/chat";

export function useImagePreview() {
  const [previewImageItems, setPreviewImageItems] = useState<Message[]>([]);
  const [previewImageIndex, setPreviewImageIndex] = useState<number | null>(
    null
  );
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 });
  const previewDragStateRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const previewImage =
    previewImageIndex !== null ? previewImageItems[previewImageIndex] : null;
  const canPreviewPrev = previewImageIndex !== null && previewImageIndex > 0;
  const canPreviewNext =
    previewImageIndex !== null &&
    previewImageIndex < previewImageItems.length - 1;

  const closePreview = useCallback(() => {
    setPreviewImageIndex(null);
    setPreviewImageItems([]);
    setPreviewZoom(1);
    setPreviewOffset({ x: 0, y: 0 });
  }, []);

  const openImagePreview = useCallback((images: Message[], index: number) => {
    setPreviewImageItems(images);
    setPreviewImageIndex(index);
  }, []);

  const showPrevPreview = useCallback(() => {
    setPreviewImageIndex(prev => {
      if (prev === null || prev <= 0) {
        return prev;
      }
      return prev - 1;
    });
    setPreviewZoom(1);
    setPreviewOffset({ x: 0, y: 0 });
  }, []);

  const showNextPreview = useCallback(() => {
    setPreviewImageIndex(prev => {
      if (prev === null || prev >= previewImageItems.length - 1) {
        return prev;
      }
      return prev + 1;
    });
    setPreviewZoom(1);
    setPreviewOffset({ x: 0, y: 0 });
  }, [previewImageItems.length]);

  const handlePreviewWheel = useCallback(
    (event: WheelEvent) => {
      if (!previewImage) {
        return;
      }
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.1 : -0.1;
      setPreviewZoom(prev =>
        Math.min(3, Math.max(0.5, Number((prev + delta).toFixed(2))))
      );
    },
    [previewImage]
  );

  const handlePreviewPointerDown = useCallback(
    (event: PointerEvent<HTMLImageElement>) => {
      if (previewZoom <= 1) {
        return;
      }

      previewDragStateRef.current = {
        dragging: true,
        startX: event.clientX,
        startY: event.clientY,
        originX: previewOffset.x,
        originY: previewOffset.y
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [previewOffset.x, previewOffset.y, previewZoom]
  );

  const handlePreviewPointerMove = useCallback(
    (event: PointerEvent<HTMLImageElement>) => {
      const dragState = previewDragStateRef.current;
      if (!dragState?.dragging || previewZoom <= 1) {
        return;
      }

      setPreviewOffset({
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY)
      });
    },
    [previewZoom]
  );

  const handlePreviewPointerUp = useCallback(
    (event: PointerEvent<HTMLImageElement>) => {
      previewDragStateRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    []
  );

  useEffect(() => {
    if (previewImageIndex === null) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePreview();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrevPreview();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNextPreview();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setPreviewZoom(prev => Math.min(Number((prev + 0.25).toFixed(2)), 3));
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        setPreviewZoom(prev => Math.max(Number((prev - 0.25).toFixed(2)), 0.5));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closePreview, previewImageIndex, showNextPreview, showPrevPreview]);

  useEffect(() => {
    if (previewZoom <= 1) {
      setPreviewOffset({ x: 0, y: 0 });
    }
  }, [previewZoom]);

  return {
    previewImage,
    previewImageItems,
    previewImageIndex,
    previewZoom,
    previewOffset,
    canPreviewPrev,
    canPreviewNext,
    setPreviewZoom,
    openImagePreview,
    closePreview,
    showPrevPreview,
    showNextPreview,
    handlePreviewWheel,
    handlePreviewPointerDown,
    handlePreviewPointerMove,
    handlePreviewPointerUp
  };
}
