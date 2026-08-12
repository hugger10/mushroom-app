import type { createMobileAccountActions } from "../../actions/account-actions";
import type { RunAction } from "../../actions/action-types";
import {
  mobileAppController,
  registerCurrentMobileDevice,
  updateMobilePushRegistration
} from "../../services/app-runtime";
import { syncPushRegistration } from "../../platform/notification-center";
import {
  fromServerNotificationSettings,
  saveNotificationPreferences,
  toServerNotificationSettingsPatch,
  type MobileNotificationPreferences
} from "../../platform/notification-preferences";
import type { MeProfileForm, MeProps } from "../../features/account/MeContext";
import type { MobileAppState } from "../controller/useMobileAppState";

type AccountActions = ReturnType<typeof createMobileAccountActions>;

export function buildMeProps(params: {
  state: MobileAppState;
  accountActions: AccountActions;
  runAction: RunAction;
}): MeProps | null {
  const { state, accountActions, runAction } = params;
  if (!state.snapshot || !state.isAuthenticated) {
    return null;
  }

  return {
    snapshot: state.snapshot,
    pending: state.pending,
    profileForm: state.profileForm,
    onChangeProfileForm: (value: Partial<MeProfileForm>) =>
      state.setProfileForm(current => ({ ...current, ...value })),
    onSaveProfile: (patch?: Partial<MeProfileForm>) => {
      if (patch) {
        state.setProfileForm(current => ({ ...current, ...patch }));
      }
      return accountActions.handleSaveProfile(patch);
    },
    onPickProfileAvatar: () => {
      void accountActions.handlePickProfileAvatar();
    },
    onPreviewAvatar: (input: { avatarUrl?: string | null; label?: string }) => {
      state.setAvatarPreviewUrl(input.avatarUrl ?? null);
      state.setAvatarPreviewLabel(input.label ?? "");
      state.setAvatarPreviewVisible(true);
    },
    onSyncNotificationRegistration: () =>
      runAction(
        "",
        async () => {
          await syncPushRegistration(async registration => {
            updateMobilePushRegistration({
              provider: registration.provider,
              token: registration.token,
              appId: registration.appId ?? null,
              region: registration.region ?? null,
              capabilities: registration.capabilities
            });
            await registerCurrentMobileDevice();
          });
        },
        ""
      ),
    onLoadNotificationSettings: async () => {
      const settings = await mobileAppController.getNotificationSettings();
      return saveNotificationPreferences(
        fromServerNotificationSettings(settings)
      );
    },
    onUpdateNotificationSettings: async (
      patch: Partial<MobileNotificationPreferences>
    ) => {
      const settings = await mobileAppController.updateNotificationSettings(
        toServerNotificationSettingsPatch(patch)
      );
      return saveNotificationPreferences(
        fromServerNotificationSettings(settings)
      );
    }
  };
}
