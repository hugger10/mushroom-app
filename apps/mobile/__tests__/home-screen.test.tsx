import React from "react";
import ReactTestRenderer from "react-test-renderer";
import * as ReactNative from "react-native";

jest.mock("react-native-gesture-handler/Swipeable", () => {
  const mockReact = jest.requireActual("react") as typeof import("react");
  const mockReactNative = jest.requireActual(
    "react-native"
  ) as typeof import("react-native");
  return mockReact.forwardRef(function MockSwipeable(
    props: {
      children: React.ReactNode;
    },
    ref: React.Ref<unknown>
  ) {
    void ref;
    return mockReact.createElement(mockReactNative.View, null, props.children);
  });
});

import { HomeScreen } from "../src/screens/HomeScreen";
import {
  createMockConversation,
  createMockFriend,
  createMockState
} from "./helpers/mobile-test-helpers";

jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");

jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("light");

function createProps(
  overrides: Partial<React.ComponentProps<typeof HomeScreen>> = {}
): React.ComponentProps<typeof HomeScreen> {
  const state = createMockState();
  return {
    tab: "chats",
    addEntryMenuVisible: false,
    snapshot: state.snapshot,
    realtimeStatus: { status: "idle", attempt: 0, maxAttempts: 5 },
    catchingUp: false,
    mobileApiBaseUrl: "http://127.0.0.1:9100",
    conversations: [createMockConversation()],
    availableContacts: [createMockFriend()],
    pending: false,
    onChangeTab: jest.fn(),
    onOpenAddEntryMenu: jest.fn(),
    onCloseAddEntryMenu: jest.fn(),
    onOpenStartConversation: jest.fn(),
    onOpenCreateGroupConversation: jest.fn(),
    onOpenQRScanner: jest.fn(),
    onOpenAddContact: jest.fn(),
    onOpenConversation: jest.fn(),
    onToggleConversationMute: jest.fn(),
    onDeleteConversation: jest.fn(),
    onToggleConversationArchive: jest.fn(),
    onToggleConversationRead: jest.fn(),
    onToggleConversationPin: jest.fn(),
    onOpenContactProfile: jest.fn(),
    onSyncNow: jest.fn(),
    onRefreshMeData: jest.fn(),
    onOpenWorkspaceSearch: jest.fn(),
    onOpenAttachmentCenter: jest.fn(),
    onLogout: jest.fn(),
    ...overrides
  };
}

describe("HomeScreen", () => {
  test("shows add menu actions and routes to matching handlers", async () => {
    const props = createProps({ addEntryMenuVisible: true });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<HomeScreen {...props} />);
    });
    const root = renderer!.root;

    expect(
      root.findAllByProps({ testID: "home-add-entry-menu" }).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      root.findByProps({ testID: "home-add-group-option" }).props.onPress();
    });
    expect(props.onOpenCreateGroupConversation).toHaveBeenCalledTimes(1);

    ReactTestRenderer.act(() => {
      root
        .findAll(
          node =>
            node.props.testID === "home-start-conversation-option" &&
            typeof node.props.onPress === "function"
        )[0]
        .props.onPress();
    });
    expect(props.onOpenStartConversation).toHaveBeenCalledTimes(1);

    ReactTestRenderer.act(() => {
      root.findByProps({ testID: "home-add-entry-backdrop" }).props.onPress();
    });
    expect(props.onCloseAddEntryMenu).toHaveBeenCalledTimes(1);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("opens archived conversations page and returns after unarchive", async () => {
    const activeConversation = createMockConversation({
      client_conversation_id: "conversation-active-home",
      is_archived: 0
    });
    const archivedConversation = createMockConversation({
      client_conversation_id: "conversation-archived-home",
      display_name: "Archived Alice",
      is_archived: 1
    });
    const props = createProps({
      conversations: [activeConversation, archivedConversation]
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<HomeScreen {...props} />);
    });
    const root = renderer!.root;

    ReactTestRenderer.act(() => {
      root
        .findByProps({ testID: "conversation-archive-entry" })
        .props.onPress();
    });

    expect(
      root.findAllByProps({ testID: "conversation-archive-back" }).length
    ).toBeGreaterThan(0);
    expect(
      root.findAllByProps({
        testID: "conversation-row-conversation-archived-home"
      }).length
    ).toBeGreaterThan(0);
    expect(
      root.findAllByProps({
        testID: "conversation-row-conversation-active-home"
      }).length
    ).toBe(0);

    ReactTestRenderer.act(() => {
      root
        .findByProps({ testID: "conversation-row-conversation-archived-home" })
        .props.onLongPress();
    });
    ReactTestRenderer.act(() => {
      root
        .findByProps({ testID: "conversation-sheet-action-archive" })
        .props.onPress();
    });

    expect(props.onToggleConversationArchive).toHaveBeenCalledWith(
      archivedConversation
    );
    expect(
      root.findAllByProps({ testID: "conversation-archive-back" }).length
    ).toBe(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("renders contacts tab without legacy request badge", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <HomeScreen
          {...createProps({
            tab: "contacts"
          })}
        />
      );
    });

    expect(
      renderer!.root.findAllByProps({ testID: "home-contacts-tab" }).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("renders available contacts in the contacts tab", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <HomeScreen
          {...createProps({
            tab: "contacts",
            availableContacts: [
              createMockFriend({ user_id: 8, nickname: "Alice Friend" })
            ]
          })}
        />
      );
    });

    expect(
      renderer!.root.findAllByProps({ testID: "contact-row-8" }).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });
});
