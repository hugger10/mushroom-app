import { useEffect } from "react";
import { Platform } from "react-native";
import "./i18n";
import { AppErrorBoundary } from "./components/ui";
import { AppFrame } from "./app/AppFrame";
import { AppThemeProvider } from "./styles/app-styles";
import { ChatBackgroundProvider } from "./styles/chat-background-context";
import log from "./utils/log";

const appLog = log.scope("app");

export default function App() {
  useEffect(() => {
    appLog.info("app started", {
      platform: Platform.OS,
      osVersion: String(Platform.Version)
    });
  }, []);
  return (
    <AppThemeProvider>
      <ChatBackgroundProvider>
        <AppErrorBoundary>
          <AppFrame />
        </AppErrorBoundary>
      </ChatBackgroundProvider>
    </AppThemeProvider>
  );
}
