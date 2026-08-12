import type { CSSProperties } from "react";
import type { PresenceLevel } from "@mushroom/shared";
import { useTranslation } from "react-i18next";

interface PresenceDotProps {
  level: PresenceLevel;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Avatar online-status indicator (web).
 *
 * Renders a small accent dot when the user is online or recently active,
 * and renders nothing when offline. The caller is responsible for placing
 * this component (typically absolutely positioned over the avatar's
 * bottom-right corner).
 */
export function PresenceDot({
  level,
  size = 10,
  className,
  style
}: PresenceDotProps) {
  const { t } = useTranslation();
  if (level === "offline") {
    return null;
  }

  const variantClass =
    level === "online" ? "im-presence-dot--online" : "im-presence-dot--recent";

  return (
    <span
      aria-label={
        level === "online" ? t("chatDetail.online") : t("ui.recentlyActive")
      }
      className={`im-presence-dot ${variantClass} ${className || ""}`.trim()}
      style={{
        width: size,
        height: size,
        ...style
      }}
    />
  );
}
