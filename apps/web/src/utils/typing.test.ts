import {
  applyTypingSignal,
  getGroupTypingSubtitle,
  getTypingSubtitle
} from "./typing";

describe("typing indicator helpers", () => {
  test("stores active typing state by conversation id and sender", () => {
    expect(
      applyTypingSignal(
        {},
        {
          conversation_id: "conversation-1",
          sender_user_id: 42,
          active: true,
          activity: "text"
        }
      )
    ).toEqual({
      "conversation-1": {
        42: { activity: "text" }
      }
    });
  });

  test("tracks multiple concurrent typers in the same conversation", () => {
    let state = applyTypingSignal(
      {},
      {
        conversation_id: "c1",
        sender_user_id: 1,
        active: true,
        activity: "text"
      }
    );
    state = applyTypingSignal(state, {
      conversation_id: "c1",
      sender_user_id: 2,
      active: true,
      activity: "voice"
    });
    expect(state).toEqual({
      c1: {
        1: { activity: "text" },
        2: { activity: "voice" }
      }
    });
  });

  test("removes a single typer without clobbering others", () => {
    const initial = {
      c1: {
        1: { activity: "text" as const },
        2: { activity: "text" as const }
      }
    };
    const next = applyTypingSignal(initial, {
      conversation_id: "c1",
      sender_user_id: 1,
      active: false
    });
    expect(next).toEqual({ c1: { 2: { activity: "text" } } });
  });

  test("clears the conversation entry once the last typer leaves", () => {
    const initial = { c1: { 1: { activity: "voice" as const } } };
    expect(
      applyTypingSignal(initial, {
        conversation_id: "c1",
        sender_user_id: 1,
        active: false,
        activity: "voice"
      })
    ).toEqual({});
  });

  test("normalizes subtitle copy for text and voice typing", () => {
    expect(getTypingSubtitle("text")).toBe("正在输入…");
    expect(getTypingSubtitle("voice")).toBe("正在录音…");
    expect(getTypingSubtitle(null)).toBe("正在输入…");
  });

  test("group typing subtitle handles 1 / 2 / >=3 typers", () => {
    const resolve = (id: number) =>
      ({ 1: "Alice", 2: "Bob", 3: "Carol" })[id] ?? null;

    expect(getGroupTypingSubtitle({ 1: { activity: "text" } }, resolve)).toBe(
      "Alice 正在输入…"
    );
    expect(getGroupTypingSubtitle({ 2: { activity: "voice" } }, resolve)).toBe(
      "Bob 正在录音…"
    );
    expect(
      getGroupTypingSubtitle(
        { 1: { activity: "text" }, 2: { activity: "text" } },
        resolve
      )
    ).toBe("Alice、Bob 正在输入…");
    expect(
      getGroupTypingSubtitle(
        {
          1: { activity: "text" },
          2: { activity: "text" },
          3: { activity: "text" }
        },
        resolve
      )
    ).toBe("3 人正在输入…");
  });
});
