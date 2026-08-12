import React from "react";
import ReactTestRenderer from "react-test-renderer";
import * as ReactNative from "react-native";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  }),
  initReactI18next: { type: "3rdParty", init: jest.fn() }
}));

jest.mock("react-native-gesture-handler/Swipeable", () => {
  const mockReact = jest.requireActual("react") as typeof import("react");
  const mockReactNative = jest.requireActual(
    "react-native"
  ) as typeof import("react-native");
  return mockReact.forwardRef(function MockSwipeable(
    props: {
      children: React.ReactNode;
    },
    ref: React.Ref<{ close: jest.Mock }>
  ) {
    mockReact.useImperativeHandle(ref, () => ({
      close: jest.fn()
    }));
    return mockReact.createElement(mockReactNative.View, null, props.children);
  });
});

jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");

import { ChatsScreen } from "../src/screens/ChatsScreen";
import { createMockConversation } from "./helpers/mobile-test-helpers";

jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("light");

describe("ChatsScreen", () => {
  test("renders every non-deleted conversation row", async () => {
    const visibleConversation = createMockConversation({
      client_conversation_id: "conversation-visible-1"
    });
    const deletedConversation = createMockConversation({
      client_conversation_id: "conversation-deleted-1",
      is_locally_deleted: 1
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatsScreen
          conversations={[visibleConversation, deletedConversation]}
          onDeleteConversation={jest.fn()}
          onOpenConversation={jest.fn()}
          onToggleConversationArchive={jest.fn()}
          onToggleConversationMute={jest.fn()}
          onToggleConversationPin={jest.fn()}
          onToggleConversationRead={jest.fn()}
        />
      );
    });

    const root = renderer!.root;

    expect(() =>
      root.findByProps({ testID: "conversation-row-conversation-visible-1" })
    ).not.toThrow();
    expect(
      root.findAllByProps({ testID: "conversation-row-conversation-deleted-1" })
        .length
    ).toBe(0);
  });

  test("long press opens conversation actions sheet and reuses handlers", async () => {
    const conversation = createMockConversation({
      client_conversation_id: "conversation-actions-1",
      unread_count: 2
    });
    const props = {
      conversations: [conversation],
      onOpenConversation: jest.fn(),
      onToggleConversationMute: jest.fn(),
      onDeleteConversation: jest.fn(),
      onToggleConversationArchive: jest.fn(),
      onToggleConversationRead: jest.fn(),
      onToggleConversationPin: jest.fn()
    };
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<ChatsScreen {...props} />);
    });
    const root = renderer!.root;

    ReactTestRenderer.act(() => {
      root
        .findByProps({ testID: "conversation-row-conversation-actions-1" })
        .props.onLongPress();
    });

    expect(
      root.findAllByProps({ testID: "conversation-actions-sheet" }).length
    ).toBeGreaterThan(0);
    expect(
      root.findAllByProps({ testID: "conversation-sheet-action-read" }).length
    ).toBeGreaterThan(0);
    expect(
      root.findAllByProps({ testID: "conversation-sheet-action-pin" }).length
    ).toBeGreaterThan(0);
    expect(
      root.findAllByProps({ testID: "conversation-sheet-action-mute" }).length
    ).toBeGreaterThan(0);
    expect(
      root.findAllByProps({ testID: "conversation-sheet-action-delete" }).length
    ).toBeGreaterThan(0);
    expect(
      root.findAllByProps({ testID: "conversation-sheet-action-archive" })
        .length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      root
        .findByProps({ testID: "conversation-sheet-action-pin" })
        .props.onPress();
    });
    expect(props.onToggleConversationPin).toHaveBeenCalledWith(conversation);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("renders archived conversations entry above active rows", async () => {
    const conversation = createMockConversation({
      client_conversation_id: "conversation-active-1"
    });
    const onOpenArchivedConversations = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ChatsScreen
          conversations={[conversation]}
          archivedConversationCount={2}
          onDeleteConversation={jest.fn()}
          onOpenArchivedConversations={onOpenArchivedConversations}
          onOpenConversation={jest.fn()}
          onToggleConversationArchive={jest.fn()}
          onToggleConversationMute={jest.fn()}
          onToggleConversationPin={jest.fn()}
          onToggleConversationRead={jest.fn()}
        />
      );
    });

    const root = renderer!.root;
    ReactTestRenderer.act(() => {
      root
        .findByProps({ testID: "conversation-archive-entry" })
        .props.onPress();
    });

    expect(onOpenArchivedConversations).toHaveBeenCalledTimes(1);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });
});
