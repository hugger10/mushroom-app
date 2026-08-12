import React from "react";
import ReactTestRenderer from "react-test-renderer";
import * as ReactNative from "react-native";
import { MessageBubble } from "../src/features/chat/MessageBubble";
import { formatConversationTime } from "../src/utils/app-ui";
import {
  createMockConversation,
  createMockFriend,
  createMockMessage
} from "./helpers/mobile-test-helpers";

jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("light");
jest.mock("react-native-vector-icons/Ionicons", () => "Ionicons");

describe("MessageBubble", () => {
  test("renders the message time inside the bubble pressable", async () => {
    const message = createMockMessage({
      created_at: "2026-04-08T08:06:00.000Z",
      type: 1
    });
    const formattedTime = formatConversationTime(message.created_at);
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <MessageBubble
          message={message}
          conversation={createMockConversation()}
          isOwn
          peerLastReadSequence={0}
          selected={false}
          highlighted={false}
          contacts={[createMockFriend()]}
          loginUser={null}
          onSelectMessage={jest.fn()}
          onPreviewImageMessage={jest.fn()}
          onPreviewVideoMessage={jest.fn()}
          onOpenAttachmentMessage={jest.fn()}
          onToggleVoicePlaybackMessage={jest.fn()}
          voicePlaying={false}
          voicePlayingPositionMs={0}
        />
      );
    });

    const tree = renderer!.toJSON();

    expect(JSON.stringify(tree)).toContain(formattedTime);
    expect(
      renderer!.root.findAllByProps({
        testID: "message-read-receipt-delivered"
      })
    ).not.toHaveLength(0);

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });

  test("renders blocked send failures as centered blocked notice", async () => {
    const message = createMockMessage({
      status: -1,
      last_error: "对方已经将你拉黑，无法发送消息"
    });
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <MessageBubble
          message={message}
          conversation={createMockConversation()}
          isOwn
          peerLastReadSequence={0}
          selected={false}
          highlighted={false}
          contacts={[createMockFriend()]}
          loginUser={null}
          onSelectMessage={jest.fn()}
          onPreviewImageMessage={jest.fn()}
          onPreviewVideoMessage={jest.fn()}
          onOpenAttachmentMessage={jest.fn()}
          onToggleVoicePlaybackMessage={jest.fn()}
          voicePlaying={false}
          voicePlayingPositionMs={0}
        />
      );
    });

    const output = JSON.stringify(renderer!.toJSON());
    expect(output).toContain("对方已经将你屏蔽，消息未发送");
    expect(output).not.toContain(" · 已屏蔽");
    expect(output).not.toContain("发送失败");

    ReactTestRenderer.act(() => {
      renderer!.unmount();
    });
  });
});
