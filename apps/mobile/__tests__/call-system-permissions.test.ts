import { Alert } from "react-native";

jest.mock("../src/data/storage", () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    deviceStorage: {
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => store.set(key, value),
      remove: (key: string) => store.delete(key)
    }
  };
});

jest.mock("../src/platform/notifications/permissions", () => ({
  getNotificationPermissionStatus: jest.fn(),
  requestNotificationPermission: jest.fn()
}));

jest.mock("../src/platform/media-permissions", () => ({
  ensureMicrophonePermissionSilently: jest.fn()
}));

import {
  getNotificationPermissionStatus,
  requestNotificationPermission
} from "../src/platform/notifications/permissions";
import { ensureMicrophonePermissionSilently } from "../src/platform/media-permissions";
import {
  runCallPermissionGuide,
  resetCallPermissionGuide
} from "../src/platform/call-system-permissions";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const storageModule = require("../src/data/storage") as {
  __store: Map<string, string>;
};

const getNotificationStatusMock =
  getNotificationPermissionStatus as jest.MockedFunction<
    typeof getNotificationPermissionStatus
  >;
const requestNotificationMock =
  requestNotificationPermission as jest.MockedFunction<
    typeof requestNotificationPermission
  >;
const ensureMicrophoneSilentlyMock =
  ensureMicrophonePermissionSilently as jest.MockedFunction<
    typeof ensureMicrophonePermissionSilently
  >;

// Auto-confirm every Alert by pressing the last (confirm) button.
function autoConfirmAlerts() {
  return jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) => {
      const list = buttons ?? [];
      const confirmButton = list[list.length - 1];
      confirmButton?.onPress?.();
    });
}

describe("call-system-permissions guide", () => {
  beforeEach(() => {
    storageModule.__store.clear();
    jest.clearAllMocks();
    getNotificationStatusMock.mockResolvedValue("authorized");
    requestNotificationMock.mockResolvedValue("authorized");
    ensureMicrophoneSilentlyMock.mockResolvedValue({
      granted: true,
      permission: null,
      status: "granted"
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("runs only once and persists the prompted flag", async () => {
    autoConfirmAlerts();

    await runCallPermissionGuide();
    await runCallPermissionGuide();

    expect(getNotificationStatusMock).toHaveBeenCalledTimes(1);
    expect(ensureMicrophoneSilentlyMock).toHaveBeenCalledTimes(1);
  });

  it("force re-runs after reset", async () => {
    autoConfirmAlerts();

    await runCallPermissionGuide();
    resetCallPermissionGuide();
    await runCallPermissionGuide();

    expect(getNotificationStatusMock).toHaveBeenCalledTimes(2);
  });

  it("requests notification permission when not yet authorized", async () => {
    getNotificationStatusMock.mockResolvedValue("denied");
    autoConfirmAlerts();

    await runCallPermissionGuide();

    expect(requestNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("silently pre-requests microphone after the notification step", async () => {
    getNotificationStatusMock.mockResolvedValue("denied");
    ensureMicrophoneSilentlyMock.mockResolvedValue({
      granted: false,
      permission: null,
      status: "denied"
    });
    autoConfirmAlerts();

    await runCallPermissionGuide();

    expect(requestNotificationMock).toHaveBeenCalledTimes(1);
    expect(ensureMicrophoneSilentlyMock).toHaveBeenCalledTimes(1);
    const notificationOrder =
      requestNotificationMock.mock.invocationCallOrder[0];
    const micOrder = ensureMicrophoneSilentlyMock.mock.invocationCallOrder[0];
    expect(notificationOrder).toBeLessThan(micOrder);
  });

  it("never throws when a step rejects", async () => {
    getNotificationStatusMock.mockRejectedValue(new Error("boom"));
    autoConfirmAlerts();

    await expect(runCallPermissionGuide()).resolves.toBeUndefined();
  });

  it("never throws when the microphone step rejects", async () => {
    ensureMicrophoneSilentlyMock.mockRejectedValue(new Error("mic boom"));
    autoConfirmAlerts();

    await expect(runCallPermissionGuide()).resolves.toBeUndefined();
  });
});
