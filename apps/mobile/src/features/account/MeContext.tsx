import { createContext, useContext, type ReactNode } from "react";
import type { MobileAppSnapshot } from "@mushroom/app-core";
import type { MobileNotificationPreferences } from "../../platform/notification-preferences";

export type MeProfileForm = {
  nickname: string;
  avatar_url: string;
  email: string;
  phone: string;
  gender: number;
  birthday: string;
  signature: string;
};

export type MeProps = {
  snapshot: MobileAppSnapshot;
  pending: boolean;
  profileForm: MeProfileForm;
  onChangeProfileForm: (value: Partial<MeProfileForm>) => void;
  onSaveProfile: (patch?: Partial<MeProfileForm>) => Promise<boolean>;
  onPickProfileAvatar: () => void;
  onPreviewAvatar: (input: {
    avatarUrl?: string | null;
    label?: string;
  }) => void;
  onSyncNotificationRegistration: () => Promise<void>;
  onLoadNotificationSettings: () => Promise<MobileNotificationPreferences | null>;
  onUpdateNotificationSettings: (
    patch: Partial<MobileNotificationPreferences>
  ) => Promise<MobileNotificationPreferences | null>;
};

const MeContext = createContext<MeProps | null>(null);

export function MeProvider(props: { value: MeProps; children: ReactNode }) {
  return (
    <MeContext.Provider value={props.value}>
      {props.children}
    </MeContext.Provider>
  );
}

export function useMeProps(): MeProps {
  const value = useContext(MeContext);
  if (!value) {
    throw new Error("useMeProps must be used inside MeProvider");
  }
  return value;
}
