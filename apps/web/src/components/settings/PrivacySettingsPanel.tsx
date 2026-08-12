import { App, Select, Skeleton } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  type PrivacyRule,
  type UserPrivacySettings
} from "@mushroom/shared";
import { getPrivacySettings, updatePrivacySettings } from "../../http/api";

const PRIVACY_ROW_KEYS: Array<keyof UserPrivacySettings> = [
  "discoverable_by_username",
  "discoverable_by_phone",
  "presence_visibility",
  "message_permission",
  "read_receipts_visibility"
];

// 已读回执是双向开关：只允许 "所有人(0) / 关闭(2)"。"仅联系人" 没有合理
// 的对称语义，所以隐藏。
const BINARY_PRIVACY_KEYS = new Set<keyof UserPrivacySettings>([
  "read_receipts_visibility"
]);

export function PrivacySettingsPanel() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [settings, setSettings] = useState<UserPrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<
    keyof UserPrivacySettings | null
  >(null);

  // Stable refs so the mount-only effect below does not need to depend on
  // `message` / `t` (whose identity changes on locale switch and would
  // otherwise re-trigger a network fetch + skeleton flash).
  const messageRef = useRef(message);
  messageRef.current = message;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPrivacySettings()
      .then(result => {
        if (cancelled) return;
        if (result?.data) {
          setSettings(result.data.settings);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const msg =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        void messageRef.current.error(msg || "Network error");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // Mount-only fetch by design; locale changes must not refetch.
  }, []);

  const ruleOptions = useMemo(
    () => [
      {
        value: 0 as PrivacyRule,
        label: t("me.security.privacyPage.rules.everyone")
      },
      {
        value: 1 as PrivacyRule,
        label: t("me.security.privacyPage.rules.contactsOnly")
      },
      { value: 2 as PrivacyRule, label: t("me.security.privacyPage.rules.off") }
    ],
    [t]
  );

  async function handleChange(
    key: keyof UserPrivacySettings,
    value: PrivacyRule
  ) {
    if (!settings || settings[key] === value) {
      return;
    }
    const previous = settings;
    const optimistic: UserPrivacySettings = { ...settings, [key]: value };
    setSettings(optimistic);
    setPendingKey(key);
    try {
      const result = await updatePrivacySettings({ [key]: value });
      if (result?.data) {
        // Merge rather than replace: defends against partial server payloads
        // so other rows' Select values are never wiped to undefined.
        setSettings(prev =>
          prev ? { ...prev, ...result.data.settings } : result.data.settings
        );
      }
    } catch (error) {
      setSettings(previous);
      const msg =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      void message.error(msg || "Network error");
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="im-settings-card im-settings-form-card">
      <div className="im-settings-info-grid">
        {loading || !settings ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <Skeleton active paragraph={{ rows: 4 }} />
          </div>
        ) : (
          PRIVACY_ROW_KEYS.map(key => (
            <div className="im-settings-info-item" key={key}>
              <span className="im-settings-info-label">
                {t(`me.security.privacyPage.rows.${key}.title`)}
              </span>
              <span
                className="im-settings-info-value"
                style={{
                  fontSize: 12,
                  fontWeight: 400,
                  color: "var(--im-text-soft)"
                }}
              >
                {t(`me.security.privacyPage.rows.${key}.detail`)}
              </span>
              <Select<PrivacyRule>
                className="im-settings-select"
                value={settings[key]}
                options={
                  BINARY_PRIVACY_KEYS.has(key)
                    ? ruleOptions.filter(opt => opt.value !== 1)
                    : ruleOptions
                }
                disabled={pendingKey !== null}
                loading={pendingKey === key}
                onChange={value => void handleChange(key, value)}
                style={{ marginTop: 8 }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
