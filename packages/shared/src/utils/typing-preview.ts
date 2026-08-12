/**
 * Typing indicator preview text builder shared by web/electron/mobile.
 *
 * Used both by the chat detail header subtitle and the conversation list
 * second-line preview. The function is pure so it can be unit-tested and
 * keeps platform-specific UI (animated dots, color tokens) at the call site.
 */

export type TypingActivity = "text" | "voice";

export type TypingIndicator = {
  activity: TypingActivity;
};

export type TypersMap = Record<number, TypingIndicator>;

export type TypingPreviewTranslate = (
  key: string,
  options?: { defaultValue?: string } & Record<string, unknown>
) => string;

export type BuildTypingPreviewOptions = {
  typers: TypersMap | undefined | null;
  /** When true, builds the group variant with member names. */
  isGroup: boolean;
  /**
   * Resolves a display name for a user id. Return null/undefined when the
   * name cannot be resolved; the preview will fall back gracefully.
   */
  resolveDisplayName?: (userId: number) => string | null | undefined;
  translate?: TypingPreviewTranslate;
};

export type TypingPreview = {
  text: string;
  activity: TypingActivity;
};

/**
 * Caps tuned for Chinese/English mixed nicknames. A CJK char counts as 2,
 * everything else as 1 (mirrors common rendering width).
 */
const MAX_NAME_WIDTH_SINGLE = 12;
const MAX_TOTAL_NAME_WIDTH_PAIR = 16;
const MAX_NAMED_TYPERS = 2;

const ELLIPSIS = "…";

function tr(
  translate: TypingPreviewTranslate | undefined,
  key: string,
  fallback: string,
  opts?: Record<string, unknown>
): string {
  if (!translate) return fallback;
  return translate(key, { defaultValue: fallback, ...opts });
}

/**
 * Visual width: CJK / full-width / emoji-ish code points count as 2.
 * Sufficient for header preview heuristics; not a true grapheme measure.
 */
export function visualWidth(input: string): number {
  if (!input) return 0;
  let width = 0;
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK Unified Ideographs, Hangul, Hiragana/Katakana, full-width forms,
    // surrogate-pair (>= 0x10000) emojis and symbols.
    if (
      code >= 0x1100 &&
      (code <= 0x115f ||
        code === 0x2329 ||
        code === 0x232a ||
        (code >= 0x2e80 && code <= 0x303e) ||
        (code >= 0x3041 && code <= 0x33ff) ||
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0xa000 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe30 && code <= 0xfe4f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        code >= 0x10000)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * Trim a display name to fit `maxWidth` visual columns, appending an
 * ellipsis when truncation occurs. Always keeps at least the first char.
 */
export function truncateName(name: string, maxWidth: number): string {
  if (!name) return name;
  if (visualWidth(name) <= maxWidth) return name;
  let out = "";
  let used = 0;
  // Reserve 1 column for the ellipsis. The ellipsis itself is half-width.
  const budget = Math.max(1, maxWidth - 1);
  for (const ch of name) {
    const w = visualWidth(ch);
    if (used + w > budget) break;
    out += ch;
    used += w;
  }
  if (!out) {
    // maxWidth too small even for the first char — just take it raw.
    const first = Array.from(name)[0] ?? "";
    return `${first}${ELLIPSIS}`;
  }
  return `${out}${ELLIPSIS}`;
}

function pickAggregateActivity(typers: TypersMap): TypingActivity {
  // Voice wins over text when both appear concurrently.
  for (const indicator of Object.values(typers)) {
    if (indicator.activity === "voice") return "voice";
  }
  return "text";
}

function actionWord(
  activity: TypingActivity,
  translate?: TypingPreviewTranslate
): string {
  return activity === "voice"
    ? tr(translate, "typing.recording", "正在录音…")
    : tr(translate, "typing.typing", "正在输入…");
}

function nameWithAction(
  name: string,
  activity: TypingActivity,
  translate?: TypingPreviewTranslate
): string {
  return activity === "voice"
    ? tr(translate, "typing.namedRecording", `${name} 正在录音…`, { name })
    : tr(translate, "typing.namedTyping", `${name} 正在输入…`, { name });
}

function pairTyping(
  n1: string,
  n2: string,
  activity: TypingActivity,
  translate?: TypingPreviewTranslate
): string {
  // For group "two named" path we currently use the typing wording even when
  // activity is voice, mirroring WhatsApp/Telegram (which collapse mixed
  // activity into the generic verb).
  void activity;
  return tr(translate, "typing.pairTyping", `${n1}、${n2} 正在输入…`, {
    n1,
    n2
  });
}

function countTyping(
  count: number,
  translate?: TypingPreviewTranslate
): string {
  return tr(translate, "typing.countTyping", `${count} 人正在输入…`, {
    count
  });
}

/**
 * Build a one-line typing preview string. Returns null when there are no
 * active typers, allowing callers to fall back to the regular preview row.
 */
export function buildTypingPreview(
  options: BuildTypingPreviewOptions
): TypingPreview | null {
  const { typers, isGroup, resolveDisplayName, translate } = options;
  if (!typers) return null;
  const userIds = Object.keys(typers).map(id => Number(id));
  if (userIds.length === 0) return null;

  const activity = pickAggregateActivity(typers);

  if (!isGroup) {
    return { text: actionWord(activity, translate), activity };
  }

  // Group chats: try to show up to MAX_NAMED_TYPERS names; degrade to a
  // count when names are missing or would overflow.
  const named: string[] = [];
  for (const uid of userIds) {
    if (named.length >= MAX_NAMED_TYPERS) break;
    const resolved = resolveDisplayName?.(uid);
    if (resolved && resolved.trim()) {
      named.push(resolved.trim());
    }
  }

  // No names resolvable → use a count or, if only one typer, the generic verb.
  if (named.length === 0) {
    if (userIds.length === 1) {
      return { text: actionWord(activity, translate), activity };
    }
    return { text: countTyping(userIds.length, translate), activity };
  }

  if (userIds.length === 1 && named.length === 1) {
    const truncated = truncateName(named[0], MAX_NAME_WIDTH_SINGLE);
    return { text: nameWithAction(truncated, activity, translate), activity };
  }

  if (userIds.length === 2 && named.length === 2) {
    const totalWidth = visualWidth(named[0]) + visualWidth(named[1]);
    if (totalWidth <= MAX_TOTAL_NAME_WIDTH_PAIR) {
      return {
        text: pairTyping(named[0], named[1], activity, translate),
        activity
      };
    }
    return { text: countTyping(2, translate), activity };
  }

  // >= 3 typers
  return { text: countTyping(userIds.length, translate), activity };
}
