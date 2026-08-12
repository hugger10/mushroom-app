import React from "react";
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
 * 顶层 React 错误边界。捕获 render 阶段未处理异常，经文件日志记录，并降级到
 * 一个最小的可重试界面，避免整窗白屏（无任何提示、无法自救）。
 *
 * 刻意只在根部放一个边界——细粒度边界噪声大且通常需要更精细的 UI。根边界是
 * 「我们看到崩溃了」最廉价的信号。配合桌面端独立通话窗改造：即便通话栈/桥接
 * 抛错也只降级提示，不至于让聊天主窗一并白屏。
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
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#fff",
          color: "#111",
          textAlign: "center"
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          {i18n.t("ui.appCrashed")}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "#444",
            marginBottom: 16,
            maxWidth: 480,
            wordBreak: "break-word"
          }}
        >
          {this.state.error.message || i18n.t("ui.unknownError")}
        </div>
        <button
          type="button"
          onClick={this.handleReset}
          style={{
            padding: "10px 24px",
            borderRadius: 999,
            border: "none",
            background: "#1f7aec",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          {i18n.t("chat.retry")}
        </button>
      </div>
    );
  }
}
