import {
  App,
  Alert,
  Radio,
  Skeleton,
  Switch,
  TimePicker,
  Typography
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ApiError,
  type NotificationPreviewMode,
  type UpdateUserNotificationSettingsRequest,
  type UserNotificationSettings
} from "@mushroom/shared";
import {
  getNotificationSettings,
  updateNotificationSettings
} from "../../http/api";
import { getReadableErrorMessage } from "../../utils/errorMessage";

dayjs.extend(customParseFormat);

const TIME_FORMAT = "HH:mm";

type BrowserNotificationStatus =
  | "granted"
  | "denied"
  | "default"
  | "unsupported"
  | "electron";

function detectBrowserNotificationStatus(): BrowserNotificationStatus {
  if (
    typeof window !== "undefined" &&
    (window as unknown as { electronAPI?: unknown }).electronAPI
  ) {
    return "electron";
  }
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission as BrowserNotificationStatus;
}

function useBrowserNotificationStatus(): {
  status: BrowserNotificationStatus;
  request: () => Promise<void>;
} {
  const [status, setStatus] = useState<BrowserNotificationStatus>(() =>
    detectBrowserNotificationStatus()
  );

  useEffect(() => {
    let cancelled = false;
    let permissionStatusRef: PermissionStatus | null = null;

    function syncStatus() {
      if (cancelled) return;
      setStatus(detectBrowserNotificationStatus());
    }

    syncStatus();

    if (
      typeof navigator !== "undefined" &&
      navigator.permissions &&
      typeof navigator.permissions.query === "function"
    ) {
      navigator.permissions
        .query({ name: "notifications" as PermissionName })
        .then(result => {
          if (cancelled) return;
          permissionStatusRef = result;
          result.addEventListener("change", syncStatus);
        })
        .catch(() => undefined);
    }

    const onVisibility = () => syncStatus();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      permissionStatusRef?.removeEventListener("change", syncStatus);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, []);

  const request = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const next = await Notification.requestPermission();
      setStatus(next as BrowserNotificationStatus);
    } catch {
      // Ignore; status will be refreshed by visibility/permission change.
    }
  };

  return { status, request };
}

type SectionCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <div
      className="im-settings-card im-settings-form-card"
      style={{ marginBottom: 16 }}
    >
      <div style={{ marginBottom: 12 }}>
        <Typography.Text strong style={{ fontSize: 15 }}>
          {title}
        </Typography.Text>
        {description ? (
          <Typography.Paragraph
            type="secondary"
            style={{ marginBottom: 0, marginTop: 4, fontSize: 12 }}
          >
            {description}
          </Typography.Paragraph>
        ) : null}
      </div>
      {children}
    </div>
  );
}

type SwitchRowProps = {
  title: string;
  subtitle?: string;
  checked: boolean;
  loading?: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
};

function SwitchRow({
  title,
  subtitle,
  checked,
  loading,
  disabled,
  onChange
}: SwitchRowProps) {
  return (
    <div
      className="im-settings-info-row"
      style={{
        opacity: disabled ? 0.55 : 1,
        alignItems: "center",
        paddingTop: 10,
        paddingBottom: 10
      }}
    >
      <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
        <Typography.Text>{title}</Typography.Text>
        {subtitle ? (
          <Typography.Paragraph
            type="secondary"
            style={{ marginBottom: 0, marginTop: 2, fontSize: 12 }}
          >
            {subtitle}
          </Typography.Paragraph>
        ) : null}
      </div>
      <Switch
        checked={checked}
        loading={loading}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

export function NotificationSettingsPanel() {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const [settings, setSettings] = useState<UserNotificationSettings | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<
    keyof UserNotificationSettings | null
  >(null);
  const { status: browserPermission, request: requestBrowserPermission } =
    useBrowserNotificationStatus();

  const messageRef = useRef(message);
  messageRef.current = message;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getNotificationSettings()
      .then(result => {
        if (cancelled) return;
        if (result?.data) {
          setSettings(result.data);
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
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Mount-only fetch by design; locale changes must not refetch.
  }, []);

  const previewOptions = useMemo(
    () => [
      {
        value: "full" as NotificationPreviewMode,
        label: t("me.notificationsPage.previewFull.title"),
        description: t("me.notificationsPage.previewFull.subtitle")
      },
      {
        value: "sender" as NotificationPreviewMode,
        label: t("me.notificationsPage.previewSender.title"),
        description: t("me.notificationsPage.previewSender.subtitle")
      },
      {
        value: "hidden" as NotificationPreviewMode,
        label: t("me.notificationsPage.previewHidden.title"),
        description: t("me.notificationsPage.previewHidden.subtitle")
      }
    ],
    [t]
  );

  async function applyPatch(
    pendingMarker: keyof UserNotificationSettings,
    patch: UpdateUserNotificationSettingsRequest,
    optimistic: Partial<UserNotificationSettings>
  ) {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, ...optimistic });
    setPendingKey(pendingMarker);
    try {
      const result = await updateNotificationSettings(patch);
      if (result?.data) {
        setSettings(prev => (prev ? { ...prev, ...result.data } : result.data));
      }
    } catch (error) {
      setSettings(previous);
      void message.error(
        getReadableErrorMessage(error, t("settings.notifications.saveFailed"))
      );
    } finally {
      setPendingKey(null);
    }
  }

  function handleBoolean(key: keyof UserNotificationSettings, next: boolean) {
    void applyPatch(
      key,
      { [key]: next } as UpdateUserNotificationSettingsRequest,
      { [key]: next } as Partial<UserNotificationSettings>
    );
  }

  function handlePreviewMode(next: NotificationPreviewMode) {
    void applyPatch(
      "preview_mode",
      { preview_mode: next },
      { preview_mode: next }
    );
  }

  function handleQuietTime(
    key: "quiet_hours_start" | "quiet_hours_end",
    value: Dayjs | null
  ) {
    if (!value) return;
    const formatted = value.format(TIME_FORMAT);
    void applyPatch(
      key,
      { [key]: formatted } as UpdateUserNotificationSettingsRequest,
      { [key]: formatted } as Partial<UserNotificationSettings>
    );
  }

  if (loading || !settings) {
    return (
      <div className="im-settings-card im-settings-form-card">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  const groupOff = !settings.group_messages_enabled;
  const quietOff = !settings.quiet_hours_enabled;

  const showPermissionBanner =
    browserPermission === "denied" || browserPermission === "default";

  function showBrowserHelpModal() {
    modal.info({
      title: t("settings.notifications.permissionBanner.helpTitle"),
      content: t("settings.notifications.permissionBanner.helpBody"),
      okText: t("settings.notifications.permissionBanner.helpClose")
    });
  }

  function renderPermissionBanner() {
    if (!showPermissionBanner) return null;
    const isDenied = browserPermission === "denied";
    const title = t(
      isDenied
        ? "settings.notifications.permissionBanner.deniedTitle"
        : "settings.notifications.permissionBanner.defaultTitle"
    );
    const sub = t(
      isDenied
        ? "settings.notifications.permissionBanner.deniedSub"
        : "settings.notifications.permissionBanner.defaultSub"
    );
    const actionLabel = t(
      isDenied
        ? "settings.notifications.permissionBanner.deniedAction"
        : "settings.notifications.permissionBanner.defaultAction"
    );
    const handleAction = isDenied
      ? showBrowserHelpModal
      : () => void requestBrowserPermission();
    return (
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16, borderRadius: 12 }}
        message={<Typography.Text strong>{title}</Typography.Text>}
        description={
          <Typography.Paragraph
            type="secondary"
            style={{ marginBottom: 0, fontSize: 12 }}
          >
            {sub}
          </Typography.Paragraph>
        }
        action={
          <button
            type="button"
            onClick={handleAction}
            style={{
              border: "none",
              background: "#F59E0B",
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 8,
              cursor: "pointer"
            }}
            data-testid="notification-permission-action"
          >
            {actionLabel}
          </button>
        }
      />
    );
  }

  return (
    <div>
      {renderPermissionBanner()}
      {/* ① 提醒方式 */}
      <SectionCard title={t("settings.notifications.sections.alerts")}>
        <div className="im-settings-info-rows">
          <SwitchRow
            title={t("me.notificationsPage.messages.title")}
            subtitle={t("me.notificationsPage.messages.subtitle")}
            checked={settings.messages_enabled}
            loading={pendingKey === "messages_enabled"}
            onChange={next => handleBoolean("messages_enabled", next)}
          />
          <SwitchRow
            title={t("me.notificationsPage.calls.title")}
            subtitle={t("me.notificationsPage.calls.subtitle")}
            checked={settings.calls_enabled}
            loading={pendingKey === "calls_enabled"}
            onChange={next => handleBoolean("calls_enabled", next)}
          />
          <SwitchRow
            title={t("me.notificationsPage.sound.title")}
            subtitle={t("me.notificationsPage.sound.subtitle")}
            checked={settings.sound_enabled}
            loading={pendingKey === "sound_enabled"}
            onChange={next => handleBoolean("sound_enabled", next)}
          />
          <SwitchRow
            title={t("me.notificationsPage.banner.title")}
            subtitle={t("me.notificationsPage.banner.subtitle")}
            checked={settings.in_app_banner_enabled}
            loading={pendingKey === "in_app_banner_enabled"}
            onChange={next => handleBoolean("in_app_banner_enabled", next)}
          />
          <SwitchRow
            title={t("me.notificationsPage.groups.title")}
            subtitle={t("me.notificationsPage.groups.subtitle")}
            checked={settings.group_messages_enabled}
            loading={pendingKey === "group_messages_enabled"}
            onChange={next => handleBoolean("group_messages_enabled", next)}
          />
          <SwitchRow
            title={t("me.notificationsPage.mention.title")}
            subtitle={
              groupOff
                ? t("settings.notifications.mentionOnlyHint")
                : t("me.notificationsPage.mention.subtitle")
            }
            checked={settings.mention_only}
            loading={pendingKey === "mention_only"}
            disabled={groupOff}
            onChange={next => handleBoolean("mention_only", next)}
          />
        </div>
      </SectionCard>

      {/* ② 通知内容 */}
      <SectionCard title={t("settings.notifications.sections.content")}>
        <Radio.Group
          value={settings.preview_mode}
          onChange={e =>
            handlePreviewMode(e.target.value as NotificationPreviewMode)
          }
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          {previewOptions.map(opt => (
            <Radio key={opt.value} value={opt.value}>
              <div style={{ display: "inline-flex", flexDirection: "column" }}>
                <Typography.Text>{opt.label}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {opt.description}
                </Typography.Text>
              </div>
            </Radio>
          ))}
        </Radio.Group>
      </SectionCard>

      {/* ③ 免打扰 */}
      <SectionCard title={t("settings.notifications.sections.quiet")}>
        <div className="im-settings-info-rows">
          <SwitchRow
            title={t("me.notificationsPage.quiet.title")}
            subtitle={t("me.notificationsPage.quiet.subtitle")}
            checked={settings.quiet_hours_enabled}
            loading={pendingKey === "quiet_hours_enabled"}
            onChange={next => handleBoolean("quiet_hours_enabled", next)}
          />
          <div
            className="im-settings-info-row"
            style={{
              opacity: quietOff ? 0.55 : 1,
              alignItems: "center",
              paddingTop: 10,
              paddingBottom: 10
            }}
          >
            <div style={{ flex: 1 }}>
              <Typography.Text>
                {t("me.notificationsPage.quietStart")} /{" "}
                {t("me.notificationsPage.quietEnd")}
              </Typography.Text>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TimePicker
                value={dayjs(settings.quiet_hours_start, TIME_FORMAT)}
                format={TIME_FORMAT}
                minuteStep={5}
                allowClear={false}
                disabled={quietOff}
                onChange={value => handleQuietTime("quiet_hours_start", value)}
              />
              <Typography.Text type="secondary">~</Typography.Text>
              <TimePicker
                value={dayjs(settings.quiet_hours_end, TIME_FORMAT)}
                format={TIME_FORMAT}
                minuteStep={5}
                allowClear={false}
                disabled={quietOff}
                onChange={value => handleQuietTime("quiet_hours_end", value)}
              />
            </div>
          </div>
          <SwitchRow
            title={t("me.notificationsPage.quietAllowMentions")}
            checked={settings.quiet_hours_allow_mentions}
            loading={pendingKey === "quiet_hours_allow_mentions"}
            disabled={quietOff}
            onChange={next => handleBoolean("quiet_hours_allow_mentions", next)}
          />
          <SwitchRow
            title={t("me.notificationsPage.quietAllowCalls")}
            checked={settings.quiet_hours_allow_calls}
            loading={pendingKey === "quiet_hours_allow_calls"}
            disabled={quietOff}
            onChange={next => handleBoolean("quiet_hours_allow_calls", next)}
          />
        </div>
      </SectionCard>
    </div>
  );
}
