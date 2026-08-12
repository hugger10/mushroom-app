import type {
  ContactListItem,
  PrivacyRule,
  UserManagedDevice,
  UserPrivacySettings,
  UserSecurityEvent
} from "@mushroom/shared";
import { createContext, useContext, type ReactNode } from "react";

export type AccountSecurityProps = {
  devices: UserManagedDevice[];
  securityEvents: UserSecurityEvent[];
  devicesLoading: boolean;
  privacySettings: UserPrivacySettings | null;
  privacyLoading: boolean;
  blockedContacts: ContactListItem[];
  pending: boolean;
  onUpdatePrivacySetting: (
    key: keyof UserPrivacySettings,
    value: PrivacyRule
  ) => void;
  onChangePassword: (input: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  onLogoutOtherDevices: () => void;
  onLogoutAllDevices: () => void;
  onRestoreDevice: (device: UserManagedDevice) => void;
  onDisableDevice: (device: UserManagedDevice) => void;
  onLogoutManagedDevice: (device: UserManagedDevice) => void;
  onUnblockContact: (contact: ContactListItem) => void;
};

const AccountSecurityContext = createContext<AccountSecurityProps | null>(null);

export function AccountSecurityProvider(props: {
  value: AccountSecurityProps;
  children: ReactNode;
}) {
  return (
    <AccountSecurityContext.Provider value={props.value}>
      {props.children}
    </AccountSecurityContext.Provider>
  );
}

export function useAccountSecurityProps(): AccountSecurityProps {
  const value = useContext(AccountSecurityContext);
  if (!value) {
    throw new Error(
      "useAccountSecurityProps must be used inside AccountSecurityProvider"
    );
  }
  return value;
}
