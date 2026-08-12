import React from "react";
import { Pressable, Text, View } from "react-native";
import { i18n } from "../../i18n";
import log from "../../utils/log";

const boundaryLog = log.scope("boundary");

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level React error boundary. Logs uncaught render-phase errors via
 * the file-backed mobile logger so production crashes can be triaged from
 * the exported log bundle. Falls back to a minimal text screen with a
 * retry pressable so the user can attempt to recover without re-killing
 * the app.
 *
 * Intentionally keeps no per-component boundaries — those add noise and
 * usually want a more nuanced UI. A single root boundary is the cheapest
 * "we saw the crash" signal.
 */
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    boundaryLog.error("react boundary caught", {
      message: error.message,
      name: error.name,
      stack: error.stack,
      componentStack: info?.componentStack ?? null
    });
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          backgroundColor: "#fff"
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight: "600",
            marginBottom: 8,
            color: "#111"
          }}
        >
          {i18n.t("ui.appCrashed")}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: "#444",
            textAlign: "center",
            marginBottom: 16
          }}
          numberOfLines={4}
        >
          {this.state.error.message || i18n.t("ui.unknownError")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.t("chat.retry")}
          onPress={this.handleReset}
          style={{
            paddingHorizontal: 24,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: "#1f7aec"
          }}
        >
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
            {i18n.t("chat.retry")}
          </Text>
        </Pressable>
      </View>
    );
  }
}
