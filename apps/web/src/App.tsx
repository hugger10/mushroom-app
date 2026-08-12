import { App as AntdApp, ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "dayjs/locale/en";
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./styles/app.css";
import { useAppLanguage } from "./i18n";
import {
  isAccessTokenExpiringSoon,
  refreshAccessToken,
  scheduleProactiveTokenRefresh,
  stopProactiveTokenRefresh
} from "./http";
import { logoutCurrent, profile } from "./http/api";
import { LoginPage } from "./pages/Login";
import { HomePage } from "./pages/Home";
import type { LoginUser } from "./types/user";
import {
  deleteTokens,
  getAccessToken,
  getRefreshToken,
  onAuthTokensChanged,
  parseJwt
} from "./utils/token";
import { normalizeAvatarUrl } from "./utils/display";
import { closeWSClient } from "./ws";
import { resetRefreshedAttachmentWebCache } from "./http/refreshedAttachmentCache";
import { resetConversationPreRefreshCache } from "./components/chat/refreshAttachmentPreflight";
import { AppThemeProvider } from "./theme";
import { useAppThemePreference } from "./theme/useAppThemePreference";
import { confirmLogout } from "./utils/logoutConfirm";
import { AppErrorBoundary } from "./components/ui/AppErrorBoundary";
import log from "./utils/log";

const sessionLog = log.scope("session");

function WebStandaloneNotice({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          background: "var(--im-surface-strong)",
          border: "1px solid var(--im-border)",
          borderRadius: 24,
          boxShadow: "var(--im-panel-shadow)",
          padding: 28
        }}
      >
        <h2 style={{ marginTop: 0 }}>{t("standalone.title")}</h2>
        <p style={{ color: "var(--im-text-soft)", lineHeight: 1.7 }}>
          {t("standalone.description")}
        </p>
        <button
          type="button"
          onClick={() => void onLogout()}
          style={{
            marginTop: 8,
            height: 40,
            padding: "0 18px",
            borderRadius: 999,
            border: "none",
            background: "var(--im-accent)",
            color: "#fff",
            cursor: "pointer"
          }}
        >
          {t("standalone.logout")}
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState<LoginUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const isElectron = !!window.electronAPI;
  const { resolvedTheme } = useAppThemePreference();
  const { language } = useAppLanguage();

  useEffect(() => {
    dayjs.locale(language === "zh-CN" ? "zh-cn" : "en");
  }, [language]);

  const antdLocale = language === "zh-CN" ? zhCN : enUS;

  useEffect(() => {
    async function restoreAuth() {
      let token = await getAccessToken();
      const refreshToken = await getRefreshToken();
      const parsedToken = token ? parseJwt(token) : null;
      if (!token && !refreshToken) {
        return;
      }

      if (
        refreshToken &&
        (!token || !parsedToken || isAccessTokenExpiringSoon(token))
      ) {
        // Route the startup refresh through the shared single-flight
        // helper so it dedupes with any in-flight 401-triggered refresh
        // and persists tokens via saveTokens (which also notifies the
        // electron main process). Calling /auth/refresh directly here
        // previously bypassed the dedupe and could race the first batch
        // of API requests, producing a 401 storm at launch.
        // Note: refreshAccessToken() internally schedules the next
        // proactive refresh on success, so we don't re-schedule below.
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          return;
        }
        token = refreshed;
      } else {
        // No refresh happened: schedule a proactive refresh against the
        // existing token so it doesn't expire mid-session.
        await scheduleProactiveTokenRefresh(token);
      }

      const payload = token ? parseJwt(token) : null;
      if (!payload) {
        return;
      }

      const baseUser = payload as LoginUser;
      setIsLoggedIn(true);
      setLoginUser(baseUser);

      try {
        const userInfo = await profile();
        setLoginUser(prev =>
          prev
            ? {
                ...prev,
                nickname: userInfo.data?.nickname || prev.nickname,
                avatar: normalizeAvatarUrl(userInfo.data?.avatar_url),
                email: userInfo.data?.email || "",
                phone: userInfo.data?.phone || "",
                gender: userInfo.data?.gender,
                birthday: userInfo.data?.birthday || "",
                signature: userInfo.data?.signature || ""
              }
            : prev
        );
      } catch {
        return;
      }
    }

    void restoreAuth().finally(() => {
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    return onAuthTokensChanged(detail => {
      if (!detail.accessToken && !detail.refreshToken) {
        closeWSClient();
        stopProactiveTokenRefresh();
        // 清空附件相关进程内缓存，避免跨账号 upload_id 残留导致破图 /
        // 误判 TTL 跳过预刷新。无论是手动 logout 还是 401 强制 logout
        // 最终都会到达这里。
        resetConversationPreRefreshCache();
        resetRefreshedAttachmentWebCache();
        setIsLoggedIn(false);
        setLoginUser(null);
      }
    });
  }, []);

  const handleLogout = async () => {
    const isElectronRuntime = !!window.electronAPI;
    sessionLog.info("logout requested", { isElectronRuntime });

    // Electron 端弹「☐ 同时清除本地聊天记录」复选框；纯浏览器分支保持旧行为。
    let wipeLocalData = false;
    if (isElectronRuntime) {
      const choice = await confirmLogout();
      if (!choice.confirmed) {
        sessionLog.info("logout cancelled");
        return;
      }
      wipeLocalData = choice.wipeLocalData;
    }
    sessionLog.info("logout confirmed", { wipeLocalData });

    try {
      if (isLoggedIn) {
        await logoutCurrent();
      }
    } catch (err) {
      sessionLog.warn("remote logout failed", err);
      // Always clear local auth state even if remote logout fails.
    }
    closeWSClient();
    stopProactiveTokenRefresh();
    setIsLoggedIn(false);
    setLoginUser(null);

    if (isElectronRuntime && window.electronAPI?.logoutUser) {
      // 主进程统一处理：取消下载 / 关 DB / 删 token-<uid> / 清 partition /
      // wipeLocalData=true 时 rm users/<uid> 与 partition 目录 / 重建 anon 窗口。
      await window.electronAPI.logoutUser({ wipeLocalData });
      sessionLog.info("logout done", { wipeLocalData });
      return;
    }

    await deleteTokens();
    sessionLog.info("logout done", { wipeLocalData });
  };

  if (!authReady) {
    return null;
  }

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        algorithm:
          resolvedTheme === "dark"
            ? antdTheme.darkAlgorithm
            : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: "#00A884",
          borderRadius: 16
        },
        components: {
          Button: {
            borderRadius: 8,
            primaryShadow: "none",
            defaultBorderColor: "transparent"
          }
        }
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                isLoggedIn ? (
                  <Navigate to="/home" replace />
                ) : (
                  <LoginPage
                    onLoginSuccess={(user: LoginUser) => {
                      setIsLoggedIn(true);
                      setLoginUser(user);
                    }}
                  />
                )
              }
            />
            <Route
              path="/home"
              element={
                isLoggedIn ? (
                  isElectron ? (
                    <HomePage loginUser={loginUser} onLogout={handleLogout} />
                  ) : (
                    <WebStandaloneNotice onLogout={handleLogout} />
                  )
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppThemeProvider>
        <AppContent />
      </AppThemeProvider>
    </AppErrorBoundary>
  );
}
