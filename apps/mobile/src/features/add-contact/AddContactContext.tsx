import { createContext, useContext, type ReactNode } from "react";
import type { UserSearchMode, UserSearchResult } from "@mushroom/shared";
import type { AddressBookPermissionState } from "../../platform/address-book";
import type { AddressBookMatchCacheEntry } from "../../data/address-book-match-cache";

export type AddContactProps = {
  pending: boolean;
  addressBookMatches: AddressBookMatchCacheEntry[];
  addressBookPermission: AddressBookPermissionState;
  addressBookSyncing: boolean;
  onLookupByPhone: (input: {
    phoneE164: string;
    defaultCountryCode?: string;
  }) => Promise<{
    matched: boolean;
    phoneE164: string;
    user: UserSearchResult | null;
  }>;
  onSearchUsers: (
    keyword: string,
    options?: { mode?: UserSearchMode }
  ) => Promise<UserSearchResult[]>;
  onAddContact: (input: {
    userId: number;
    remarkName?: string;
    source?: string;
  }) => Promise<void>;
  onOpenChatByUserId: (userId: number) => Promise<void>;
  onOpenContactProfile: (input: {
    userId: number;
    nickname: string;
    avatarUrl: string | null;
  }) => void;
  onRefreshAddressBookMatches: () => void;
  onSaveAddressBookContact: (entry: AddressBookMatchCacheEntry) => void;
  onOpenAddressBookConversation: (entry: AddressBookMatchCacheEntry) => void;
};

const AddContactContext = createContext<AddContactProps | null>(null);

export function AddContactProvider(props: {
  value: AddContactProps;
  children: ReactNode;
}) {
  return (
    <AddContactContext.Provider value={props.value}>
      {props.children}
    </AddContactContext.Provider>
  );
}

export function useAddContactProps(): AddContactProps {
  const value = useContext(AddContactContext);
  if (!value) {
    throw new Error(
      "useAddContactProps must be used inside AddContactProvider"
    );
  }
  return value;
}
