import {
  isSystemMessageContent,
  type Conversation,
  type ContactListItem,
  type LoginUser,
  type MergedForwardItem,
  type Message
} from "@mushroom/shared";
import { i18n } from "../i18n";

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function buildContactMap(contacts: ContactListItem[]) {
  return new Map(contacts.map(contact => [Number(contact.user_id), contact]));
}

function getContactRemarkName(contact?: ContactListItem) {
  return contact?.remark_name ?? undefined;
}

function getConversationPeerMember(
  conversation: Conversation,
  currentUserId?: number | null
) {
  return conversation.members?.find(
    member => Number(member.user_id) !== Number(currentUserId)
  );
}

export function normalizeOnlineFlag(value: unknown) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "TRUE"
  );
}

export function applyConversationDisplayFallbacks(options: {
  conversations: Conversation[];
  contacts: ContactListItem[];
  loginUser?: LoginUser | null;
}) {
  const contactMap = buildContactMap(options.contacts);

  return options.conversations.map(conversation => {
    if (conversation.type !== 1) {
      const senderId = conversation.last_message_send_id;
      if (senderId) {
        const contact = contactMap.get(Number(senderId));
        const member = conversation.members?.find(
          m => Number(m.user_id) === Number(senderId)
        );
        const senderName = firstNonEmpty(
          getContactRemarkName(contact),
          contact?.nickname,
          contact?.username,
          member?.nickname
        );
        if (senderName) {
          return {
            ...conversation,
            last_message_sender_display_name: senderName
          };
        }
      }
      return conversation;
    }

    const otherMember = getConversationPeerMember(
      conversation,
      options.loginUser?.userId
    );
    const effectivePeerId =
      otherMember?.user_id != null ? otherMember.user_id : conversation.peer_id;
    const contact = effectivePeerId
      ? contactMap.get(Number(effectivePeerId))
      : undefined;
    const displayName =
      firstNonEmpty(
        getContactRemarkName(contact),
        contact?.nickname,
        contact?.username,
        otherMember?.nickname,
        conversation.display_name,
        conversation.name
      ) ||
      (effectivePeerId
        ? i18n.t("display.unknownUser", { id: effectivePeerId })
        : i18n.t("display.contact"));
    const displayAvatar = firstNonEmpty(
      contact?.avatar_url,
      otherMember?.avatar_url,
      conversation.display_avatar,
      conversation.avatar_url
    );

    return {
      ...conversation,
      peer_id: effectivePeerId,
      display_name: displayName,
      display_avatar: displayAvatar,
      name: displayName
    };
  });
}

export function getConversationDisplayName(conversation: Conversation) {
  return (
    firstNonEmpty(conversation.display_name, conversation.name) ||
    i18n.t("display.untitledConversation")
  );
}

export function getConversationDisplayAvatar(conversation: Conversation) {
  return firstNonEmpty(conversation.display_avatar, conversation.avatar_url);
}

/**
 * Stable seed for picking the random background color of a group conversation
 * avatar (no custom image). Prefer the server conversation id so the color
 * stays consistent across reinstalls; fall back gracefully.
 */
export function getConversationAvatarSeed(conversation: Conversation): string {
  return (
    firstNonEmpty(
      conversation.server_conversation_id,
      conversation.client_conversation_id,
      conversation.display_name,
      conversation.name
    ) || "group"
  );
}

export function getMessageSenderDisplayName(options: {
  message: Message;
  conversation: Conversation;
  contacts?: ContactListItem[];
  loginUser?: LoginUser | null;
}) {
  const { message, conversation, loginUser } = options;
  const contactMap = buildContactMap(options.contacts ?? []);

  if (loginUser && Number(message.sender_id) === Number(loginUser.userId)) {
    return (
      firstNonEmpty(loginUser.nickname, loginUser.username) ||
      i18n.t("display.unknownUser", { id: message.sender_id })
    );
  }

  if (conversation.type === 1) {
    const otherMember = getConversationPeerMember(
      conversation,
      loginUser?.userId
    );
    const effectivePeerId =
      otherMember?.user_id != null ? otherMember.user_id : conversation.peer_id;
    const contact = effectivePeerId
      ? contactMap.get(Number(effectivePeerId))
      : undefined;

    return (
      firstNonEmpty(
        getContactRemarkName(contact),
        contact?.nickname,
        contact?.username,
        message.sender_nickname,
        otherMember?.nickname,
        conversation.display_name,
        conversation.name
      ) || i18n.t("display.unknownUser", { id: message.sender_id })
    );
  }

  const member = conversation.members?.find(
    item => Number(item.user_id) === Number(message.sender_id)
  );
  const contact = contactMap.get(Number(message.sender_id));

  return (
    firstNonEmpty(
      getContactRemarkName(contact),
      contact?.nickname,
      contact?.username,
      message.sender_nickname,
      member?.nickname
    ) || i18n.t("display.unknownUser", { id: message.sender_id })
  );
}

export function getMessageSenderAvatar(options: {
  message: Message;
  conversation: Conversation;
  contacts?: ContactListItem[];
  loginUser?: LoginUser | null;
}) {
  const { message, conversation, loginUser } = options;
  const contactMap = buildContactMap(options.contacts ?? []);

  if (loginUser && Number(message.sender_id) === Number(loginUser.userId)) {
    return firstNonEmpty(loginUser.avatar, message.sender_avatar);
  }

  if (conversation.type === 1) {
    const otherMember = getConversationPeerMember(
      conversation,
      loginUser?.userId
    );
    const effectivePeerId =
      otherMember?.user_id != null ? otherMember.user_id : conversation.peer_id;
    const contact = effectivePeerId
      ? contactMap.get(Number(effectivePeerId))
      : undefined;

    return firstNonEmpty(
      message.sender_avatar,
      contact?.avatar_url,
      otherMember?.avatar_url,
      conversation.display_avatar,
      conversation.avatar_url
    );
  }

  const member = conversation.members?.find(
    item => Number(item.user_id) === Number(message.sender_id)
  );
  const contact = contactMap.get(Number(message.sender_id));

  return firstNonEmpty(
    message.sender_avatar,
    member?.avatar_url,
    contact?.avatar_url
  );
}

export function isSystemTimelineMessage(
  message: Pick<Message, "type" | "content">
) {
  return (
    Number(message.type || 0) === 0 || isSystemMessageContent(message.content)
  );
}

/**
 * Resolves the sender display name for an item inside a merged-forward
 * payload, preferring the recipient's local contact remark over the
 * snapshot nickname captured at forward time.
 *
 *   contact.remark_name → contact.nickname → contact.username
 *     → item.sender_nickname (snapshot) → "用户 {sender_id}"
 *
 * Legacy payloads without `sender_id` (forwarded before sender_id was
 * persisted) cannot resolve a contact and fall through to the snapshot
 * nickname — clear the local DB if you need them to pick up remarks.
 *
 * Kept in sync with `apps/web/src/utils/display.ts#getForwardItemDisplayName`.
 */
export function getForwardItemDisplayName(options: {
  item: Pick<MergedForwardItem, "sender_id" | "sender_nickname">;
  contacts?: ContactListItem[];
  loginUser?: LoginUser | null;
}) {
  const { item, contacts, loginUser } = options;

  if (loginUser && Number(item.sender_id) === Number(loginUser.userId)) {
    return (
      firstNonEmpty(loginUser.nickname, loginUser.username) ||
      item.sender_nickname ||
      i18n.t("display.unknownUser", { id: item.sender_id })
    );
  }

  const contactMap = buildContactMap(contacts ?? []);
  const contact = item.sender_id
    ? contactMap.get(Number(item.sender_id))
    : undefined;

  return (
    firstNonEmpty(
      getContactRemarkName(contact),
      contact?.nickname,
      contact?.username,
      item.sender_nickname
    ) ||
    (item.sender_id
      ? i18n.t("display.unknownUser", { id: item.sender_id })
      : i18n.t("display.unknownMember"))
  );
}

/**
 * Recomputes the merged-forward card title using the recipient's local
 * contact data so that remarks take precedence over the snapshot title
 * baked in by the forwarder.
 *
 *   ≤ 2 distinct participants → `${nameA}和${nameB}的聊天记录`
 *   > 2 distinct participants → "群聊的聊天记录"
 *
 * Falls back to `fallbackTitle` when the payload has no resolvable
 * participants (legacy data without sender_id).
 */
export function getForwardCardTitle(options: {
  items: ReadonlyArray<
    Pick<MergedForwardItem, "sender_id" | "sender_nickname">
  >;
  fallbackTitle: string;
  contacts?: ContactListItem[];
  loginUser?: LoginUser | null;
}) {
  const { items, fallbackTitle, contacts, loginUser } = options;
  if (!items || items.length === 0) return fallbackTitle;

  const names: string[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    const id = Number(item.sender_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    names.push(getForwardItemDisplayName({ item, contacts, loginUser }));
  }

  if (names.length === 0) return fallbackTitle;
  if (names.length <= 2) {
    return i18n.t("display.forwardTitleTwo", {
      nameA: names[0],
      nameB: names[1]
    });
  }
  return i18n.t("display.forwardTitleGroup");
}
