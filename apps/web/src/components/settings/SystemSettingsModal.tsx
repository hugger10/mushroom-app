import { Button, Modal, Select } from "antd";
import {
  BellOutlined,
  BgColorsOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  LockOutlined,
  SettingOutlined,
  UserOutlined
} from "@ant-design/icons";
import {
  MUSHROOM_LANGUAGE_LABELS,
  type MushroomSupportedLanguage,
  type UpdateUserProfileRequest,
  type UserSessionSummary
} from "@mushroom/shared";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppLanguage } from "../../i18n";
import { useAppThemePreference } from "../../theme/useAppThemePreference";
import type { LoginUser } from "../../types/user";
import {
  ProfileSettingsPanel,
  type ProfileSection
} from "./ProfileSettingsModal";
import { NotificationSettingsPanel } from "./NotificationSettingsPanel";
import { PrivacySettingsPanel } from "./PrivacySettingsPanel";
import { StorageSettingsPanel } from "./StorageSettingsPanel";

interface SystemSettingsModalProps {
  open: boolean;
  loginUser: LoginUser | null;
  sessionSummary: UserSessionSummary | null;
  savingProfile: boolean;
  onCancel: () => void;
  onRefreshSession: () => Promise<void>;
  onSubmitProfile: (patch: UpdateUserProfileRequest) => Promise<void>;
  onForceLogout: () => Promise<void> | void;
}

type SettingsTab =
  | "preferences"
  | "notifications"
  | "privacy"
  | "storage"
  | ProfileSection;

const settingsTabIcons: Record<SettingsTab, ReactNode> = {
  preferences: <BgColorsOutlined />,
  notifications: <BellOutlined />,
  profile: <UserOutlined />,
  devices: <DesktopOutlined />,
  privacy: <LockOutlined />,
  storage: <DatabaseOutlined />
};

export function SystemSettingsModal({
  open,
  loginUser,
  sessionSummary,
  savingProfile,
  onCancel,
  onRefreshSession,
  onSubmitProfile,
  onForceLogout
}: SystemSettingsModalProps) {
  const { t } = useTranslation();
  const { language, languageLabel, setLanguage } = useAppLanguage();
  const { themePreference, resolvedTheme, setThemePreference } =
    useAppThemePreference();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  const languageOptions = useMemo(
    () =>
      (
        Object.entries(MUSHROOM_LANGUAGE_LABELS) as Array<
          [MushroomSupportedLanguage, string]
        >
      ).map(([value, label]) => ({
        value,
        label
      })),
    []
  );

  const themeOptions = [
    { value: "system", label: t("common.systemDefault") },
    { value: "light", label: t("common.lightMode") },
    { value: "dark", label: t("common.darkMode") }
  ];

  return (
    <Modal
      className="im-modal im-settings-panel-modal"
      title={
        <span className="im-settings-modal-title">
          <SettingOutlined />
          <span>{t("settings.title")}</span>
        </span>
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      width={920}
      destroyOnHidden
    >
      <div className="im-settings-shell">
        <aside className="im-settings-sidebar">
          {(
            [
              ["profile", t("settings.tabs.profile")],
              ["preferences", t("settings.tabs.preferences")],
              ["notifications", t("settings.tabs.notifications")],
              ["storage", t("settings.tabs.storage")],
              ["privacy", t("settings.tabs.privacy")],
              ["devices", t("settings.tabs.devices")]
            ] as Array<[SettingsTab, string]>
          ).map(([key, label]) => (
            <Button
              key={key}
              className={`im-settings-nav-button ${
                activeTab === key ? "im-settings-nav-button-active" : ""
              }`}
              type="text"
              onClick={() => setActiveTab(key)}
            >
              {settingsTabIcons[key]}
              {label}
            </Button>
          ))}
        </aside>

        <section className="im-settings-content">
          {activeTab === "preferences" ? (
            <div className="im-settings-card im-settings-form-card">
              <div className="im-settings-info-grid">
                <div className="im-settings-info-item">
                  <span className="im-settings-info-label">
                    {t("settings.language.current")}
                  </span>
                  <span className="im-settings-info-value">
                    {languageLabel}
                  </span>
                </div>
                <div className="im-settings-info-item">
                  <span className="im-settings-info-label">
                    {t("settings.language.label")}
                  </span>
                  <Select
                    className="im-settings-select"
                    value={language}
                    options={languageOptions}
                    onChange={value =>
                      void setLanguage(value as MushroomSupportedLanguage)
                    }
                  />
                </div>
                <div className="im-settings-info-item">
                  <span className="im-settings-info-label">
                    {t("settings.appearance.current")}
                  </span>
                  <span className="im-settings-info-value">
                    {resolvedTheme === "dark"
                      ? t("common.darkMode")
                      : t("common.lightMode")}
                  </span>
                </div>
                <div className="im-settings-info-item">
                  <span className="im-settings-info-label">
                    {t("settings.appearance.label")}
                  </span>
                  <Select
                    className="im-settings-select"
                    value={themePreference}
                    options={themeOptions}
                    onChange={value =>
                      void setThemePreference(
                        value as "system" | "light" | "dark"
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "profile" || activeTab === "devices" ? (
            <ProfileSettingsPanel
              open={open}
              activeSection={activeTab}
              loginUser={loginUser}
              sessionSummary={sessionSummary}
              saving={savingProfile}
              onCancel={onCancel}
              onRefreshSession={onRefreshSession}
              onSubmit={onSubmitProfile}
              onForceLogout={onForceLogout}
            />
          ) : null}

          {activeTab === "privacy" ? <PrivacySettingsPanel /> : null}

          {activeTab === "notifications" ? <NotificationSettingsPanel /> : null}

          {activeTab === "storage" ? (
            <StorageSettingsPanel username={loginUser?.username ?? null} />
          ) : null}
        </section>
      </div>
    </Modal>
  );
}
