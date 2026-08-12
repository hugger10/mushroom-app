import {
  BrowserWindow,
  Notification as ElectronNotification,
  app,
  ipcMain
} from "electron";
import log from "../utils/log";

const notifyLog = log.scope("notify");

type DesktopMessageNotificationInput = {
  clientConversationId: string;
  title: string;
  body: string;
  silent?: boolean;
};

type DesktopCallNotificationInput = {
  callId: string;
  conversationId?: string;
  title: string;
  body: string;
  mediaType?: number;
  timeoutSeconds?: number;
};

type DesktopNotificationActionPayload = {
  type: "conversation" | "call";
  action: "open";
  clientConversationId?: string;
  conversationId?: string;
  callId?: string;
};

class DesktopNotificationManager {
  private mainWindow: BrowserWindow | null = null;

  /**
   * 取当前通话窗（若存在）。独立通话窗模式下，来电通知点击应聚焦通话窗
   * 而非主窗（C4 / realtime-call.md §12.1）。由 main/index.ts 注入
   * call-window 的 getCallWindow，避免本模块直接依赖 call-window。
   */
  private callWindowAccessor: (() => BrowserWindow | null) | null = null;

  private pendingConversationIds = new Set<string>();

  private pendingCallIds = new Set<string>();

  private activeNotifications = new Map<string, ElectronNotification>();

  setMainWindow(windowInstance: BrowserWindow) {
    this.mainWindow = windowInstance;
    this.mainWindow.on("focus", () => {
      this.mainWindow?.flashFrame(false);
    });
    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
      this.pendingConversationIds.clear();
      this.pendingCallIds.clear();
      this.activeNotifications.clear();
    });
  }

  /**
   * 注入通话窗访问器（C4）。设为 null 可解除（如关闭通话窗特性）。
   */
  setCallWindowAccessor(accessor: (() => BrowserWindow | null) | null) {
    this.callWindowAccessor = accessor;
  }

  registerIpcHandlers() {
    ipcMain.handle(
      "desktop:notify-incoming-message",
      async (_event, payload: DesktopMessageNotificationInput) => {
        this.notifyIncomingMessage(payload);
      }
    );
    ipcMain.handle(
      "desktop:notify-incoming-call",
      async (_event, payload: DesktopCallNotificationInput) => {
        this.notifyIncomingCall(payload);
      }
    );
    ipcMain.handle(
      "desktop:clear-conversation-notifications",
      async (_event, clientConversationId?: string) => {
        this.clearConversationNotifications(clientConversationId);
      }
    );
    ipcMain.handle(
      "desktop:clear-incoming-call",
      async (_event, callId?: string) => {
        this.clearIncomingCall(callId);
      }
    );
    ipcMain.handle(
      "desktop:focus-conversation",
      async (_event, payload: { clientConversationId?: string }) => {
        this.focusMainWindow();
        if (payload.clientConversationId) {
          this.emitAction({
            type: "conversation",
            action: "open",
            clientConversationId: payload.clientConversationId
          });
        }
      }
    );
  }

  notifyIncomingMessage(payload: DesktopMessageNotificationInput) {
    if (!payload.clientConversationId) {
      return;
    }

    notifyLog.info(
      "displayIncomingMessage",
      JSON.stringify({
        clientConversationId: payload.clientConversationId,
        silent: payload.silent ?? false
      })
    );
    this.pendingConversationIds.add(payload.clientConversationId);
    this.refreshAttention();
    this.showNotification(
      `conversation:${payload.clientConversationId}`,
      {
        title: payload.title,
        body: payload.body,
        silent: payload.silent ?? false
      },
      {
        type: "conversation",
        action: "open",
        clientConversationId: payload.clientConversationId
      }
    );
  }

  notifyIncomingCall(payload: DesktopCallNotificationInput) {
    if (!payload.callId) {
      return;
    }

    notifyLog.info("displayIncomingCall", {
      callId: payload.callId,
      conversationId: payload.conversationId,
      mediaType: payload.mediaType,
      timeoutSeconds: payload.timeoutSeconds
    });
    this.pendingCallIds.add(payload.callId);
    this.refreshAttention();
    this.showNotification(
      `call:${payload.callId}`,
      {
        title: payload.title,
        body: payload.body,
        silent: true,
        urgency: "critical"
      },
      {
        type: "call",
        action: "open",
        callId: payload.callId,
        conversationId: payload.conversationId
      }
    );
  }

  clearConversationNotifications(clientConversationId?: string) {
    if (!clientConversationId) {
      this.pendingConversationIds.clear();
      for (const key of Array.from(this.activeNotifications.keys())) {
        if (key.startsWith("conversation:")) {
          this.closeNotification(key);
        }
      }
      this.refreshAttention();
      return;
    }

    this.pendingConversationIds.delete(clientConversationId);
    this.closeNotification(`conversation:${clientConversationId}`);
    this.refreshAttention();
  }

  clearIncomingCall(callId?: string) {
    if (!callId) {
      const count = this.pendingCallIds.size;
      if (count > 0) {
        notifyLog.info("clearIncomingCall", { callId: null, count });
      }
      this.pendingCallIds.clear();
      for (const key of Array.from(this.activeNotifications.keys())) {
        if (key.startsWith("call:")) {
          this.closeNotification(key);
        }
      }
      this.refreshAttention();
      return;
    }

    const hadEntry = this.pendingCallIds.has(callId);
    if (hadEntry) {
      notifyLog.info("clearIncomingCall", { callId, count: 1 });
    }
    this.pendingCallIds.delete(callId);
    this.closeNotification(`call:${callId}`);
    this.refreshAttention();
  }

  private closeNotification(key: string) {
    const current = this.activeNotifications.get(key);
    if (!current) {
      return;
    }

    try {
      current.close();
    } catch (err) {
      // Ignore notification close failures on unsupported platforms, but
      // record the underlying reason so we can spot platform quirks later.
      notifyLog.warn("notification close failed", { key, err });
    }
    this.activeNotifications.delete(key);
  }

  private showNotification(
    key: string,
    options: ConstructorParameters<typeof ElectronNotification>[0],
    actionPayload: DesktopNotificationActionPayload
  ) {
    if (!ElectronNotification.isSupported()) {
      notifyLog.warn("notifications unsupported on this platform", { key });
      return;
    }

    this.closeNotification(key);
    const notification = new ElectronNotification(options);
    notification.on("click", () => {
      notifyLog.info("notification clicked", {
        type: actionPayload.type,
        callId: actionPayload.callId,
        clientConversationId: actionPayload.clientConversationId
      });
      if (actionPayload.type === "call" && this.focusCallWindow()) {
        // 通话窗存在：聚焦通话窗（C4），不再 focus 主窗 / emit 主窗动作。
        this.clearIncomingCall(actionPayload.callId);
        return;
      }
      this.focusMainWindow();
      this.emitAction(actionPayload);
      if (actionPayload.type === "conversation") {
        this.clearConversationNotifications(actionPayload.clientConversationId);
      } else if (actionPayload.type === "call") {
        this.clearIncomingCall(actionPayload.callId);
      }
    });
    notification.on("close", () => {
      this.activeNotifications.delete(key);
    });
    this.activeNotifications.set(key, notification);
    notification.show();
  }

  /**
   * 来电通知点击时优先聚焦通话窗（C4）。返回 true 表示已聚焦通话窗，
   * 调用方应跳过主窗 focus。通话窗不存在或已销毁时返回 false 回退主窗。
   */
  private focusCallWindow(): boolean {
    const win = this.callWindowAccessor?.() ?? null;
    if (!win || win.isDestroyed()) {
      return false;
    }
    if (win.isMinimized()) {
      win.restore();
    }
    if (!win.isVisible()) {
      win.show();
    }
    win.focus();
    if (process.platform === "darwin") {
      app.dock?.show();
    }
    return true;
  }

  private focusMainWindow() {
    const currentWindow = this.mainWindow;
    if (!currentWindow) {
      return;
    }

    if (currentWindow.isMinimized()) {
      currentWindow.restore();
    }
    if (!currentWindow.isVisible()) {
      currentWindow.show();
    }
    currentWindow.focus();
    currentWindow.flashFrame(false);

    if (process.platform === "darwin") {
      app.dock?.show();
    }
  }

  private emitAction(payload: DesktopNotificationActionPayload) {
    this.mainWindow?.webContents.send("desktop-notification-action", payload);
  }

  private refreshAttention() {
    const currentWindow = this.mainWindow;
    if (!currentWindow) {
      return;
    }

    const hasPending =
      this.pendingConversationIds.size > 0 || this.pendingCallIds.size > 0;
    currentWindow.flashFrame(hasPending && !currentWindow.isFocused());
  }
}

export default new DesktopNotificationManager();
