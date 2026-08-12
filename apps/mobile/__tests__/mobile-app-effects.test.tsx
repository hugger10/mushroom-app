jest.mock("../src/services/app-runtime", () => {
  const helpers = jest.requireActual("./helpers/mobile-test-helpers");
  return helpers.mobileAppModuleMock;
});

jest.mock("../src/platform/notification-center", () => ({
  consumePendingNotificationOpen: jest.fn(() => null),
  initializeNotificationCenter: jest.fn(() => jest.fn()),
  startOngoingCallService: jest.fn(async () => undefined),
  stopOngoingCallService: jest.fn(async () => undefined),
  syncPushRegistration: jest.fn(async callback => {
    await callback({
      provider: "xiaomi",
      token: "xiaomi-regid-test",
      appId: "xiaomi-app-id",
      region: "europe",
      capabilities: ["register-push", "regid-sync", "region-sync"]
    });
  })
}));

jest.mock("../src/platform/system-call", () => ({
  consumePendingSystemCallAction: jest.fn(() => null),
  initializeSystemCallManager: jest.fn(() => jest.fn())
}));

jest.mock("../src/platform/voice-recorder", () => ({
  mobileVoiceRecorder: {
    stopRecorder: jest.fn().mockResolvedValue(undefined),
    stopPlayer: jest.fn().mockResolvedValue(undefined),
    removeRecordBackListener: jest.fn(),
    removePlayBackListener: jest.fn(),
    removePlaybackEndListener: jest.fn()
  }
}));

import React from "react";
import ReactTestRenderer from "react-test-renderer";
import { useMobileAppEffects } from "../src/app/controller/useMobileAppEffects";
import type { MobileRealtimeStatus } from "../src/services/realtime";
import {
  createMockState,
  flushMicrotasks,
  mobileAppModuleMock,
  mobileAppControllerMock,
  mobileRealtimeClientMock,
  resetMobileMocks
} from "./helpers/mobile-test-helpers";

function Harness({ state }: { state: ReturnType<typeof createMockState> }) {
  useMobileAppEffects({
    state,
    refreshMeData: async () => undefined,
    handleRealtimeSocketMessage: async () => undefined,
    acceptCallById: async () => undefined,
    rejectOrEndCallById: async () => undefined,
    rebuildCallSessionFromServer: async () => undefined,
    silentRefreshAddressBookMatches: async () => undefined
  });

  return null;
}

function applyStateTestDefaults(state: ReturnType<typeof createMockState>) {
  state.groupSettings = {
    announcement: "",
    mute_all: 0,
    invite_permission: "all_members",
    profile_edit_permission: "admins"
  };
  state.isSearchVisible = false;
  state.searchFilter = "all";
  state.workspaceSearchResults = [];
  state.setIsSearchVisible = jest.fn((next: boolean) => {
    state.isSearchVisible = next;
  });
  state.setWorkspaceSearchResults = jest.fn((next: unknown[]) => {
    state.workspaceSearchResults = next;
  });
  state.setRealtimeStatus = jest.fn(
    (next: { status: string; attempt: number; maxAttempts: number }) => {
      state.realtimeStatus = next;
    }
  );
}

describe("useMobileAppEffects push registration", () => {
  beforeEach(() => {
    resetMobileMocks();
    mobileAppModuleMock.updateMobilePushRegistration.mockReset();
    mobileAppModuleMock.registerCurrentMobileDevice.mockReset();
    mobileAppModuleMock.registerCurrentMobileDevice.mockResolvedValue(
      undefined
    );
    mobileAppModuleMock.mobileDeviceInfo.pushProvider = null;
    mobileAppModuleMock.mobileDeviceInfo.pushToken = null;
    mobileAppModuleMock.mobileDeviceInfo.pushAppId = null;
    mobileAppModuleMock.mobileDeviceInfo.pushCapabilities = [];
    mobileAppModuleMock.mobileDeviceInfo.metadata = {
      platform: "android",
      os_version: 34
    };
    mobileAppControllerMock.subscribe.mockImplementation(() => jest.fn());
    mobileRealtimeClientMock.addStatusListener.mockImplementation(() =>
      jest.fn()
    );
    mobileRealtimeClientMock.addMessageListener.mockImplementation(() =>
      jest.fn()
    );
  });

  test("passes Xiaomi region metadata into device registration updates", async () => {
    const state = createMockState({
      realtimeStatus: {
        status: "idle",
        attempt: 0,
        maxAttempts: 5
      }
    });
    applyStateTestDefaults(state);

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<Harness state={state} />);
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(
      mobileAppModuleMock.updateMobilePushRegistration
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "xiaomi",
        token: "xiaomi-regid-test",
        appId: "xiaomi-app-id",
        region: "europe",
        capabilities: ["register-push", "regid-sync", "region-sync"]
      })
    );
    expect(mobileAppModuleMock.registerCurrentMobileDevice).toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
      await flushMicrotasks();
    });
  });

  test("does not replace equivalent realtime status replayed on subscribe", async () => {
    const idleStatus = {
      status: "idle",
      attempt: 0,
      maxAttempts: 5
    };
    const state = createMockState({
      realtimeStatus: idleStatus
    });
    applyStateTestDefaults(state);
    state.setRealtimeStatus = jest.fn(next => {
      state.realtimeStatus =
        typeof next === "function" ? next(state.realtimeStatus) : next;
    });
    (
      mobileRealtimeClientMock.addStatusListener as unknown as jest.Mock<
        () => void,
        [(status: MobileRealtimeStatus) => void]
      >
    ).mockImplementation(listener => {
      listener({
        status: "idle",
        attempt: 0,
        maxAttempts: 5
      });
      return jest.fn();
    });

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<Harness state={state} />);
      await flushMicrotasks();
    });

    expect(state.setRealtimeStatus).toHaveBeenCalledTimes(1);
    expect(state.realtimeStatus).toBe(idleStatus);

    await ReactTestRenderer.act(async () => {
      renderer?.unmount();
      await flushMicrotasks();
    });
  });
});
