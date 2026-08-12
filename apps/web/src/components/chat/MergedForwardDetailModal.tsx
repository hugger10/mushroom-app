import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import {
  isMergedForwardContent,
  isFileMessageContent,
  isImageFileMessageContent,
  getMessageSummaryText,
  type MergedForwardItem
} from "@mushroom/shared";
import type { Conversation, Message } from "../../types/chat";
import type { ContactListItem, LoginUser } from "../../types/user";
import { UserAvatar } from "../avatars/UserAvatar";
import { formatMessageTime } from "../../utils/date";
import {
  getForwardCardTitle,
  getForwardItemDisplayName,
  type ContactsLookup
} from "../../utils/display";

interface MergedForwardDetailModalProps {
  open: boolean;
  message: Message | null;
  conversation?: Conversation | null;
  loginUser?: LoginUser | null;
  contacts?: ContactsLookup;
  onCancel: () => void;
}

function MergedForwardItemView({
  item,
  resolvedAvatar,
  displayName
}: {
  item: MergedForwardItem;
  resolvedAvatar?: string;
  displayName: string;
}) {
  const { t } = useTranslation();
  const summary = getMessageSummaryText(item.content);
  return (
    <div className="im-merged-detail-item">
      <UserAvatar
        size={32}
        src={resolvedAvatar}
        name={displayName}
        className="im-merged-detail-item-avatar"
      />
      <div className="im-merged-detail-item-content">
        <div className="im-merged-detail-item-header">
          <span className="im-merged-detail-item-sender">{displayName}</span>
          <span className="im-merged-detail-item-time">
            {formatMessageTime(item.sent_at)}
          </span>
        </div>
        <div className="im-merged-detail-item-body">
          {isFileMessageContent(item.content) &&
          isImageFileMessageContent(item.content) ? (
            <img
              src={(item.content as Record<string, unknown>).url as string}
              className="im-merged-detail-item-image"
              alt={t("chat.attachmentCategory.image")}
            />
          ) : (
            <span>{summary}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Build a `userId -> avatar` lookup from the active conversation members and
 * the locally cached contacts list. The merged-forward payload itself only
 * carries `sender_avatar` for newly-created records — for older snapshots we
 * fall back to whatever the local caches know about the sender.
 */
function useSenderAvatarMap(
  open: boolean,
  conversation: Conversation | null | undefined
): Map<number, string> {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);

  useEffect(() => {
    if (!open) return;
    if (!window.electronAPI?.getContacts) return;
    let cancelled = false;
    void window.electronAPI
      .getContacts()
      .then(list => {
        if (cancelled) return;
        setContacts(list || []);
      })
      .catch(() => {
        // ignore — fallback to initials
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return useMemo(() => {
    const map = new Map<number, string>();
    for (const c of contacts) {
      if (c.user_id && c.avatar_url) {
        map.set(Number(c.user_id), c.avatar_url);
      }
    }
    // Conversation members take precedence (more up-to-date for the active
    // chat, esp. for groups where the user might not be a contact).
    for (const m of conversation?.members ?? []) {
      const avatar = m.avatar_url || m.avatar;
      if (m.user_id && avatar) {
        map.set(Number(m.user_id), avatar);
      }
    }
    return map;
  }, [contacts, conversation]);
}

export function MergedForwardDetailModal({
  open,
  message,
  conversation,
  loginUser,
  contacts,
  onCancel
}: MergedForwardDetailModalProps) {
  const avatarMap = useSenderAvatarMap(open, conversation);

  const merged =
    message && isMergedForwardContent(message.content) ? message.content : null;

  const title = useMemo(() => {
    if (!merged) return "";
    return getForwardCardTitle({
      items: merged.messages,
      fallbackTitle: merged.title,
      loginUser,
      contacts
    });
  }, [merged, loginUser, contacts]);

  if (!message || !merged) {
    return null;
  }

  return (
    <Modal
      className="im-modal"
      title={title}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={480}
    >
      <div className="im-merged-detail-list">
        {merged.messages.map((item, index) => {
          const resolvedAvatar =
            item.sender_avatar ||
            (item.sender_id
              ? avatarMap.get(Number(item.sender_id))
              : undefined);
          const displayName = getForwardItemDisplayName({
            item,
            loginUser,
            contacts
          });
          return (
            <MergedForwardItemView
              key={index}
              item={item}
              resolvedAvatar={resolvedAvatar}
              displayName={displayName}
            />
          );
        })}
      </div>
    </Modal>
  );
}
