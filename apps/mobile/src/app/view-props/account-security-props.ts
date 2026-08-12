import type { ContactListItem, UserManagedDevice } from "@mushroom/shared";
import type { createMobileAccountActions } from "../../actions/account-actions";
import type { AccountSecurityProps } from "../../features/account";
import type { MobileAppState } from "../controller/useMobileAppState";

type AccountActions = ReturnType<typeof createMobileAccountActions>;

export function buildAccountSecurityProps(params: {
  state: MobileAppState;
  accountActions: AccountActions;
}): AccountSecurityProps {
  const { state, accountActions } = params;
  return {
    devices: state.devices,
    securityEvents: state.securityEvents,
    devicesLoading: state.devicesLoading,
    privacySettings: state.privacySettings,
    privacyLoading: state.privacyLoading,
    blockedContacts: state.blockedContacts,
    pending: state.pending,
    onUpdatePrivacySetting: (key, value) => {
      void accountActions.handleUpdatePrivacySetting(key, value);
    },
    onChangePassword: input => accountActions.handleChangePassword(input),
    onLogoutOtherDevices: () => {
      void accountActions.handleLogoutOtherDevices();
    },
    onLogoutAllDevices: () => {
      void accountActions.handleLogoutAllDevices();
    },
    onRestoreDevice: (device: UserManagedDevice) => {
      void accountActions.handleRestoreDevice(device);
    },
    onDisableDevice: (device: UserManagedDevice) => {
      void accountActions.handleDisableDevice(device);
    },
    onLogoutManagedDevice: (device: UserManagedDevice) => {
      void accountActions.handleLogoutManagedDevice(device);
    },
    onUnblockContact: (contact: ContactListItem) => {
      void accountActions.handleUnblockContact(contact);
    }
  };
}
