import React from "react";
import ReactTestRenderer from "react-test-renderer";
import * as ReactNative from "react-native";
import { ConversationRow } from "../src/components/conversation";
import { createMockConversation } from "./helpers/mobile-test-helpers";

jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("light");
jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");

describe("ConversationRow", () => {
  test("renders custom avatar image when conversation has display avatar", async () => {
    const conversation = createMockConversation({
      display_name: "Bob",
      display_avatar: "https://example.test/bob.png"
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ConversationRow conversation={conversation} onPress={jest.fn()} />
      );
    });

    expect(
      renderer!.root.findAll(node => node.type === (ReactNative.Image as any))
        .length
    ).toBeGreaterThan(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });
});
