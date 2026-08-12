import {
  Avatar,
  Button,
  ConfigProvider,
  DatePicker,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  message
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  UpdateUserProfileRequest,
  UserDevicesResponse,
  UserManagedDevice
} from "@mushroom/shared";
import {
  EMAIL_MAX_LENGTH,
  NICKNAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  SIGNATURE_MAX_LENGTH
} from "@mushroom/shared";
import {
  disableDevice,
  getDevices,
  logoutAllDevices,
  logoutDevice,
  restoreDevice,
  uploadAvatar,
  changePassword
} from "../../http/api";
import type { LoginUser } from "../../types/user";
import { normalizeAvatarUrl } from "../../utils/display";
import { getReadableErrorMessage } from "../../utils/errorMessage";
import { formatDateTimeProfile } from "../../utils/date";
import log from "../../utils/log";

const sessionLog = log.scope("session");

export interface ProfileSettingsPanelProps {
  open: boolean;
  activeSection: ProfileSection;
  loginUser: LoginUser | null;
  sessionSummary: {
    is_online?: boolean;
    active_device_count?: number;
    last_active_at?: string | null;
    last_login_at?: string | null;
  } | null;
  saving: boolean;
  onCancel: () => void;
  onRefreshSession: () => Promise<void>;
  onSubmit: (patch: UpdateUserProfileRequest) => Promise<void>;
  onForceLogout: () => Promise<void> | void;
}

export type ProfileSection = "profile" | "devices";
type ProfileFormValues = {
  nickname: string;
  signature: string;
  email: string;
  phone: string;
  gender: number;
  birthday: Dayjs | null;
};

function getDeviceTypeLabel(deviceType: number, t: (key: string) => string) {
  switch (Number(deviceType)) {
    case 1:
      return t("profile.deviceTypes.browser");
    case 2:
      return t("profile.deviceTypes.desktop");
    case 3:
      return t("profile.deviceTypes.mobile");
    case 9:
      return t("profile.deviceTypes.other");
    default:
      return t("profile.deviceTypes.unknown");
  }
}

function renderDeviceStatus(
  device: UserManagedDevice,
  t: (key: string) => string
) {
  if (device.status === 2) {
    return (
      <Tag color="default">{t("profile.security.actions.logoutDevice")}</Tag>
    );
  }
  if (device.status === 0) {
    return <Tag color="error">{t("profile.devices.disableAction")}</Tag>;
  }
  if (device.is_online) {
    return <Tag color="green">{t("profile.summary.online")}</Tag>;
  }
  return <Tag color="blue">{t("common.ready")}</Tag>;
}

export function ProfileSettingsPanel({
  open,
  activeSection,
  loginUser,
  sessionSummary,
  saving,
  onCancel,
  onRefreshSession,
  onSubmit,
  onForceLogout
}: ProfileSettingsPanelProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm<ProfileFormValues>();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string>();
  const [avatarPendingFile, setAvatarPendingFile] = useState<File | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesData, setDevicesData] = useState<UserDevicesResponse | null>(
    null
  );
  const [deviceActionKey, setDeviceActionKey] = useState<string | null>(null);
  const [bulkActionKey, setBulkActionKey] = useState<
    "logout-others" | "logout-all" | null
  >(null);
  const [passwordForm] = Form.useForm<{
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }>();
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (!loginUser) {
      return;
    }

    setAvatarPendingFile(null);
    setAvatarDraftUrl(normalizeAvatarUrl(loginUser.avatar));

    if (!open) {
      return;
    }

    form.setFieldsValue({
      nickname: loginUser.nickname,
      signature: loginUser.signature ?? "",
      email: loginUser.email ?? "",
      phone: loginUser.phone ?? "",
      gender: loginUser.gender ?? 0,
      birthday: loginUser.birthday ? dayjs(loginUser.birthday) : null
    });
  }, [form, loginUser, open]);

  useEffect(() => {
    return () => {
      if (avatarDraftUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarDraftUrl);
      }
    };
  }, [avatarDraftUrl]);

  const refreshDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const [devicesResult] = await Promise.all([
        getDevices(),
        onRefreshSession()
      ]);
      setDevicesData(devicesResult.data);
    } catch (error) {
      message.error(
        getReadableErrorMessage(error, t("profile.devices.refreshFailed"))
      );
    } finally {
      setDevicesLoading(false);
    }
  }, [onRefreshSession, t]);

  useEffect(() => {
    if (!open || activeSection !== "devices") {
      return;
    }

    void refreshDevices();
  }, [activeSection, open, refreshDevices]);

  const sortedDevices = useMemo(() => {
    return [...(devicesData?.devices ?? [])].sort((a, b) => {
      if (a.is_current_device !== b.is_current_device) {
        return a.is_current_device ? -1 : 1;
      }
      if (a.is_online !== b.is_online) {
        return a.is_online ? -1 : 1;
      }
      return (
        new Date(b.last_seen_at ?? b.last_login_at ?? 0).getTime() -
        new Date(a.last_seen_at ?? a.last_login_at ?? 0).getTime()
      );
    });
  }, [devicesData]);

  const handleLogoutSingleDevice = useCallback(
    async (device: UserManagedDevice) => {
      sessionLog.info("logout device requested", {
        deviceId: device.device_id,
        isCurrent: device.is_current_device
      });
      setDeviceActionKey(device.device_id);
      try {
        if (device.is_current_device) {
          // 退出当前设备的所有交互（确认弹窗 + 是否清本地数据 +
          // 调 logoutCurrent + 本地清理 + 关 DB + 重建 anon 窗口）
          // 全部交给 App.handleLogout 内的 confirmLogout 流程统一处理，
          // 避免「设备列表 Popconfirm」与「confirmLogout」两次弹窗
          // 让用户感到点了第一次就已经退出。
          await onForceLogout();
          return;
        }

        await logoutDevice({ device_id: device.device_id });
        sessionLog.info("logout device done", { deviceId: device.device_id });
        message.success(t("profile.devices.logoutDeviceSuccess"));
        await refreshDevices();
      } catch (error) {
        sessionLog.warn("logout device failed", {
          deviceId: device.device_id,
          err: error instanceof Error ? error.message : String(error)
        });
        message.error(
          getReadableErrorMessage(error, t("profile.devices.logoutFailed"))
        );
      } finally {
        setDeviceActionKey(null);
      }
    },
    [onForceLogout, refreshDevices, t]
  );

  const handleLogoutOthers = useCallback(async () => {
    sessionLog.info("logout others requested");
    setBulkActionKey("logout-others");
    try {
      const result = await logoutAllDevices({ keep_current: 1 });
      sessionLog.info("logout others done", {
        revokedCount: result.data.revoked_count
      });
      message.success(
        result.data.revoked_count > 0
          ? t("profile.devices.logoutOthersSuccess", {
              count: result.data.revoked_count
            })
          : t("profile.devices.noOtherDevices")
      );
      await refreshDevices();
    } catch (error) {
      sessionLog.warn("logout others failed", {
        err: error instanceof Error ? error.message : String(error)
      });
      message.error(
        getReadableErrorMessage(error, t("profile.devices.logoutOthersFailed"))
      );
    } finally {
      setBulkActionKey(null);
    }
  }, [refreshDevices, t]);

  const handleLogoutAll = useCallback(async () => {
    sessionLog.info("logout all requested");
    setBulkActionKey("logout-all");
    try {
      await logoutAllDevices({ keep_current: 0 });
      sessionLog.info("logout all done");
      message.success(t("profile.devices.logoutAllSuccess"));
      await onForceLogout();
    } catch (error) {
      sessionLog.warn("logout all failed", {
        err: error instanceof Error ? error.message : String(error)
      });
      message.error(
        getReadableErrorMessage(error, t("profile.devices.logoutAllFailed"))
      );
    } finally {
      setBulkActionKey(null);
    }
  }, [onForceLogout, t]);

  const handleDisableDevice = useCallback(
    async (device: UserManagedDevice) => {
      sessionLog.info("disable device requested", {
        deviceId: device.device_id,
        isCurrent: device.is_current_device
      });
      setDeviceActionKey(`disable:${device.device_id}`);
      try {
        await disableDevice({ device_id: device.device_id });
        sessionLog.info("disable device done", { deviceId: device.device_id });
        message.success(t("profile.devices.disableSuccess"));
        if (device.is_current_device) {
          await onForceLogout();
          return;
        }
        await refreshDevices();
      } catch (error) {
        sessionLog.warn("disable device failed", {
          deviceId: device.device_id,
          err: error instanceof Error ? error.message : String(error)
        });
        message.error(
          getReadableErrorMessage(error, t("profile.devices.disableFailed"))
        );
      } finally {
        setDeviceActionKey(null);
      }
    },
    [onForceLogout, refreshDevices, t]
  );

  const handleRestoreDevice = useCallback(
    async (device: UserManagedDevice) => {
      sessionLog.info("restore device requested", {
        deviceId: device.device_id
      });
      setDeviceActionKey(`restore:${device.device_id}`);
      try {
        await restoreDevice({ device_id: device.device_id });
        sessionLog.info("restore device done", { deviceId: device.device_id });
        message.success(t("profile.devices.restoreSuccess"));
        await refreshDevices();
      } catch (error) {
        sessionLog.warn("restore device failed", {
          deviceId: device.device_id,
          err: error instanceof Error ? error.message : String(error)
        });
        message.error(
          getReadableErrorMessage(error, t("profile.devices.restoreFailed"))
        );
      } finally {
        setDeviceActionKey(null);
      }
    },
    [refreshDevices, t]
  );

  const handleChangePassword = useCallback(async () => {
    try {
      await passwordForm.validateFields();
    } catch {
      return;
    }
    const values = passwordForm.getFieldsValue();
    setPasswordSaving(true);
    try {
      await changePassword({
        current_password: values.currentPassword,
        new_password: values.newPassword
      });
      message.success(t("profile.changePassword.success"));
      passwordForm.resetFields();
    } catch (error) {
      message.error(
        getReadableErrorMessage(error, t("profile.changePassword.failed"))
      );
    } finally {
      setPasswordSaving(false);
    }
  }, [passwordForm, t]);

  return (
    <div className="im-profile-content">
      <div className="im-profile-main" hidden={activeSection !== "profile"}>
        <div className="im-profile-overview">
          <div className="im-profile-hero-card im-profile-hero-card-compact">
            <Avatar src={avatarDraftUrl} size={80}>
              {(loginUser?.nickname || loginUser?.username || "U").charAt(0)}
            </Avatar>
            <div className="im-profile-hero-subtitle">
              @{loginUser?.username || "user"}
            </div>
            <div className="im-profile-hero-actions">
              <input
                ref={avatarInputRef}
                className="im-profile-avatar-input"
                type="file"
                accept="image/*"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) {
                    return;
                  }

                  if (avatarDraftUrl?.startsWith("blob:")) {
                    URL.revokeObjectURL(avatarDraftUrl);
                  }

                  setAvatarPendingFile(file);
                  setAvatarDraftUrl(URL.createObjectURL(file));
                  message.success(t("profile.avatarSelected"));
                }}
              />
              <Button
                className="im-profile-hero-button"
                loading={uploadingAvatar}
                onClick={() => avatarInputRef.current?.click()}
              >
                {t("profile.changeAvatar")}
              </Button>
            </div>
          </div>

          <div className="im-profile-summary-grid im-profile-summary-grid-compact">
            <div className="im-profile-summary-card">
              <span className="im-profile-summary-label">
                {t("profile.summary.username")}
              </span>
              <span className="im-profile-summary-value">
                {loginUser?.username || "-"}
              </span>
            </div>
            <div className="im-profile-summary-card">
              <span className="im-profile-summary-label">
                {t("profile.summary.onlineStatus")}
              </span>
              <div className="im-profile-summary-value-wrap">
                <Tag color={sessionSummary?.is_online ? "green" : "default"}>
                  {sessionSummary?.is_online
                    ? t("profile.summary.online")
                    : t("profile.summary.offline")}
                </Tag>
                <span className="im-profile-summary-subvalue">
                  {t("profile.summary.activeDevices", {
                    count: sessionSummary?.active_device_count ?? 0
                  })}
                </span>
                <Button
                  size="small"
                  type="link"
                  onClick={() => void onRefreshSession()}
                >
                  {t("common.refresh")}
                </Button>
              </div>
            </div>
            <div className="im-profile-summary-card">
              <span className="im-profile-summary-label">
                {t("profile.summary.recentActive")}
              </span>
              <span className="im-profile-summary-value">
                {formatDateTimeProfile(sessionSummary?.last_active_at)}
              </span>
            </div>
            <div className="im-profile-summary-card">
              <span className="im-profile-summary-label">
                {t("profile.summary.recentLogin")}
              </span>
              <span className="im-profile-summary-value">
                {formatDateTimeProfile(sessionSummary?.last_login_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="im-profile-form-card">
          <div className="im-profile-section-head">
            <div className="im-profile-section-title">
              {t("profile.basic.title")}
            </div>
          </div>

          <Form
            form={form}
            layout="vertical"
            className="im-profile-form"
            onFinish={async values => {
              let nextAvatarUrl = normalizeAvatarUrl(loginUser?.avatar);

              if (avatarPendingFile) {
                setUploadingAvatar(true);
                try {
                  const uploaded = await uploadAvatar(avatarPendingFile);
                  nextAvatarUrl = normalizeAvatarUrl(
                    uploaded.large || uploaded.medium || uploaded.original
                  );
                } catch (error) {
                  message.error(
                    getReadableErrorMessage(
                      error,
                      t("profile.avatarUploadFailed")
                    )
                  );
                  setUploadingAvatar(false);
                  return;
                }
              }

              try {
                await onSubmit({
                  ...values,
                  email: values.email?.trim() || undefined,
                  phone: values.phone?.trim() || undefined,
                  birthday: values.birthday
                    ? values.birthday.format("YYYY-MM-DD")
                    : undefined,
                  signature: values.signature?.trim() || undefined,
                  avatar_url: nextAvatarUrl
                });
                setAvatarPendingFile(null);
                setAvatarDraftUrl(nextAvatarUrl);
              } finally {
                setUploadingAvatar(false);
              }
            }}
          >
            <div className="im-profile-form-grid">
              <Form.Item
                label={t("profile.basic.nickname")}
                name="nickname"
                rules={[
                  {
                    required: true,
                    message: t("profile.basic.nicknameRequired")
                  }
                ]}
              >
                <Input
                  maxLength={NICKNAME_MAX_LENGTH}
                  placeholder={t("profile.basic.nicknamePlaceholder")}
                />
              </Form.Item>
              <Form.Item label={t("me.email")} name="email">
                <Input
                  maxLength={EMAIL_MAX_LENGTH}
                  placeholder={t("me.email")}
                />
              </Form.Item>
              <Form.Item label={t("me.phone")} name="phone">
                <Input
                  maxLength={PHONE_MAX_LENGTH}
                  placeholder={t("me.phone")}
                />
              </Form.Item>
              <Form.Item label={t("me.gender")} name="gender">
                <Select
                  options={[
                    {
                      value: 0,
                      label: t("contacts.profileGenderUnknown")
                    },
                    { value: 1, label: t("contacts.profileGenderMale") },
                    {
                      value: 2,
                      label: t("contacts.profileGenderFemale")
                    }
                  ]}
                />
              </Form.Item>
              <Form.Item label={t("me.birthdayPlaceholder")} name="birthday">
                <DatePicker className="im-profile-date-picker" />
              </Form.Item>
              <Form.Item
                className="im-profile-form-item-wide"
                label={t("profile.basic.signature")}
                name="signature"
              >
                <Input.TextArea
                  maxLength={SIGNATURE_MAX_LENGTH}
                  placeholder={t("profile.basic.signaturePlaceholder")}
                  rows={3}
                />
              </Form.Item>
            </div>
          </Form>

          <Space className="im-profile-form-actions" wrap>
            <Button className="im-bordered-button" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button
              className="im-profile-save-button"
              type="primary"
              onClick={() => void form.submit()}
              loading={saving || uploadingAvatar}
            >
              {t("common.save")}
            </Button>
          </Space>
        </div>
      </div>

      {activeSection === "devices" ? (
        <ConfigProvider wave={{ disabled: true }}>
          <div className="im-device-panel">
            <div className="im-device-section-card">
              <div className="im-device-section-head im-device-section-head-actions">
                <Space wrap>
                  <Button
                    className="im-bordered-button"
                    onClick={() => void refreshDevices()}
                    disabled={devicesLoading}
                  >
                    {t("profile.devices.refresh")}
                  </Button>
                  <Popconfirm
                    title={t("profile.devices.confirmLogoutOthersTitle")}
                    description={t(
                      "profile.devices.confirmLogoutOthersDescription"
                    )}
                    okText={t("profile.devices.confirmLogoutOthersOk")}
                    cancelText={t("common.cancel")}
                    onConfirm={() => void handleLogoutOthers()}
                  >
                    <Button
                      className="im-bordered-button"
                      disabled={bulkActionKey === "logout-others"}
                    >
                      {t("profile.devices.logoutOthers")}
                    </Button>
                  </Popconfirm>
                  <Popconfirm
                    title={t("profile.devices.confirmLogoutAllTitle")}
                    description={t(
                      "profile.devices.confirmLogoutAllDescription"
                    )}
                    okText={t("profile.devices.confirmLogoutAllOk")}
                    cancelText={t("common.cancel")}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void handleLogoutAll()}
                  >
                    <Button danger disabled={bulkActionKey === "logout-all"}>
                      {t("profile.devices.logoutAll")}
                    </Button>
                  </Popconfirm>
                </Space>
              </div>

              <Spin spinning={devicesLoading}>
                <List
                  className="im-device-list"
                  dataSource={sortedDevices}
                  locale={{ emptyText: t("profile.devices.empty") }}
                  renderItem={device => (
                    <List.Item
                      className="im-device-list-item"
                      actions={
                        device.status === 1
                          ? [
                              device.is_current_device ? (
                                // 当前设备不再单独弹 Popconfirm —— 退出当前设备
                                // 的确认（含「同时清除本地聊天记录」复选框）由
                                // App.handleLogout 内的 confirmLogout 统一处理，
                                // 避免重复弹两次。
                                <Button
                                  key={`logout-${device.device_id}`}
                                  className="im-bordered-button"
                                  danger
                                  disabled={
                                    deviceActionKey === device.device_id
                                  }
                                  onClick={() =>
                                    void handleLogoutSingleDevice(device)
                                  }
                                >
                                  {t("profile.devices.logoutCurrentAction")}
                                </Button>
                              ) : (
                                <Popconfirm
                                  key={`logout-${device.device_id}`}
                                  title={t(
                                    "profile.devices.confirmLogoutOtherTitle"
                                  )}
                                  description={t(
                                    "profile.devices.confirmLogoutOtherDescription"
                                  )}
                                  okText={t(
                                    "profile.devices.confirmLogoutOthersOk"
                                  )}
                                  cancelText={t("common.cancel")}
                                  onConfirm={() =>
                                    void handleLogoutSingleDevice(device)
                                  }
                                >
                                  <Button
                                    className="im-bordered-button"
                                    disabled={
                                      deviceActionKey === device.device_id
                                    }
                                  >
                                    {t("profile.devices.logoutDeviceAction")}
                                  </Button>
                                </Popconfirm>
                              ),
                              <Popconfirm
                                key={`disable-${device.device_id}`}
                                title={t("profile.devices.confirmDisableTitle")}
                                description={t(
                                  "profile.devices.confirmDisableDescription"
                                )}
                                okText={t("profile.devices.confirmDisableOk")}
                                cancelText={t("common.cancel")}
                                okButtonProps={{ danger: true }}
                                onConfirm={() =>
                                  void handleDisableDevice(device)
                                }
                              >
                                <Button
                                  className="im-bordered-button"
                                  disabled={
                                    deviceActionKey ===
                                    `disable:${device.device_id}`
                                  }
                                >
                                  {t("profile.devices.disableAction")}
                                </Button>
                              </Popconfirm>
                            ]
                          : [
                              <Popconfirm
                                key={`restore-${device.device_id}`}
                                title={t("profile.devices.confirmRestoreTitle")}
                                description={t(
                                  "profile.devices.confirmRestoreDescription"
                                )}
                                okText={t("profile.devices.confirmRestoreOk")}
                                cancelText={t("common.cancel")}
                                onConfirm={() =>
                                  void handleRestoreDevice(device)
                                }
                              >
                                <Button
                                  type="primary"
                                  ghost
                                  disabled={
                                    deviceActionKey ===
                                    `restore:${device.device_id}`
                                  }
                                >
                                  {t("profile.devices.restoreAction")}
                                </Button>
                              </Popconfirm>
                            ]
                      }
                    >
                      <List.Item.Meta
                        title={
                          <Space wrap>
                            <span className="im-device-name">
                              {device.device_name ||
                                getDeviceTypeLabel(device.device_type, t)}
                            </span>
                            {renderDeviceStatus(device, t)}
                            <Tag>
                              {getDeviceTypeLabel(device.device_type, t)}
                            </Tag>
                            {device.is_current_device ? (
                              <Tag color="gold">
                                {t("profile.devices.currentDeviceTag")}
                              </Tag>
                            ) : null}
                          </Space>
                        }
                        description={
                          <div className="im-device-meta-grid">
                            <span>
                              <strong>{t("profile.devices.lastSeen")}：</strong>
                              {formatDateTimeProfile(device.last_seen_at)}
                            </span>
                            <span>
                              <strong>
                                {t("profile.devices.lastLogin")}：
                              </strong>
                              {formatDateTimeProfile(device.last_login_at)}
                            </span>
                            <span>
                              <strong>{t("profile.devices.ip")}：</strong>
                              {device.last_ip || "-"}
                            </span>
                            <span>
                              <strong>{t("profile.devices.version")}：</strong>
                              {device.app_version || "-"}
                            </span>
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              </Spin>
            </div>

            <div className="im-device-section-card">
              <div className="im-device-section-head">
                <h4>{t("profile.changePassword.title")}</h4>
              </div>
              <Form
                form={passwordForm}
                layout="vertical"
                style={{ maxWidth: 400, padding: "0 16px 16px" }}
                onFinish={() => void handleChangePassword()}
              >
                <Form.Item
                  label={t("profile.changePassword.currentPassword")}
                  name="currentPassword"
                  rules={[
                    {
                      required: true,
                      message: t(
                        "profile.changePassword.currentPasswordRequired"
                      )
                    }
                  ]}
                >
                  <Input.Password
                    placeholder={t(
                      "profile.changePassword.currentPasswordPlaceholder"
                    )}
                  />
                </Form.Item>
                <Form.Item
                  label={t("profile.changePassword.newPassword")}
                  name="newPassword"
                  rules={[
                    {
                      required: true,
                      message: t("profile.changePassword.newPasswordRequired")
                    },
                    {
                      min: 6,
                      message: t("profile.changePassword.newPasswordMinLength")
                    },
                    {
                      max: PASSWORD_MAX_LENGTH,
                      message: t("profile.changePassword.newPasswordMaxLength")
                    }
                  ]}
                >
                  <Input.Password
                    placeholder={t(
                      "profile.changePassword.newPasswordPlaceholder"
                    )}
                  />
                </Form.Item>
                <Form.Item
                  label={t("profile.changePassword.confirmPassword")}
                  name="confirmPassword"
                  dependencies={["newPassword"]}
                  rules={[
                    {
                      required: true,
                      message: t(
                        "profile.changePassword.confirmPasswordRequired"
                      )
                    },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue("newPassword") === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(
                          new Error(
                            t("profile.changePassword.confirmPasswordMismatch")
                          )
                        );
                      }
                    })
                  ]}
                >
                  <Input.Password
                    placeholder={t(
                      "profile.changePassword.confirmPasswordPlaceholder"
                    )}
                  />
                </Form.Item>
              </Form>
              <Space className="im-profile-form-actions" wrap>
                <Button
                  className="im-profile-save-button"
                  type="primary"
                  onClick={() => void passwordForm.submit()}
                  loading={passwordSaving}
                >
                  {t("profile.changePassword.submit")}
                </Button>
              </Space>
            </div>
          </div>
        </ConfigProvider>
      ) : null}
    </div>
  );
}

type ProfileSettingsModalProps = Omit<
  ProfileSettingsPanelProps,
  "activeSection"
>;

export function ProfileSettingsModal(props: ProfileSettingsModalProps) {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<ProfileSection>("profile");

  useEffect(() => {
    if (props.open) {
      setActiveSection("profile");
    }
  }, [props.open]);

  return (
    <Modal
      className="im-modal im-profile-panel-modal"
      title={t("profile.modalTitle")}
      open={props.open}
      onCancel={props.onCancel}
      footer={null}
      width={920}
      destroyOnHidden
      forceRender
    >
      <div className="im-profile-shell">
        <aside className="im-profile-sidebar">
          {(
            [
              ["profile", t("profile.tabs.profile")],
              ["devices", t("profile.tabs.devices")]
            ] as Array<[ProfileSection, string]>
          ).map(([key, label]) => (
            <Button
              key={key}
              className={`im-profile-nav-button ${
                activeSection === key ? "im-profile-nav-button-active" : ""
              }`}
              type="text"
              onClick={() => setActiveSection(key)}
            >
              {label}
            </Button>
          ))}
        </aside>

        <ProfileSettingsPanel {...props} activeSection={activeSection} />
      </div>
    </Modal>
  );
}
