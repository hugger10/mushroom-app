import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import { Modal } from "antd";
import {
  CloseOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined
} from "@ant-design/icons";
import { UserAvatar } from "./UserAvatar";
import { useTranslation } from "react-i18next";

export interface AvatarLightboxProps {
  open: boolean;
  src?: string | null;
  name?: string | null;
  onClose: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
const IMAGE_SIZE = 320;

function clampOffset(
  next: { x: number; y: number },
  zoom: number,
  stage: DOMRect | null
): { x: number; y: number } {
  if (!stage) return next;
  const renderedW = IMAGE_SIZE * zoom;
  const renderedH = IMAGE_SIZE * zoom;
  const maxX = Math.max(0, (renderedW - stage.width) / 2);
  const maxY = Math.max(0, (renderedH - stage.height) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, next.x)),
    y: Math.min(maxY, Math.max(-maxY, next.y))
  };
}

function roundZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(3))));
}

/**
 * WhatsApp-style avatar viewer. Black backdrop, click outside to close,
 * mouse wheel to zoom (anchored to pointer), drag to pan when zoomed in.
 */
export function AvatarLightbox({
  open,
  src,
  name,
  onClose
}: AvatarLightboxProps) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  // Reset transform whenever the modal opens or the src changes.
  useEffect(() => {
    if (open) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setDragging(false);
    }
  }, [open, src]);

  // Wheel zoom (non-passive listener so we can preventDefault). The new offset
  // is computed so the pixel under the pointer stays anchored across the zoom.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !open) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const stage = el.getBoundingClientRect();
      const pointer = {
        x: event.clientX - (stage.left + stage.width / 2),
        y: event.clientY - (stage.top + stage.height / 2)
      };
      setZoom(prevZoom => {
        const nextZoom = roundZoom(
          prevZoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)
        );
        if (nextZoom === prevZoom) return prevZoom;
        const ratio = nextZoom / prevZoom;
        setOffset(prevOffset =>
          clampOffset(
            {
              x: pointer.x * (1 - ratio) + prevOffset.x * ratio,
              y: pointer.y * (1 - ratio) + prevOffset.y * ratio
            },
            nextZoom,
            stage
          )
        );
        return nextZoom;
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
    };
  }, [open]);

  // Esc closes (Modal already handles this, but keep zoom-reset behaviour
  // explicit if other keys land here later).
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [open, onClose]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (zoom <= 1) return;
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      draggingRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: offset.x,
        originY: offset.y
      };
      setDragging(true);
    },
    [offset.x, offset.y, zoom]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = draggingRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const stage = stageRef.current?.getBoundingClientRect() ?? null;
      setOffset(
        clampOffset(
          {
            x: drag.originX + (event.clientX - drag.startX),
            y: drag.originY + (event.clientY - drag.startY)
          },
          zoom,
          stage
        )
      );
    },
    [zoom]
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = draggingRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const target = event.currentTarget;
      try {
        target.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      draggingRef.current = null;
      setDragging(false);
    },
    []
  );

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      const next = roundZoom(prev - ZOOM_STEP);
      if (next === prev) return prev;
      const stage = stageRef.current?.getBoundingClientRect() ?? null;
      setOffset(prevOffset => clampOffset(prevOffset, next, stage));
      return next;
    });
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => {
      const next = roundZoom(prev + ZOOM_STEP);
      if (next === prev) return prev;
      const stage = stageRef.current?.getBoundingClientRect() ?? null;
      setOffset(prevOffset => clampOffset(prevOffset, next, stage));
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const displayName = name ?? "";
  const canvasClassName = [
    "im-avatar-lightbox-canvas",
    zoom > 1 ? "is-pannable" : "",
    dragging ? "is-grabbing" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Modal
      className="im-modal im-avatar-lightbox-modal"
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      closable={false}
      destroyOnHidden
      width="100vw"
      style={{ top: 0, padding: 0, maxWidth: "100vw" }}
      styles={{ mask: { backgroundColor: "rgba(0, 0, 0, 0.92)" } }}
    >
      <div className="im-avatar-lightbox">
        <div className="im-avatar-lightbox-toolbar">
          <span
            className="im-avatar-lightbox-name"
            title={displayName || undefined}
          >
            {displayName}
          </span>
          <div className="im-avatar-lightbox-actions">
            <button
              type="button"
              className="im-avatar-lightbox-action"
              onClick={handleZoomOut}
              aria-label={t("chat.zoomOut")}
              title={t("chat.zoomOut")}
            >
              <ZoomOutOutlined />
            </button>
            <span className="im-avatar-lightbox-zoom">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="im-avatar-lightbox-action"
              onClick={handleZoomIn}
              aria-label={t("chat.zoomIn")}
              title={t("chat.zoomIn")}
            >
              <ZoomInOutlined />
            </button>
            <button
              type="button"
              className="im-avatar-lightbox-action"
              onClick={handleReset}
              aria-label={t("chat.zoomReset")}
              title={t("chat.zoomReset")}
            >
              <UndoOutlined />
            </button>
            <span className="im-avatar-lightbox-divider" />
            <button
              type="button"
              className="im-avatar-lightbox-action im-avatar-lightbox-close"
              onClick={onClose}
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <CloseOutlined />
            </button>
          </div>
        </div>

        <div
          ref={stageRef}
          className="im-avatar-lightbox-stage"
          onClick={event => {
            // 仅当点击的是舞台空白处（不是头像本体）时才关闭。
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
        >
          <div
            className={canvasClassName}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <UserAvatar
              size={IMAGE_SIZE}
              src={src ?? undefined}
              name={displayName}
              style={{ borderRadius: "50%" }}
              draggable={false}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
