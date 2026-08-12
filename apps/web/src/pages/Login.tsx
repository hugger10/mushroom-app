import { Alert, App, Button, Form, Input, Space, Tabs } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { scheduleProactiveTokenRefresh } from "../http";
import { login, profile, register } from "../http/api";
import type { LoginUser } from "../types/user";
import type { DeviceRegistrationPayload } from "@mushroom/shared";
import {
  NICKNAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  USERNAME_MAX_LENGTH
} from "@mushroom/shared";
import { normalizeAvatarUrl } from "../utils/display";
import { getReadableErrorMessage } from "../utils/errorMessage";
import { parseJwt, saveTokens } from "../utils/token";

type AuthTab = "login" | "register";

export function LoginPage({
  onLoginSuccess
}: {
  onLoginSuccess: (user: LoginUser) => void;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const isElectron = !!window.electronAPI;
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");

  const buildDevicePayload = async (): Promise<
    DeviceRegistrationPayload | undefined
  > => {
    const info = isElectron
      ? await window.electronAPI.getDeviceInfo()
      : undefined;
    if (!info?.deviceId) {
      return undefined;
    }

    return {
      device_id: info.deviceId,
      device_type: isElectron ? 2 : 1,
      device_name:
        info.deviceName ??
        `${navigator.platform || "unknown"} / ${navigator.userAgent.includes("Electron") ? "Electron" : "Browser"}`,
      app_version: info.appVersion || undefined,
      metadata: {
        platform: navigator.platform || null,
        user_agent: navigator.userAgent || null,
        language: navigator.language || null
      }
    };
  };

  const completeLogin = async (tokens: {
    access_token: string;
    refresh_token: string;
  }) => {
    const loginUser = parseJwt(tokens.access_token) as LoginUser;

    if (isElectron) {
      // 主进程会：init DB（写 last-login-user）→ 保存 token-<uid> /
      // refresh-token-<uid> → 销毁当前窗口并按 persist:user-<uid> 重建。
      // 窗口销毁后 renderer 的后续代码永远到不了，所以必须在这里就把
      // tokens 交给主进程；新窗口的 restoreAuth 会读出来继续登录态。
      try {
        await window.electronAPI.notifyLoginSuccess({
          userId: loginUser.userId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token
        });
      } catch (err) {
        // 主进程 DB 初始化失败（磁盘 / 迁移 / 权限）。tokens 已签发但本地
        // 数据无法打开；保留在登录页让用户重试，不进入主界面。
        console.error("notifyLoginSuccess failed", err);
        throw new Error(t("auth.localInitFailed"));
      }
      return;
    }

    await saveTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token
    });
    await scheduleProactiveTokenRefresh(tokens.access_token);
    const userInfo = await profile();
    loginUser.avatar = normalizeAvatarUrl(userInfo.data?.avatar_url);
    loginUser.nickname = userInfo.data?.nickname || loginUser.nickname;
    loginUser.email = userInfo.data?.email || "";
    loginUser.phone = userInfo.data?.phone || "";
    loginUser.gender = userInfo.data?.gender;
    loginUser.birthday = userInfo.data?.birthday || "";
    loginUser.signature = userInfo.data?.signature || "";
    onLoginSuccess(loginUser);

    navigate("/home");
  };

  const handleLogin = async (values: {
    username: string;
    password: string;
  }) => {
    setSubmitting(true);
    setAuthError("");
    try {
      const { data } = await login({
        ...values,
        device: await buildDevicePayload()
      });
      await completeLogin(data);
    } catch (error) {
      setAuthError(getReadableErrorMessage(error, t("auth.loginError")));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (values: {
    username: string;
    nickname?: string;
    password: string;
    confirmPassword: string;
  }) => {
    setSubmitting(true);
    setAuthError("");
    try {
      await register({
        username: values.username,
        password: values.password,
        nickname: values.nickname
      });
      message.success(t("auth.registerComplete"));
      const { data } = await login({
        username: values.username,
        password: values.password,
        device: await buildDevicePayload()
      });
      await completeLogin(data);
    } catch (error) {
      setAuthError(getReadableErrorMessage(error, t("auth.registerError")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 360, margin: "0 auto" }}>
      <h2>{activeTab === "login" ? t("auth.login") : t("auth.register")}</h2>
      {!isElectron ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t("auth.browserModeLimited")}
          description={t("auth.browserModeLimitedDescription")}
        />
      ) : null}
      {authError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={authError}
        />
      ) : null}
      <Tabs
        activeKey={activeTab}
        onChange={key => {
          setActiveTab(key as AuthTab);
          setAuthError("");
        }}
        items={[
          {
            key: "login",
            label: t("auth.login"),
            children: (
              <Form
                name="login"
                layout="vertical"
                onFinish={handleLogin}
                autoComplete="off"
              >
                <Form.Item
                  label={t("auth.username")}
                  name="username"
                  rules={[
                    {
                      required: true,
                      message: t("auth.validation.usernameRequired")
                    }
                  ]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={t("auth.password")}
                  name="password"
                  rules={[
                    {
                      required: true,
                      message: t("auth.validation.passwordRequired")
                    }
                  ]}
                >
                  <Input.Password />
                </Form.Item>
                <Form.Item>
                  <Space>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={submitting}
                    >
                      {t("auth.login")}
                    </Button>
                    <Button htmlType="reset" disabled={submitting}>
                      {t("common.reset")}
                    </Button>
                  </Space>
                </Form.Item>
              </Form>
            )
          },
          {
            key: "register",
            label: t("auth.register"),
            children: (
              <Form
                name="register"
                layout="vertical"
                onFinish={handleRegister}
                autoComplete="off"
              >
                <Form.Item
                  label={t("auth.username")}
                  name="username"
                  rules={[
                    {
                      required: true,
                      message: t("auth.validation.usernameRequired")
                    },
                    {
                      max: USERNAME_MAX_LENGTH,
                      message: t("auth.validation.usernameTooLong")
                    }
                  ]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={t("auth.nickname")}
                  name="nickname"
                  rules={[
                    {
                      max: NICKNAME_MAX_LENGTH,
                      message: t("auth.validation.nicknameTooLong")
                    }
                  ]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={t("auth.password")}
                  name="password"
                  rules={[
                    {
                      required: true,
                      message: t("auth.validation.passwordRequired")
                    },
                    {
                      min: 6,
                      message: t("auth.validation.passwordMin")
                    },
                    {
                      max: PASSWORD_MAX_LENGTH,
                      message: t("auth.validation.passwordTooLong")
                    }
                  ]}
                >
                  <Input.Password />
                </Form.Item>
                <Form.Item
                  label={t("auth.confirmPassword")}
                  name="confirmPassword"
                  dependencies={["password"]}
                  rules={[
                    {
                      required: true,
                      message: t("auth.confirmPassword")
                    },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue("password") === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(
                          new Error(t("auth.validation.passwordMismatch"))
                        );
                      }
                    })
                  ]}
                >
                  <Input.Password />
                </Form.Item>
                <Form.Item>
                  <Space>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={submitting}
                    >
                      {t("auth.register")}
                    </Button>
                    <Button htmlType="reset" disabled={submitting}>
                      {t("common.reset")}
                    </Button>
                  </Space>
                </Form.Item>
              </Form>
            )
          }
        ]}
      />
    </div>
  );
}
