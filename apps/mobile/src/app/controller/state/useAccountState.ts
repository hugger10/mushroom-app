import { useState } from "react";
import type {
  UserManagedDevice,
  UserPrivacySettings,
  UserSecurityEvent
} from "@mushroom/shared";
import type { AddressBookMatchCacheEntry } from "../../../data/address-book-match-cache";
import type { AddressBookPermissionState } from "../../../platform/address-book";

export function useAccountState() {
  const [profileForm, setProfileForm] = useState({
    nickname: "",
    avatar_url: "",
    email: "",
    phone: "",
    gender: 0,
    birthday: "",
    signature: ""
  });
  const [devices, setDevices] = useState<UserManagedDevice[]>([]);
  const [securityEvents, setSecurityEvents] = useState<UserSecurityEvent[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [privacySettings, setPrivacySettings] =
    useState<UserPrivacySettings | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [addressBookMatches, setAddressBookMatches] = useState<
    AddressBookMatchCacheEntry[]
  >([]);
  const [addressBookPermission, setAddressBookPermission] =
    useState<AddressBookPermissionState>("unknown");
  const [addressBookSyncing, setAddressBookSyncing] = useState(false);

  return {
    profileForm,
    setProfileForm,
    devices,
    setDevices,
    securityEvents,
    setSecurityEvents,
    devicesLoading,
    setDevicesLoading,
    privacySettings,
    setPrivacySettings,
    privacyLoading,
    setPrivacyLoading,
    addressBookMatches,
    setAddressBookMatches,
    addressBookPermission,
    setAddressBookPermission,
    addressBookSyncing,
    setAddressBookSyncing
  };
}
