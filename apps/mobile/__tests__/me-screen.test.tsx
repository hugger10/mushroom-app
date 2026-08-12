import React from "react";
import ReactTestRenderer from "react-test-renderer";

import { MeScreen } from "../src/screens/MeScreen";
import { MeProvider, type MeProps } from "../src/features/account/MeContext";
import { createMockState } from "./helpers/mobile-test-helpers";
jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  })
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack
  })
}));

const mockSetThemePreference = jest.fn();
const mockSetAppLanguage = jest.fn().mockResolvedValue(undefined);
const mockTheme = jest.requireActual("../src/styles/theme").getTheme("dark");
const mockStyles = new Proxy(
  {},
  {
    get: () => undefined
  }
);

let mockCurrentLanguage = "zh-CN";

jest.mock("../src/styles/app-styles", () => ({
  useAppTheme: () => ({
    styles: mockStyles,
    theme: mockTheme,
    themePreference: "system",
    resolvedTheme: "dark",
    setThemePreference: mockSetThemePreference,
    cycleThemePreference: jest.fn()
  })
}));

jest.mock("../src/i18n", () => ({
  setAppLanguage: (...args: unknown[]) => mockSetAppLanguage(...args),
  useAppLanguage: () => ({
    language: mockCurrentLanguage,
    languageLabel: mockCurrentLanguage === "zh-CN" ? "简体中文" : "English",
    toggleLanguage: jest.fn()
  })
}));

function createProps(
  overrides: Partial<React.ComponentProps<typeof MeScreen>> = {}
): React.ComponentProps<typeof MeScreen> {
  const state = createMockState();

  return {
    snapshot: state.snapshot,
    onRefreshMeData: jest.fn(),
    onLogout: jest.fn(),
    ...overrides
  };
}

function createMeProps(props: React.ComponentProps<typeof MeScreen>): MeProps {
  const state = createMockState();
  return {
    snapshot: props.snapshot,
    pending: false,
    profileForm: state.profileForm,
    onChangeProfileForm: jest.fn(),
    onSaveProfile: jest.fn(),
    onPickProfileAvatar: jest.fn(),
    onPreviewAvatar: jest.fn(),
    onSyncNotificationRegistration: jest.fn().mockResolvedValue(undefined),
    onLoadNotificationSettings: jest.fn().mockResolvedValue(null),
    onUpdateNotificationSettings: jest.fn().mockResolvedValue(null)
  };
}

function renderMeScreen(props: React.ComponentProps<typeof MeScreen>) {
  return (
    <MeProvider value={createMeProps(props)}>
      <MeScreen {...props} />
    </MeProvider>
  );
}

describe("MeScreen", () => {
  beforeEach(() => {
    mockCurrentLanguage = "zh-CN";
    mockSetThemePreference.mockReset();
    mockSetAppLanguage.mockReset();
    mockSetAppLanguage.mockResolvedValue(undefined);
    mockNavigate.mockReset();
    mockGoBack.mockReset();
  });

  test("expands theme options and applies the selected theme", async () => {
    jest.useFakeTimers();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(renderMeScreen(createProps()));
    });

    const root = renderer!.root;

    ReactTestRenderer.act(() => {
      root.findByProps({ testID: "me-theme-trigger" }).props.onPress();
    });

    expect(
      root.findAllByProps({ testID: "me-theme-option-dark" }).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      root.findByProps({ testID: "me-theme-option-dark" }).props.onPress();
      jest.advanceTimersByTime(400);
    });

    expect(mockSetThemePreference).toHaveBeenCalledWith("dark");

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
    jest.useRealTimers();
  });

  test("expands language options and applies the selected language", async () => {
    jest.useFakeTimers();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(renderMeScreen(createProps()));
    });

    const root = renderer!.root;

    ReactTestRenderer.act(() => {
      root.findByProps({ testID: "me-language-trigger" }).props.onPress();
    });

    expect(
      root.findAllByProps({ testID: "me-language-option-en-US" }).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      root.findByProps({ testID: "me-language-option-en-US" }).props.onPress();
      jest.advanceTimersByTime(400);
    });

    expect(mockSetAppLanguage).toHaveBeenCalledWith("en-US");

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
    jest.useRealTimers();
  });

  test("opens account security overview via navigation", async () => {
    const onRefreshMeData = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderMeScreen(createProps({ onRefreshMeData }))
      );
    });

    const root = renderer!.root;

    ReactTestRenderer.act(() => {
      root
        .findByProps({ testID: "me-account-security-trigger" })
        .props.onPress();
    });

    expect(onRefreshMeData).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("AccountSecurityOverview");

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("opens notification settings via navigation", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(renderMeScreen(createProps()));
    });

    const root = renderer!.root;

    await ReactTestRenderer.act(async () => {
      root.findByProps({ testID: "me-notifications-trigger" }).props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("NotificationSettings");

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });
});
