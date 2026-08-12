import { Avatar } from "antd";
import { TeamOutlined } from "@ant-design/icons";
import type { UserPresenceSummary } from "@mushroom/shared";
import type { Conversation } from "../../types/chat";
import { normalizeAvatarUrl } from "../../utils/display";
import { getColorFromName } from "../../utils/conv";
import { UserAvatar } from "./UserAvatar";

interface ConversationAvatarProps {
  conversation: Conversation;
  size?: number;
  className?: string;
  /**
   * Presence summary of the peer when conversation.type === 1 (direct).
   * Group conversations (type === 2) ignore this prop.
   */
  peerPresence?: UserPresenceSummary | null;
}

export function ConversationAvatar({
  conversation,
  size = 44,
  className,
  peerPresence
}: ConversationAvatarProps) {
  const displayName = conversation.display_name || conversation.name;
  const conversationAvatar = normalizeAvatarUrl(
    conversation.display_avatar || conversation.avatar_url
  );

  const isDirect = conversation.type === 1;

  if (conversation.type !== 2 || conversationAvatar) {
    return (
      <UserAvatar
        className={className}
        size={size}
        src={conversationAvatar}
        name={displayName}
        peerPresence={isDirect ? (peerPresence ?? null) : null}
      />
    );
  }

  // Group conversation without a custom avatar: show a group icon with a
  // deterministic random color seeded by the conversation id (stable across
  // renames). Mirrors the fallback strategy used for user avatars.
  const seed =
    conversation.client_conversation_id ||
    conversation.server_conversation_id ||
    displayName ||
    "group";
  const backgroundColor = getColorFromName(String(seed));

  return (
    <Avatar
      size={size}
      shape="circle"
      className={className}
      style={{ backgroundColor, color: "#fff" }}
      icon={<TeamOutlined />}
      aria-label={displayName}
    />
  );
}
