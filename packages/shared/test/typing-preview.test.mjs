import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTypingPreview,
  truncateName,
  visualWidth
} from "../dist/index.mjs";

test("visualWidth counts CJK as 2 and ASCII as 1", () => {
  assert.equal(visualWidth(""), 0);
  assert.equal(visualWidth("abc"), 3);
  assert.equal(visualWidth("中文"), 4);
  assert.equal(visualWidth("a中b"), 4);
});

test("truncateName preserves names that fit", () => {
  assert.equal(truncateName("Alice", 12), "Alice");
  assert.equal(truncateName("张三", 12), "张三");
});

test("truncateName trims with tail ellipsis when exceeding budget", () => {
  // 12 columns budget, reserve 1 for ellipsis -> 11 columns of content.
  const result = truncateName("Alice在远方的旅程", 12);
  // ASCII "Alice" = 5, then CJK chars width 2 each. Budget 11 -> Alice + 3 CJK chars = 11.
  assert.equal(result, "Alice在远方…");
});

test("truncateName handles pure CJK names", () => {
  const result = truncateName("超级长长长长长长长名字", 12);
  // Budget 11 cols, CJK each 2 -> 5 CJK chars = 10 cols (next char 2 cols overflows).
  assert.equal(result, "超级长长长…");
});

test("buildTypingPreview returns null when no typers", () => {
  assert.equal(buildTypingPreview({ typers: {}, isGroup: false }), null);
  assert.equal(buildTypingPreview({ typers: null, isGroup: true }), null);
  assert.equal(buildTypingPreview({ typers: undefined, isGroup: false }), null);
});

test("buildTypingPreview 1:1 chat shows generic verb", () => {
  const preview = buildTypingPreview({
    typers: { 42: { activity: "text" } },
    isGroup: false
  });
  assert.deepEqual(preview, { text: "正在输入…", activity: "text" });
});

test("buildTypingPreview 1:1 chat with voice activity", () => {
  const preview = buildTypingPreview({
    typers: { 42: { activity: "voice" } },
    isGroup: false
  });
  assert.deepEqual(preview, { text: "正在录音…", activity: "voice" });
});

test("buildTypingPreview group single named typer", () => {
  const preview = buildTypingPreview({
    typers: { 1: { activity: "text" } },
    isGroup: true,
    resolveDisplayName: () => "Alice"
  });
  assert.deepEqual(preview, { text: "Alice 正在输入…", activity: "text" });
});

test("buildTypingPreview group two named typers", () => {
  const preview = buildTypingPreview({
    typers: { 1: { activity: "text" }, 2: { activity: "text" } },
    isGroup: true,
    resolveDisplayName: uid => (uid === 1 ? "Alice" : "Bob")
  });
  assert.deepEqual(preview, {
    text: "Alice、Bob 正在输入…",
    activity: "text"
  });
});

test("buildTypingPreview group degrades to count when pair names too long", () => {
  const longA = "超级长长长长名字甲"; // 9 CJK = 18 cols
  const longB = "超级长长长长名字乙"; // 18 cols, total 36 > 16
  const preview = buildTypingPreview({
    typers: { 1: { activity: "text" }, 2: { activity: "text" } },
    isGroup: true,
    resolveDisplayName: uid => (uid === 1 ? longA : longB)
  });
  assert.deepEqual(preview, { text: "2 人正在输入…", activity: "text" });
});

test("buildTypingPreview group >= 3 typers uses count form", () => {
  const preview = buildTypingPreview({
    typers: {
      1: { activity: "text" },
      2: { activity: "text" },
      3: { activity: "voice" }
    },
    isGroup: true,
    resolveDisplayName: uid => `User${uid}`
  });
  // voice wins because at least one typer is recording
  assert.deepEqual(preview, { text: "3 人正在输入…", activity: "voice" });
});

test("buildTypingPreview group falls back to generic verb when single name unresolved", () => {
  const preview = buildTypingPreview({
    typers: { 1: { activity: "text" } },
    isGroup: true,
    resolveDisplayName: () => undefined
  });
  assert.deepEqual(preview, { text: "正在输入…", activity: "text" });
});

test("buildTypingPreview group falls back to count when pair has no names", () => {
  const preview = buildTypingPreview({
    typers: { 1: { activity: "text" }, 2: { activity: "text" } },
    isGroup: true,
    resolveDisplayName: () => null
  });
  assert.deepEqual(preview, { text: "2 人正在输入…", activity: "text" });
});

test("buildTypingPreview group truncates an overly long single name", () => {
  const preview = buildTypingPreview({
    typers: { 1: { activity: "text" } },
    isGroup: true,
    resolveDisplayName: () => "Alice在远方的旅程"
  });
  assert.deepEqual(preview, {
    text: "Alice在远方… 正在输入…",
    activity: "text"
  });
});

test("buildTypingPreview honors translate overrides", () => {
  const translate = (key, opts) => {
    if (key === "typing.typing") return "is typing…";
    if (key === "typing.namedTyping" && opts?.name)
      return `${opts.name} is typing…`;
    return opts?.defaultValue ?? key;
  };
  assert.equal(
    buildTypingPreview({
      typers: { 1: { activity: "text" } },
      isGroup: false,
      translate
    })?.text,
    "is typing…"
  );
  assert.equal(
    buildTypingPreview({
      typers: { 1: { activity: "text" } },
      isGroup: true,
      resolveDisplayName: () => "Alice",
      translate
    })?.text,
    "Alice is typing…"
  );
});
