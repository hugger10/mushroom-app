import type { MergedForwardItem } from "@mushroom/shared";
import type { Conversation, Message } from "../types/chat";
import type { ContactListItem, LoginUser } from "../types/user";
import { i18n } from "../i18n";

/**
 * Display-name resolution priority (must stay in sync with
 * `apps/mobile/src/utils/display.ts`):
 *
 *   contact.remark_name
 *     → contact.nickname
 *     → contact.username
 *     → fallbackNickname (e.g. msg.sender_nickname)
 *     → member.nickname (group-member snapshot)
 *     → conversation.display_name / conversation.name (private chat)
 *     → defaultLabel
 *     → "Unknown member"
 *
 * `contacts` is the caller-supplied local contact list; without it we cannot
 * resolve `remark_name` and will fall through to the snapshot fields.
 */

export type ContactsLookup =
  | ContactListItem[]
  | Map<number, ContactListItem>
  | null
  | undefined;

export function normalizeAvatarUrl(src?: string | null) {
  const normalized = String(src || "").trim();
  return normalized || undefined;
}

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

function resolveContact(
  userId: number,
  contacts?: ContactsLookup
): ContactListItem | undefined {
  if (!contacts || !userId) return undefined;
  if (contacts instanceof Map) {
    return contacts.get(Number(userId));
  }
  return contacts.find(item => Number(item.user_id) === Number(userId));
}

export function getUserDisplayName(options: {
  userId: number;
  loginUser?: LoginUser | null;
  conversation?: Conversation | null;
  contacts?: ContactsLookup;
  fallbackNickname?: string | null;
  defaultLabel?: string;
}) {
  const {
    userId,
    loginUser,
    conversation,
    contacts,
    fallbackNickname,
    defaultLabel
  } = options;

  if (loginUser && userId === loginUser.userId) {
    return (
      firstNonEmpty(loginUser.nickname, loginUser.username) ||
      defaultLabel ||
      i18n.t("display.unknownMember")
    );
  }

  const contact = resolveContact(userId, contacts);
  const member = conversation?.members?.find(item => item.user_id === userId);

  if (conversation?.type === 1) {
    return (
      firstNonEmpty(
        contact?.remark_name,
        contact?.nickname,
        contact?.username,
        fallbackNickname,
        member?.nickname,
        conversation.display_name,
        conversation.name
      ) ||
      defaultLabel ||
      i18n.t("display.unknownMember")
    );
  }

  return (
    firstNonEmpty(
      contact?.remark_name,
      contact?.nickname,
      contact?.username,
      fallbackNickname,
      member?.nickname
    ) ||
    defaultLabel ||
    i18n.t("display.unknownMember")
  );
}

export function getMessageDisplayName(options: {
  message: Message;
  conversation?: Conversation | null;
  loginUser?: LoginUser | null;
  contacts?: ContactsLookup;
  defaultLabel?: string;
}) {
  const { message, conversation, loginUser, contacts, defaultLabel } = options;
  return getUserDisplayName({
    userId: message.sender_id,
    loginUser,
    conversation,
    contacts,
    fallbackNickname: message.sender_nickname,
    defaultLabel
  });
}

export function getConversationUserDisplayName(
  conversation: Conversation | null,
  loginUser: LoginUser,
  userId: number,
  fallbackNickname?: string,
  contacts?: ContactsLookup
) {
  return getUserDisplayName({
    userId,
    loginUser,
    conversation,
    contacts,
    fallbackNickname
  });
}

export function getMessageSenderDisplayName(
  conversation: Conversation,
  loginUser: LoginUser,
  message: Message,
  contacts?: ContactsLookup
) {
  return getMessageDisplayName({
    message,
    conversation,
    loginUser,
    contacts
  });
}

export function getConversationSenderDisplayName(
  conversation: Conversation,
  loginUser?: LoginUser | null,
  contacts?: ContactsLookup
) {
  return getUserDisplayName({
    userId: Number(conversation.last_message_send_id || 0),
    loginUser,
    conversation,
    contacts,
    defaultLabel: ""
  });
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
 */
export function getForwardItemDisplayName(options: {
  item: Pick<MergedForwardItem, "sender_id" | "sender_nickname">;
  loginUser?: LoginUser | null;
  contacts?: ContactsLookup;
}) {
  const { item, loginUser, contacts } = options;
  return getUserDisplayName({
    userId: item.sender_id,
    loginUser,
    contacts,
    fallbackNickname: item.sender_nickname,
    defaultLabel: item.sender_id
      ? i18n.t("display.unknownUser", { id: item.sender_id })
      : i18n.t("display.unknownMember")
  });
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
  loginUser?: LoginUser | null;
  contacts?: ContactsLookup;
}) {
  const { items, fallbackTitle, loginUser, contacts } = options;
  if (!items || items.length === 0) return fallbackTitle;

  const names: string[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    const id = Number(item.sender_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    names.push(getForwardItemDisplayName({ item, loginUser, contacts }));
  }

  if (names.length === 0) return fallbackTitle;
  if (names.length === 1) {
    return i18n.t("display.forwardTitleSingle", { name: names[0] });
  }
  if (names.length === 2) {
    return i18n.t("display.forwardTitleTwo", {
      nameA: names[0],
      nameB: names[1]
    });
  }
  return i18n.t("display.forwardTitleGroup");
}
