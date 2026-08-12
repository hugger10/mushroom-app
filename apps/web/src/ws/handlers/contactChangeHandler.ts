import type {
  ContactChangedMessage,
  BlockChangedMessage
} from "@mushroom/shared";
import type { ContactListItem } from "../../types/user";
import log from "@/utils/log";

function mapContactToLocal(contact: Record<string, unknown>): ContactListItem {
  return {
    user_id: contact.user_id as number,
    username: (contact.username as string) ?? "",
    nickname: (contact.nickname as string) ?? "",
    remark_name: (contact.remark_name as string) ?? null,
    remark_note: (contact.remark_note as string) ?? null,
    avatar_url: (contact.avatar_url as string) ?? undefined,
    gender: Number(contact.gender ?? 0),
    signature: (contact.signature as string) ?? undefined,
    status: (contact.status as string) ?? "normal",
    is_blocked: false,
    updated_at: (contact.updated_at as string) ?? new Date().toISOString()
  };
}

function mapBlockToLocal(block: Record<string, unknown>): ContactListItem {
  return {
    user_id: block.blocked_id as number,
    username: (block.username as string) ?? "",
    nickname: (block.nickname as string) ?? "",
    remark_name: null,
    remark_note: null,
    avatar_url: (block.avatar_url as string) ?? undefined,
    gender: Number(block.gender ?? 0),
    signature: (block.signature as string) ?? undefined,
    status: (block.status as string) ?? "normal",
    is_blocked: true,
    updated_at: (block.updated_at as string) ?? new Date().toISOString()
  };
}

export async function handleContactChangedMessage(
  message: ContactChangedMessage
) {
  const { action, contact } = message;
  log.info("handleContactChangedMessage:", action, contact);

  try {
    switch (action) {
      case "added":
      case "updated": {
        const item = mapContactToLocal(contact as Record<string, unknown>);
        if (action === "added") {
          await window.electronAPI.createContacts([item]);
        } else {
          await window.electronAPI.updateContacts([item]);
        }
        break;
      }
      case "removed": {
        const userId = (contact as { user_id: number }).user_id;
        await window.electronAPI.deleteContacts([userId]);
        break;
      }
    }
    window.dispatchEvent(new CustomEvent("im:contacts-sync"));
  } catch (err) {
    log.error("handleContactChangedMessage error:", err);
  }
}

export async function handleBlockChangedMessage(message: BlockChangedMessage) {
  const { action, block } = message;
  log.info("handleBlockChangedMessage:", action, block);

  try {
    switch (action) {
      case "blocked": {
        const item = mapBlockToLocal(block as Record<string, unknown>);
        await window.electronAPI.createContacts([item]);
        break;
      }
      case "unblocked": {
        const userId = (block as { blocked_id: number }).blocked_id;
        await window.electronAPI.deleteContacts([userId]);
        break;
      }
    }
    window.dispatchEvent(new CustomEvent("im:contacts-sync"));
  } catch (err) {
    log.error("handleBlockChangedMessage error:", err);
  }
}
