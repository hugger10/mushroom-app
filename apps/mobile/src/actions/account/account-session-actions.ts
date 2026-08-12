import type {
  PrivacyRule,
  UpdateUserPrivacySettingsRequest,
  UserManagedDevice
} from "@mushroom/shared";
import {
  mobileAppController,
  uploadMobileAvatarFile
} from "../../services/app-runtime";
import { setLoggingOut } from "../../services/session-lifecycle";
import { clearAppBadge } from "../../platform/notification-center";
import { pickAvatarImage } from "../../platform/native-pickers";
import { getReadableErrorMessage } from "../../utils/error-message";
import log from "../../utils/log";
import { i18n } from "../../i18n";
import type { RunAction } from "../action-types";
import type { MobileAppState } from "../../app/controller/useMobileAppState";
import type { MeProfileForm } from "../../features/account/MeContext";

const sessionLog = log.scope("session");

export function createAccountSessionActions(params: {
  state: MobileAppState;
  runAction: RunAction;
}) {
  const { state, runAction } = params;

  async function refreshMeData() {
    if (!state.isAuthenticated) {
      return;
    }

    state.setDevicesLoading(true);
    state.setError("");

    try {
      const [devicesResult, securityResult] = await Promise.all([
        mobileAppController.getManagedDevices(),
        mobileAppController.getSecurityEvents(20),
        mobileAppController
          .getPrivacySettings()
          .then(envelope => state.setPrivacySettings(envelope.settings)),
        mobileAppController.refreshProfile()
      ]);
      state.setDevices(devicesResult.devices);
      state.setSecurityEvents(securityResult.events);
      // Background auto-refresh on entering the "Me" tab — surface this as a
      // silent status update so it doesn't flash a toast for unsolicited work.
      // Failures below still use the default "user" level so they remain
      // visible.
      state.setStatus(i18n.t("accountActions.meDataRefreshed"), "silent");
    } catch (currentError) {
      state.setError(
        currentError instanceof Error
          ? currentError.message
          : String(currentError ?? "")
      );
      state.setStatus(i18n.t("accountActions.refreshFailed"));
    } finally {
      state.setDevicesLoading(false);
    }
  }

  /**
   * Persists the current profile form to the server and reports whether the
   * save succeeded. Accepts an optional patch so the dedicated field editors
   * can pass the freshly typed value directly — otherwise React state timing
   * could let the action read a stale `profileForm`.
   */
  async function handleSaveProfile(
    patch?: Partial<MeProfileForm>
  ): Promise<boolean> {
    const merged = { ...state.profileForm, ...(patch ?? {}) };
    if (!merged.nickname.trim()) {
      state.setError(i18n.t("accountActions.nicknameRequired"));
      return false;
    }

    const nextProfile = {
      nickname: merged.nickname.trim(),
      email: merged.email.trim() || undefined,
      phone: merged.phone.trim() || undefined,
      birthday: merged.birthday.trim() || undefined,
      signature: merged.signature.trim() || undefined
    };
    const avatarUrl = merged.avatar_url?.trim();
    const gender = Number(merged.gender);

    if (avatarUrl) {
      Object.assign(nextProfile, { avatar_url: avatarUrl });
    }
    if (Number.isFinite(gender)) {
      Object.assign(nextProfile, { gender });
    }

    state.setPending(true);
    state.setError("");
    state.setStatus(i18n.t("accountActions.savingProfile"));
    try {
      await mobileAppController.updateProfile(nextProfile);
      state.setStatus(i18n.t("accountActions.profileSaved"));
      return true;
    } catch (currentError) {
      const readableError = getReadableErrorMessage(currentError);
      state.setError(readableError);
      state.setStatus(readableError);
      return false;
    } finally {
      state.setPending(false);
    }
  }

  async function refreshPrivacySettings() {
    if (!state.isAuthenticated) {
      return;
    }

    state.setPrivacyLoading(true);
    state.setError("");

    try {
      const envelope = await mobileAppController.getPrivacySettings();
      state.setPrivacySettings(envelope.settings);
    } catch (currentError) {
      state.setError(
        currentError instanceof Error
          ? currentError.message
          : String(currentError ?? "")
      );
      state.setStatus(i18n.t("accountActions.privacyRefreshFailed"));
    } finally {
      state.setPrivacyLoading(false);
    }
  }

  async function handleUpdatePrivacySetting(
    key: keyof UpdateUserPrivacySettingsRequest,
    value: PrivacyRule
  ) {
    await runAction(
      "",
      async () => {
        const envelope = await mobileAppController.updatePrivacySettings({
          [key]: value
        });
        state.setPrivacySettings(envelope.settings);
      },
      ""
    );
  }

  async function handleChangePassword(input: {
    currentPassword: string;
    newPassword: string;
  }) {
    await runAction(
      i18n.t("accountActions.changingPassword"),
      async () => {
        await mobileAppController.changePassword({
          current_password: input.currentPassword,
          new_password: input.newPassword
        });
        await refreshMeData();
      },
      i18n.t("accountActions.passwordChanged")
    );
  }

  async function handlePickProfileAvatar() {
    let image: Awaited<ReturnType<typeof pickAvatarImage>> = null;
    try {
      image = await pickAvatarImage();
    } catch (currentError) {
      // 选择/权限阶段失败：在进入 runAction 前补一份错误反馈，避免 unhandled rejection。
      const readableError = getReadableErrorMessage(currentError);
      state.setError(readableError);
      state.setStatus(readableError);
      return;
    }
    if (!image) {
      return;
    }

    const pickedImage = image;

    await runAction(
      "",
      async () => {
        const uploaded = await uploadMobileAvatarFile(pickedImage);
        const nextAvatarUrl =
          uploaded.large ||
          uploaded.medium ||
          uploaded.small ||
          uploaded.original;
        if (!nextAvatarUrl) {
          throw new Error(i18n.t("accountActions.avatarNoUrl"));
        }
        // 先把新地址写回本地表单，确保即使后续 updateProfile 失败，
        // 用户也能在 UI 上看到已上传的头像，并可手动点"保存"重试。
        state.setProfileForm(current => ({
          ...current,
          avatar_url: nextAvatarUrl
        }));
        // 头像走"上传即保存"：立即同步到服务器，避免用户忘点保存
        // 导致下次进入资料页时回退为旧头像。其他字段（昵称/签名等）
        // 仍由"保存"按钮统一提交。
        try {
          await mobileAppController.updateProfile({
            avatar_url: nextAvatarUrl
          });
        } catch (updateError) {
          // 上传成功但服务器同步失败：保留本地表单的新头像，
          // 并把错误抛给 runAction 让用户看到提示，可手动点"保存"重试。
          void updateError;
          throw new Error(i18n.t("accountActions.avatarSyncFailed"));
        }
      },
      ""
    );
  }

  function resetToLoggedOutState() {
    state.setActiveConversationId(null);
    state.setComposerText("");
    state.setReplyTargetId(null);
    state.setSelectedMessageId(null);
    state.setForwardingMessageId(null);
    state.setHighlightedMessageId(null);
    state.setSearchKeyword("");
    state.setSearchResults([]);
    state.setAttachmentCenterVisible(false);
    state.clearPreviewImage();
    state.setPreviewVideo(null);
    state.setVoicePlayingMessageId(null);
    state.setVoicePlayingPositionMs(0);
    state.setVoiceRecordingActive(false);
    state.dismissCallSessionNow();
    state.setDevices([]);
    state.setSecurityEvents([]);
    state.setPrivacySettings(null);
    state.setTab("chats");
    // Clear the OS app-icon badge on logout so a stale unread count does not
    // linger on the home screen after the session is gone.
    void clearAppBadge();
  }

  async function handleLogoutOtherDevices() {
    sessionLog.info("logoutOtherDevices start");
    await runAction(
      "",
      async () => {
        await mobileAppController.logoutOtherDevices();
        await refreshMeData();
        sessionLog.info("logoutOtherDevices done");
      },
      ""
    );
  }

  async function handleLogoutAllDevices() {
    sessionLog.info("logoutAllDevices start");
    await runAction(
      "",
      async () => {
        setLoggingOut(true);
        try {
          await mobileAppController.logoutAllManagedDevices();
          await mobileAppController.logout();
          resetToLoggedOutState();
          sessionLog.info("logoutAllDevices done");
        } finally {
          setLoggingOut(false);
        }
      },
      ""
    );
  }

  async function handleDisableDevice(device: UserManagedDevice) {
    sessionLog.info("disableDevice", {
      deviceId: device.device_id,
      currentDevice: device.is_current_device
    });
    await runAction(
      "",
      async () => {
        await mobileAppController.disableDevice(device.device_id);
        if (device.is_current_device) {
          setLoggingOut(true);
          try {
            await mobileAppController.logout();
            resetToLoggedOutState();
          } finally {
            setLoggingOut(false);
          }
          return;
        }
        await refreshMeData();
      },
      ""
    );
  }

  async function handleRestoreDevice(device: UserManagedDevice) {
    sessionLog.info("restoreDevice", { deviceId: device.device_id });
    await runAction(
      "",
      async () => {
        await mobileAppController.restoreDevice(device.device_id);
        await refreshMeData();
      },
      ""
    );
  }

  async function handleLogoutManagedDevice(device: UserManagedDevice) {
    sessionLog.info("logoutManagedDevice", {
      deviceId: device.device_id,
      currentDevice: device.is_current_device
    });
    await runAction(
      "",
      async () => {
        await mobileAppController.logoutManagedDevice(device.device_id);
        if (device.is_current_device) {
          setLoggingOut(true);
          try {
            await mobileAppController.logout();
            resetToLoggedOutState();
          } finally {
            setLoggingOut(false);
          }
          return;
        }
        await refreshMeData();
      },
      ""
    );
  }

  return {
    refreshMeData,
    refreshPrivacySettings,
    handleUpdatePrivacySetting,
    handleChangePassword,
    handleSaveProfile,
    handlePickProfileAvatar,
    resetToLoggedOutState,
    handleLogoutOtherDevices,
    handleLogoutAllDevices,
    handleDisableDevice,
    handleRestoreDevice,
    handleLogoutManagedDevice
  };
}
