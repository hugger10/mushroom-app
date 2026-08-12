import { Avatar, type AvatarProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import {
  resolvePresenceLevel,
  type UserPresenceSummary
} from "@mushroom/shared";
import { normalizeAvatarUrl } from "../../utils/display";
import { getColorFromName } from "../../utils/conv";
import { usePresenceTick } from "../../hooks/usePresenceTick";
import { PresenceDot } from "./PresenceDot";

type UserAvatarProps = Omit<AvatarProps, "src" | "children"> & {
  name?: string | null;
  src?: string | null;
  fallback?: string;
  /**
   * Optional presence summary. When provided, an online-status indicator
   * (decorative ring + dot) is rendered on top of the avatar.
   */
  peerPresence?: UserPresenceSummary | null;
};

export function UserAvatar({
  name,
  src,
  fallback = "U",
  style,
  peerPresence,
  className,
  size,
  ...props
}: UserAvatarProps) {
  const normalizedName = String(name || "").trim();
  const normalizedSrc = normalizeAvatarUrl(src);
  const [imageSrc, setImageSrc] = useState(normalizedSrc);

  useEffect(() => {
    setImageSrc(normalizedSrc);
  }, [normalizedSrc]);

  const fallbackText = normalizedName.charAt(0).toUpperCase() || fallback;

  // Subscribe to a low-frequency ticker so that presence levels can decay
  // (online -> recent -> offline) even when the upstream presence object
  // reference does not change. Always called to keep hook order stable;
  // the underlying interval is shared module-wide and inexpensive.
  const presenceTick = usePresenceTick();

  const presenceLevel = useMemo(() => {
    if (!peerPresence) {
      return "offline" as const;
    }
    return resolvePresenceLevel(
      peerPresence.is_online,
      peerPresence.last_active_at ?? null
    );
    // presenceTick is intentionally part of the dep list to drive time-based
    // re-evaluation; resolvePresenceLevel reads Date.now() internally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerPresence, presenceTick]);

  const avatarNode = (
    <Avatar
      {...props}
      size={size}
      className={className}
      src={imageSrc}
      style={{
        backgroundColor: imageSrc
          ? style?.backgroundColor
          : getColorFromName(normalizedName || fallback),
        ...style
      }}
      onError={() => {
        setImageSrc(undefined);
        return false;
      }}
    >
      {!imageSrc ? fallbackText : null}
    </Avatar>
  );

  if (!peerPresence) {
    return avatarNode;
  }

  const ringClass =
    presenceLevel === "online"
      ? "im-presence-avatar-wrap--online"
      : presenceLevel === "recent"
        ? "im-presence-avatar-wrap--recent"
        : "";

  // Compute dot size based on numeric avatar size when possible
  const numericSize = typeof size === "number" ? size : undefined;
  const dotSize =
    numericSize !== undefined
      ? Math.max(8, Math.round(numericSize * 0.26))
      : 10;

  return (
    <span className={`im-presence-avatar-wrap ${ringClass}`.trim()}>
      {avatarNode}
      <PresenceDot level={presenceLevel} size={dotSize} />
    </span>
  );
}
