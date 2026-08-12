import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMessageDateLabel,
  isSameLocalDay,
  DEFAULT_MESSAGE_DATE_LABELS
} from "../dist/index.mjs";

// Fixed reference "now": Wed 2025-05-14 10:00 local time.
const NOW = new Date(2025, 4, 14, 10, 0, 0);

function at(y, m, d, h = 12, min = 0) {
  return new Date(y, m - 1, d, h, min, 0);
}

test("formatMessageDateLabel: today returns 今天", () => {
  assert.equal(formatMessageDateLabel(at(2025, 5, 14, 9, 30), NOW), "今天");
  // crosses midnight but still same calendar day as NOW
  assert.equal(formatMessageDateLabel(at(2025, 5, 14, 0, 0), NOW), "今天");
  assert.equal(formatMessageDateLabel(at(2025, 5, 14, 23, 59), NOW), "今天");
});

test("formatMessageDateLabel: yesterday returns 昨天", () => {
  assert.equal(formatMessageDateLabel(at(2025, 5, 13, 23, 59), NOW), "昨天");
  assert.equal(formatMessageDateLabel(at(2025, 5, 13, 0, 0), NOW), "昨天");
});

test("formatMessageDateLabel: 2..6 days ago uses weekday", () => {
  // 2025-05-12 is a Monday
  assert.equal(formatMessageDateLabel(at(2025, 5, 12, 8, 0), NOW), "周一");
  // 2025-05-08 is a Thursday (6 days ago)
  assert.equal(formatMessageDateLabel(at(2025, 5, 8, 8, 0), NOW), "周四");
});

test("formatMessageDateLabel: same year, >6 days ago uses M月D日", () => {
  // 2025-05-07 is 7 days ago -> falls through weekday branch
  assert.equal(formatMessageDateLabel(at(2025, 5, 7, 8, 0), NOW), "5月7日");
  assert.equal(formatMessageDateLabel(at(2025, 1, 1, 8, 0), NOW), "1月1日");
});

test("formatMessageDateLabel: cross year uses YYYY年M月D日", () => {
  assert.equal(
    formatMessageDateLabel(at(2024, 12, 31, 23, 0), NOW),
    "2024年12月31日"
  );
  assert.equal(
    formatMessageDateLabel(at(2023, 4, 1, 8, 0), NOW),
    "2023年4月1日"
  );
});

test("formatMessageDateLabel: invalid input returns empty string", () => {
  assert.equal(formatMessageDateLabel(null, NOW), "");
  assert.equal(formatMessageDateLabel(undefined, NOW), "");
  assert.equal(formatMessageDateLabel("", NOW), "");
  assert.equal(formatMessageDateLabel("not-a-date", NOW), "");
});

test("formatMessageDateLabel: accepts ISO strings and millis", () => {
  const iso = at(2025, 5, 14, 9, 30).toISOString();
  assert.equal(formatMessageDateLabel(iso, NOW), "今天");
  const ms = at(2025, 5, 13, 12, 0).getTime();
  assert.equal(formatMessageDateLabel(ms, NOW), "昨天");
});

test("formatMessageDateLabel: custom labels override", () => {
  const labels = {
    ...DEFAULT_MESSAGE_DATE_LABELS,
    today: "Today",
    yesterday: "Yesterday",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    sameYear: "{{month}}/{{day}}",
    otherYear: "{{year}}-{{month}}-{{day}}"
  };
  assert.equal(
    formatMessageDateLabel(at(2025, 5, 14, 9, 0), NOW, labels),
    "Today"
  );
  assert.equal(
    formatMessageDateLabel(at(2025, 5, 13, 9, 0), NOW, labels),
    "Yesterday"
  );
  assert.equal(
    formatMessageDateLabel(at(2025, 5, 12, 9, 0), NOW, labels),
    "Mon"
  );
  assert.equal(
    formatMessageDateLabel(at(2025, 5, 7, 9, 0), NOW, labels),
    "5/7"
  );
  assert.equal(
    formatMessageDateLabel(at(2024, 12, 31, 9, 0), NOW, labels),
    "2024-12-31"
  );
});

test("isSameLocalDay: basic cases", () => {
  assert.equal(
    isSameLocalDay(at(2025, 5, 14, 0, 1), at(2025, 5, 14, 23, 59)),
    true
  );
  assert.equal(
    isSameLocalDay(at(2025, 5, 14, 23, 59), at(2025, 5, 15, 0, 1)),
    false
  );
  assert.equal(isSameLocalDay(null, at(2025, 5, 14)), false);
  assert.equal(isSameLocalDay(at(2025, 5, 14), undefined), false);
  assert.equal(isSameLocalDay("not-a-date", at(2025, 5, 14)), false);
});
