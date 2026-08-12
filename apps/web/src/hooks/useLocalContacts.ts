import { useEffect, useState } from "react";
import type { ContactListItem } from "../types/user";

/**
 * Lightweight read-only hook returning the local contact cache. Refreshes on
 * window focus / visibility change / `im:contacts-sync` events so that remark
 * updates flow into UI without a manual reload.
 *
 * Use this where you only need the contact list for display-name resolution
 * (e.g. message-list, group member panels). Components that need to mutate
 * contacts should keep using {@link useContacts}.
 */
export function useLocalContacts(): ContactListItem[] {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      if (!window.electronAPI?.getContacts) return;
      window.electronAPI
        .getContacts()
        .then(next => {
          if (!cancelled) setContacts(next);
        })
        .catch(() => {
          /* ignore */
        });
    };

    load();

    const handleFocus = () => load();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    const handleSync = () => load();

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("im:contacts-sync", handleSync);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("im:contacts-sync", handleSync);
    };
  }, []);

  return contacts;
}
