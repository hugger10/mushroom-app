import { Alert, Platform } from "react-native";

jest.mock("react-native-permissions", () => ({
  PERMISSIONS: {
    IOS: {
      MICROPHONE: "ios.permission.MICROPHONE",
      CAMERA: "ios.permission.CAMERA"
    },
    ANDROID: {
      RECORD_AUDIO: "android.permission.RECORD_AUDIO",
      CAMERA: "android.permission.CAMERA"
    }
  },
  RESULTS: {
    GRANTED: "granted",
    LIMITED: "limited",
    DENIED: "denied",
    BLOCKED: "blocked",
    UNAVAILABLE: "unavailable"
  },
  check: jest.fn(),
  request: jest.fn(),
  openSettings: jest.fn().mockResolvedValue(undefined)
}));

const alertSpy = jest.fn();
jest.spyOn(Alert, "alert").mockImplementation(alertSpy);

import {
  RESULTS,
  check,
  request,
  openSettings
} from "react-native-permissions";
import {
  ensureCameraPermission,
  ensureMicrophonePermission,
  ensureMicrophonePermissionSilently,
  resolveMediaPermission
} from "../src/platform/media-permissions";

const checkMock = check as jest.Mock;
const requestMock = request as jest.Mock;
const openSettingsMock = openSettings as jest.Mock;

const originalPlatformOS = Platform.OS;
let currentPlatformOS: typeof Platform.OS = "android";

Object.defineProperty(Platform, "OS", {
  configurable: true,
  get: () => currentPlatformOS,
  set: (value: typeof Platform.OS) => {
    currentPlatformOS = value;
  }
});

// Refresh Platform.select to honor the mocked OS each call.
const originalSelect = Platform.select.bind(Platform);
Platform.select = ((spec: Record<string, unknown>) => {
  if (spec && typeof spec === "object") {
    if (currentPlatformOS in spec) {
      return spec[currentPlatformOS];
    }
    if ("default" in spec) {
      return spec.default;
    }
    return undefined;
  }
  return originalSelect(spec as never);
}) as typeof Platform.select;

function setPlatform(os: typeof Platform.OS) {
  currentPlatformOS = os;
}

beforeEach(() => {
  checkMock.mockReset();
  requestMock.mockReset();
  openSettingsMock.mockClear();
  alertSpy.mockClear();
  setPlatform("android");
});

afterAll(() => {
  setPlatform(originalPlatformOS);
});

describe("media-permissions", () => {
  test("granted check shortcuts without requesting", async () => {
    checkMock.mockResolvedValue(RESULTS.GRANTED);

    const result = await ensureCameraPermission();

    expect(result.granted).toBe(true);
    expect(result.status).toBe(RESULTS.GRANTED);
    expect(checkMock).toHaveBeenCalledWith("android.permission.CAMERA");
    expect(requestMock).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("denied check requests and grants", async () => {
    checkMock.mockResolvedValue(RESULTS.DENIED);
    requestMock.mockResolvedValue(RESULTS.GRANTED);

    const result = await ensureMicrophonePermission();

    expect(result.granted).toBe(true);
    expect(requestMock).toHaveBeenCalledWith(
      "android.permission.RECORD_AUDIO",
      expect.objectContaining({ title: expect.any(String) })
    );
  });

  test("denied request returns not granted without alert", async () => {
    checkMock.mockResolvedValue(RESULTS.DENIED);
    requestMock.mockResolvedValue(RESULTS.DENIED);

    const result = await resolveMediaPermission("camera");

    expect(result.granted).toBe(false);
    expect(result.status).toBe(RESULTS.DENIED);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("blocked status surfaces blocked alert with settings entry", async () => {
    checkMock.mockResolvedValue(RESULTS.DENIED);
    requestMock.mockResolvedValue(RESULTS.BLOCKED);

    const result = await resolveMediaPermission("camera");

    expect(result.granted).toBe(false);
    expect(result.status).toBe(RESULTS.BLOCKED);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [, , buttons] = alertSpy.mock.calls[0];
    expect(buttons).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "打开设置" })])
    );
  });

  test("silent resolve skips blocked and unavailable alerts", async () => {
    checkMock.mockResolvedValue(RESULTS.DENIED);
    requestMock.mockResolvedValue(RESULTS.BLOCKED);

    const blocked = await ensureMicrophonePermissionSilently();

    expect(blocked.granted).toBe(false);
    expect(blocked.status).toBe(RESULTS.BLOCKED);
    expect(alertSpy).not.toHaveBeenCalled();

    checkMock.mockResolvedValue(RESULTS.UNAVAILABLE);
    requestMock.mockClear();

    const unavailable = await resolveMediaPermission("camera", {
      silent: true
    });

    expect(unavailable.granted).toBe(false);
    expect(unavailable.status).toBe(RESULTS.UNAVAILABLE);
    expect(requestMock).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("unavailable status surfaces unavailable alert", async () => {
    checkMock.mockResolvedValue(RESULTS.UNAVAILABLE);

    const result = await resolveMediaPermission("camera");

    expect(result.granted).toBe(false);
    expect(result.status).toBe(RESULTS.UNAVAILABLE);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(requestMock).not.toHaveBeenCalled();
  });

  test("returns unavailable when platform has no matching permission constant", async () => {
    setPlatform("windows" as typeof Platform.OS);

    const result = await resolveMediaPermission("camera");

    expect(result.granted).toBe(false);
    expect(result.permission).toBeNull();
    expect(result.status).toBe("unavailable");
    expect(checkMock).not.toHaveBeenCalled();
  });
});
