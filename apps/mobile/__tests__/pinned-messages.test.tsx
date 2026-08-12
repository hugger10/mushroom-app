import React from "react";
import ReactTestRenderer from "react-test-renderer";
import type { MobileMessageSearchResult } from "@mushroom/app-core";
import { PinnedMessagesBanner } from "../src/features/chat/PinnedMessagesBanner";
import { PinnedMessagesSheet } from "../src/features/chat/PinnedMessagesSheet";
import {
  createMockConversation,
  createMockMessage
} from "./helpers/mobile-test-helpers";

jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");
jest.mock("react-native-vector-icons/FontAwesome", () => "FontAwesome");

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      opts && opts.count ? `${key}:${opts.count}` : key
  }),
  initReactI18next: { type: "3rdParty", init: jest.fn() }
}));

function createMockPinnedResult(
  message: ReturnType<typeof createMockMessage>
): MobileMessageSearchResult {
  return {
    conversation: createMockConversation(),
    message,
    summary: "置顶消息摘要"
  };
}

describe("PinnedMessagesBanner", () => {
  test("renders nothing without pinned results", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <PinnedMessagesBanner
          results={[]}
          onOpenPanel={jest.fn()}
          onJumpToMessage={jest.fn()}
        />
      );
    });
    expect(
      renderer!.root.findAllByProps({ testID: "pinned-messages-banner" })
    ).toHaveLength(0);
    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("filters recalled messages out", async () => {
    const recalled = createMockMessage({
      client_message_id: "pinned-recalled",
      is_pinned: 1,
      is_recalled: 1
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <PinnedMessagesBanner
          results={[createMockPinnedResult(recalled)]}
          onOpenPanel={jest.fn()}
          onJumpToMessage={jest.fn()}
        />
      );
    });
    expect(
      renderer!.root.findAllByProps({ testID: "pinned-messages-banner" })
    ).toHaveLength(0);
    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("single result: shows summary and jumps directly on tap", async () => {
    const message = createMockMessage({
      client_message_id: "pinned-1",
      is_pinned: 1
    });
    const result = createMockPinnedResult(message);
    const onOpenPanel = jest.fn();
    const onJumpToMessage = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <PinnedMessagesBanner
          results={[result]}
          onOpenPanel={onOpenPanel}
          onJumpToMessage={onJumpToMessage}
        />
      );
    });
    const root = renderer!.root;

    const banner = root.findByProps({ testID: "pinned-messages-banner" });
    expect(banner.props.children.length).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      banner.props.onPress();
    });
    expect(onJumpToMessage).toHaveBeenCalledWith(result);
    expect(onOpenPanel).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("multiple results: shows count and opens panel on tap", async () => {
    const message1 = createMockMessage({
      client_message_id: "pinned-1",
      is_pinned: 1
    });
    const message2 = createMockMessage({
      client_message_id: "pinned-2",
      is_pinned: 1
    });
    const onOpenPanel = jest.fn();
    const onJumpToMessage = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <PinnedMessagesBanner
          results={[
            createMockPinnedResult(message1),
            createMockPinnedResult(message2)
          ]}
          onOpenPanel={onOpenPanel}
          onJumpToMessage={onJumpToMessage}
        />
      );
    });
    const root = renderer!.root;

    const banner = root.findByProps({ testID: "pinned-messages-banner" });
    ReactTestRenderer.act(() => {
      banner.props.onPress();
    });
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
    expect(onJumpToMessage).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });
});

describe("PinnedMessagesSheet", () => {
  test("renders pinned items, selects and unpins", async () => {
    const message1 = createMockMessage({
      client_message_id: "pinned-1",
      server_message_id: "server-pinned-1",
      sender_nickname: "Alice",
      is_pinned: 1
    });
    const message2 = createMockMessage({
      client_message_id: "pinned-2",
      server_message_id: "server-pinned-2",
      sender_nickname: "Bob",
      is_pinned: 1
    });
    const results = [
      createMockPinnedResult(message1),
      createMockPinnedResult(message2)
    ];
    const onSelect = jest.fn();
    const onUnpin = jest.fn();
    const onClose = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <PinnedMessagesSheet
          visible
          results={results}
          onSelect={onSelect}
          onUnpin={onUnpin}
          onClose={onClose}
        />
      );
    });
    const root = renderer!.root;

    expect(
      root.findAllByProps({ testID: "pinned-messages-sheet" }).length
    ).toBeGreaterThan(0);
    expect(
      root.findAllByProps({ testID: "pinned-sheet-item-pinned-2" }).length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      root
        .findByProps({ testID: "pinned-sheet-item-pinned-2" })
        .props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith(results[1]);

    ReactTestRenderer.act(() => {
      root
        .findByProps({ testID: "pinned-sheet-unpin-pinned-1" })
        .props.onPress();
    });
    expect(onUnpin).toHaveBeenCalledWith(message1);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("filters recalled messages out of the sheet", async () => {
    const recalled = createMockMessage({
      client_message_id: "pinned-recalled",
      server_message_id: "server-pinned-recalled",
      is_pinned: 1,
      is_recalled: 1
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <PinnedMessagesSheet
          visible
          results={[createMockPinnedResult(recalled)]}
          onSelect={jest.fn()}
          onUnpin={jest.fn()}
          onClose={jest.fn()}
        />
      );
    });
    const root = renderer!.root;

    expect(
      root.findAllByProps({ testID: "pinned-sheet-item-pinned-recalled" })
    ).toHaveLength(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });
});
