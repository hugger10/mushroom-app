import React from "react";
import ReactTestRenderer from "react-test-renderer";
import * as ReactNative from "react-native";
import { ContactsScreen } from "../src/screens/ContactsScreen";
import { createMockFriend } from "./helpers/mobile-test-helpers";

jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          "contacts.empty": "当前还没有联系人或已屏蔽联系人。",
          "contacts.noContacts": "当前还没有联系人或已屏蔽联系人。",
          "contacts.emptySearch": "未找到联系人",
          "contacts.blocked": "已屏蔽",
          "contacts.searchPlaceholder": "搜索联系人",
          "contacts.directoryHint": "联系人与分组索引",
          "home.tabs.contacts": "联系人"
        }) as Record<string, string>
      )[key] ?? key
  }),
  initReactI18next: { type: "3rdParty", init: jest.fn() }
}));

jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("light");

function createProps(
  overrides: Partial<React.ComponentProps<typeof ContactsScreen>> = {}
): React.ComponentProps<typeof ContactsScreen> {
  return {
    availableContacts: [],
    searchQuery: "",
    onOpenContactProfile: jest.fn(),
    ...overrides
  };
}

describe("ContactsScreen", () => {
  test("renders contact rows and opens peer profile", async () => {
    const onOpenContactProfile = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ContactsScreen
          {...createProps({
            availableContacts: [
              createMockFriend({ user_id: 2, nickname: "Bob" })
            ],
            onOpenContactProfile
          })}
        />
      );
    });

    const root = renderer!.root;

    ReactTestRenderer.act(() => {
      root.findByProps({ testID: "contact-row-2" }).props.onPress();
    });
    expect(onOpenContactProfile).toHaveBeenCalledTimes(1);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("shows empty state when there are no contacts", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ContactsScreen {...createProps()} />
      );
    });

    const root = renderer!.root;
    expect(
      root.findAllByProps({ label: "当前还没有联系人或已屏蔽联系人。" }).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });
});
