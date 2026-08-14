import { Alert, App, Button, Form, Input } from "antd";
import {
  LockOutlined,
  MessageOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
  SmileOutlined,
  UserOutlined
} from "@ant-design/icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { scheduleProactiveTokenRefresh } from "../http";
import { login, profile, register } from "../http/api";
import type { LoginUser } from "../types/user";
import type { DeviceRegistrationPayload } from "@mushroom/shared";
import {
  NICKNAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  USERNAME_MAX_LENGTH
} from "@mushroom/shared";
import { normalizeAvatarUrl } from "../utils/display";
import { getReadableErrorMessage } from "../utils/errorMessage";
import { parseJwt, saveTokens } from "../utils/token";
import mushroomLogo from "../assets/mushroom-logo.svg";
import "../styles/login.css";

type AuthTab = "login" | "register";
type AuthMethod = "account" | "phone";

const CODE_RESEND_SECONDS = 60;

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
  const [authMethod, setAuthMethod] = useState<AuthMethod>("account");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [codeRemaining, setCodeRemaining] = useState(0);

  const isLogin = activeTab === "login";

  useEffect(() => {
    if (codeRemaining <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setCodeRemaining(current => current - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [codeRemaining]);

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setAuthError("");
  };

  const switchMethod = (method: AuthMethod) => {
    setAuthMethod(method);
    setAuthError("");
  };

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

  // 手机号/验证码登录的后端链路尚未接入：点击提交或获取验证码时给出提示
  // （与移动端 AuthScreen 行为保持一致）。
  const handlePhoneUnavailable = () => {
    void message.info(t("auth.phoneMethodUnavailable"));
  };

  const handleSendCode = () => {
    handlePhoneUnavailable();
    setCodeRemaining(CODE_RESEND_SECONDS);
  };

  const handleSubmit = (values: {
    username?: string;
    password?: string;
    nickname?: string;
    confirmPassword?: string;
    phone?: string;
    code?: string;
  }) => {
    if (authMethod === "phone") {
      handlePhoneUnavailable();
      return;
    }
    if (isLogin) {
      return handleLogin(values as { username: string; password: string });
    }
    return handleRegister(
      values as {
        username: string;
        nickname?: string;
        password: string;
        confirmPassword: string;
      }
    );
  };

  const renderFields = () => {
    if (authMethod === "phone") {
      return isLogin ? (
        <>
          <Form.Item name="phone">
            <Input
              classNames={{ root: "im-auth-field" }}
              prefix={
                <>
                  <MobileOutlined />
                  <span className="im-auth-phone-prefix">+86</span>
                </>
              }
              placeholder={t("auth.phonePlaceholder")}
              maxLength={PHONE_MAX_LENGTH}
            />
          </Form.Item>
          <Form.Item name="code">
            <Input
              classNames={{ root: "im-auth-field" }}
              prefix={<MessageOutlined />}
              placeholder={t("auth.codePlaceholder")}
              maxLength={6}
              suffix={
                <button
                  type="button"
                  className="im-auth-code-btn"
                  disabled={codeRemaining > 0}
                  onClick={handleSendCode}
                >
                  {codeRemaining > 0
                    ? t("auth.codeCountdown", { seconds: codeRemaining })
                    : t("auth.sendCode")}
                </button>
              }
            />
          </Form.Item>
        </>
      ) : (
        <>
          <Form.Item name="phone">
            <Input
              classNames={{ root: "im-auth-field" }}
              prefix={
                <>
                  <MobileOutlined />
                  <span className="im-auth-phone-prefix">+86</span>
                </>
              }
              placeholder={t("auth.phonePlaceholder")}
              maxLength={PHONE_MAX_LENGTH}
            />
          </Form.Item>
          <Form.Item name="code">
            <Input
              classNames={{ root: "im-auth-field" }}
              prefix={<MessageOutlined />}
              placeholder={t("auth.codePlaceholder")}
              maxLength={6}
              suffix={
                <button
                  type="button"
                  className="im-auth-code-btn"
                  disabled={codeRemaining > 0}
                  onClick={handleSendCode}
                >
                  {codeRemaining > 0
                    ? t("auth.codeCountdown", { seconds: codeRemaining })
                    : t("auth.sendCode")}
                </button>
              }
            />
          </Form.Item>
          <Form.Item name="nickname">
            <Input
              classNames={{ root: "im-auth-field" }}
              prefix={<SmileOutlined />}
              placeholder={t("auth.nickname")}
              maxLength={NICKNAME_MAX_LENGTH}
            />
          </Form.Item>
          <Form.Item name="password">
            <Input.Password
              classNames={{ root: "im-auth-field" }}
              prefix={<LockOutlined />}
              placeholder={t("auth.password")}
              maxLength={PASSWORD_MAX_LENGTH}
            />
          </Form.Item>
        </>
      );
    }

    return isLogin ? (
      <>
        <Form.Item
          name="username"
          rules={[
            {
              required: true,
              message: t("auth.validation.usernameRequired")
            }
          ]}
        >
          <Input
            classNames={{ root: "im-auth-field" }}
            prefix={<UserOutlined />}
            placeholder={t("auth.username")}
            autoComplete="username"
          />
        </Form.Item>
        <Form.Item
          name="password"
          rules={[
            {
              required: true,
              message: t("auth.validation.passwordRequired")
            }
          ]}
        >
          <Input.Password
            classNames={{ root: "im-auth-field" }}
            prefix={<LockOutlined />}
            placeholder={t("auth.password")}
            autoComplete="current-password"
          />
        </Form.Item>
      </>
    ) : (
      <>
        <Form.Item
          name="nickname"
          rules={[
            {
              max: NICKNAME_MAX_LENGTH,
              message: t("auth.validation.nicknameTooLong")
            }
          ]}
        >
          <Input
            classNames={{ root: "im-auth-field" }}
            prefix={<SmileOutlined />}
            placeholder={t("auth.nickname")}
            maxLength={NICKNAME_MAX_LENGTH}
          />
        </Form.Item>
        <Form.Item
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
          <Input
            classNames={{ root: "im-auth-field" }}
            prefix={<UserOutlined />}
            placeholder={t("auth.username")}
            autoComplete="username"
            maxLength={USERNAME_MAX_LENGTH}
          />
        </Form.Item>
        <Form.Item
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
          <Input.Password
            classNames={{ root: "im-auth-field" }}
            prefix={<LockOutlined />}
            placeholder={t("auth.password")}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
          />
        </Form.Item>
        <Form.Item
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
          <Input.Password
            classNames={{ root: "im-auth-field" }}
            prefix={<SafetyCertificateOutlined />}
            placeholder={t("auth.confirmPassword")}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
          />
        </Form.Item>
      </>
    );
  };

  return (
    <div className="im-auth-root">
      <div className="im-auth-decor" aria-hidden="true">
        <div className="im-auth-arc-back" />
        <div className="im-auth-arc-mid" />
        <div className="im-auth-arc-front" />
        <div className="im-auth-ring im-auth-ring-large" />
        <div className="im-auth-ring im-auth-ring-medium" />
        <div className="im-auth-bubble">
          <div className="im-auth-bubble-tail" />
        </div>
        <div className="im-auth-outline-wrap">
          <div className="im-auth-outline-box">
            <div className="im-auth-outline" />
            <div className="im-auth-outline-tail" />
          </div>
          <div className="im-auth-outline-dot" />
        </div>
        <div className="im-auth-dot" />
      </div>

      <div className="im-auth-scroll">
        <div className="im-auth-logo-wrap">
          <img className="im-auth-logo" src={mushroomLogo} alt="Mushroom" />
        </div>

        <div className="im-auth-card">
          <div className="im-auth-card-header">
            <h2 className="im-auth-card-title">
              {isLogin ? t("auth.login") : t("auth.register")}
            </h2>
            <p className="im-auth-card-subtitle">
              {isLogin ? t("auth.loginSubtitle") : t("auth.registerSubtitle")}
            </p>
          </div>

          <div className="im-auth-methods">
            <button
              type="button"
              className={`im-auth-method-btn ${
                authMethod === "account" ? "im-auth-method-btn-active" : ""
              }`}
              onClick={() => switchMethod("account")}
            >
              {t("auth.methodAccount")}
            </button>
            <button
              type="button"
              className={`im-auth-method-btn ${
                authMethod === "phone" ? "im-auth-method-btn-active" : ""
              }`}
              onClick={() => switchMethod("phone")}
            >
              {t("auth.methodPhone")}
            </button>
          </div>

          {!isElectron ? (
            <Alert
              className="im-auth-alert"
              type="info"
              showIcon
              message={t("auth.browserModeLimited")}
              description={t("auth.browserModeLimitedDescription")}
            />
          ) : null}
          {authError ? (
            <Alert
              className="im-auth-alert"
              type="error"
              showIcon
              message={authError}
            />
          ) : null}

          <Form
            key={`${activeTab}-${authMethod}`}
            className="im-auth-form"
            layout="vertical"
            onFinish={handleSubmit}
            autoComplete="off"
            validateTrigger={["onBlur", "onChange"]}
          >
            {renderFields()}
            <Button
              className="im-auth-submit"
              type="primary"
              htmlType="submit"
              loading={submitting}
              disabled={submitting}
            >
              {isLogin ? t("auth.login") : t("auth.register")}
            </Button>
          </Form>

          <div className="im-auth-mode-toggle">
            <span className="im-auth-mode-hint">
              {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}
            </span>
            <button
              type="button"
              className="im-auth-mode-link"
              onClick={() => switchTab(isLogin ? "register" : "login")}
            >
              {isLogin ? t("auth.register") : t("auth.login")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
