import React from "react";
import ReactTestRenderer from "react-test-renderer";
import {
  useResolvedMessageContents,
  type ResolvedMessageContents
} from "../../src/features/chat/bubbles/hooks/useResolvedMessageContents";
import { createMockMessage } from "../helpers/mobile-test-helpers";
import type { Message } from "@mushroom/shared";

function captureResolved(message: Message) {
  const captured: { value: ResolvedMessageContents | null } = { value: null };
  function Harness() {
    captured.value = useResolvedMessageContents(message);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Harness />);
  });
  return captured.value!;
}

describe("useResolvedMessageContents", () => {
  test("classifies text message as no attachment", () => {
    const message = createMockMessage({ type: 1 });
    const r = captureResolved(message);
    expect(r.voice).toBeNull();
    expect(r.image).toBeNull();
    expect(r.video).toBeNull();
    expect(r.audio).toBeNull();
    expect(r.generic).toBeNull();
    expect(r.isPendingAttachment).toBe(false);
    expect(r.pendingContent).toBeNull();
  });

  test("short-circuits pending attachment when upload_pending is true", () => {
    const message = createMockMessage({
      type: 2,
      content: {
        type: 2,
        kind: "image",
        url: "",
        name: "x.jpg",
        size: 123,
        mime_type: "image/jpeg",
        upload_pending: true,
        local_thumbnail_uri: "file:///tmp/x.jpg"
      } as unknown as Message["content"]
    });
    const r = captureResolved(message);
    expect(r.isPendingAttachment).toBe(true);
    expect(r.pendingContent).not.toBeNull();
    expect(r.image).toBeNull();
    expect(r.video).toBeNull();
  });

  test("does not treat recalled message as pending attachment", () => {
    const message = createMockMessage({
      type: 2,
      is_recalled: 1,
      content: {
        type: 2,
        kind: "image",
        url: "",
        name: "x.jpg",
        size: 1,
        mime_type: "image/jpeg",
        upload_pending: true
      } as unknown as Message["content"]
    });
    const r = captureResolved(message);
    expect(r.isPendingAttachment).toBe(false);
  });
});
