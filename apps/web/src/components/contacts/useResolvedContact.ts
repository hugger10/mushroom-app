import { useCallback, useEffect, useRef, useState } from "react";
import type { ContactListItem } from "../../types/user";

export interface ResolvedContactState {
  resolvedContact: ContactListItem | null;
  resolvedIsContact: boolean;
  resolvedIsBlocked: boolean;
  resolvedContactRef: React.RefObject<ContactListItem | null>;
}

/**
 * Resolves the local contact / blocked state for the given user. When the
 * caller already knows the values (e.g. contact tab passes `contact` +
 * `isContact` + `isBlocked`), they short-circuit the local cache lookup.
 *
 * Reset rules:
 * - `resolvedContact` is only reset to `contact ?? null` when `userId` changes,
 *   so an async cache hit isn't wiped when an unrelated parent re-render passes
 *   a fresh `contact` reference with the same id.
 * - When `userId` is stable but `contact` becomes available, we promote it.
 */
export function useResolvedContact(
  userId: number,
  contact: ContactListItem | null | undefined,
  isContact: boolean | undefined,
  isBlocked: boolean | undefined
): ResolvedContactState {
  const [resolvedContact, setResolvedContact] =
    useState<ContactListItem | null>(contact ?? null);
  const [resolvedIsContact, setResolvedIsContact] = useState<boolean>(
    isContact ?? Boolean(contact && !contact.is_blocked)
  );
  const [resolvedIsBlocked, setResolvedIsBlocked] = useState<boolean>(
    isBlocked ?? Boolean(contact?.is_blocked)
  );
  const resolvedContactRef = useRef<ContactListItem | null>(contact ?? null);
  const lastUserIdRef = useRef<number>(userId);

  // Keep ref in sync with state.
  useEffect(() => {
    resolvedContactRef.current = resolvedContact;
  }, [resolvedContact]);

  // Reset on userId change.
  useEffect(() => {
    if (lastUserIdRef.current === userId) return;
    lastUserIdRef.current = userId;
    setResolvedContact(contact ?? null);
    setResolvedIsContact(isContact ?? Boolean(contact && !contact.is_blocked));
    setResolvedIsBlocked(isBlocked ?? Boolean(contact?.is_blocked));
  }, [userId, contact, isContact, isBlocked]);

  // Promote freshly-arriving prop overrides without wiping cached data.
  useEffect(() => {
    if (contact) setResolvedContact(contact);
  }, [contact]);

  useEffect(() => {
    if (isContact !== undefined) setResolvedIsContact(isContact);
  }, [isContact]);

  useEffect(() => {
    if (isBlocked !== undefined) setResolvedIsBlocked(isBlocked);
  }, [isBlocked]);

  // Cache-driven fallback when overrides are not provided.
  const refreshFromCache = useCallback(
    async (isCancelled?: () => boolean) => {
      if (!window.electronAPI) return;
      try {
        const [contacts, blocked] = await Promise.all([
          window.electronAPI.getContacts().catch(() => [] as ContactListItem[]),
          window.electronAPI
            .getBlockedUsers()
            .catch(() => [] as ContactListItem[])
        ]);
        if (isCancelled?.()) return;
        const cachedContact =
          contacts.find(item => Number(item.user_id) === Number(userId)) ??
          null;
        const cachedBlocked = blocked.find(
          item => Number(item.user_id) === Number(userId)
        );
        if (cachedContact) setResolvedContact(cachedContact);
        if (isContact === undefined)
          setResolvedIsContact(Boolean(cachedContact));
        if (isBlocked === undefined)
          setResolvedIsBlocked(
            Boolean(cachedBlocked) || Boolean(cachedContact?.is_blocked)
          );
      } catch {
        // ignore
      }
    },
    [userId, isContact, isBlocked]
  );

  useEffect(() => {
    if (
      isContact !== undefined &&
      isBlocked !== undefined &&
      contact !== undefined
    ) {
      return undefined;
    }
    let cancelled = false;
    void refreshFromCache(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [userId, contact, isContact, isBlocked, refreshFromCache]);

  // Re-read the local cache whenever a contact-sync event fires so that WS
  // pushes (remark updates from other devices, block changes, etc.) are
  // reflected in the resolved state without a full app reload.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    const handler = () => {
      void refreshFromCache(() => cancelled);
    };
    window.addEventListener("im:contacts-sync", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("im:contacts-sync", handler);
    };
  }, [refreshFromCache]);

  return {
    resolvedContact,
    resolvedIsContact,
    resolvedIsBlocked,
    resolvedContactRef
  };
}
