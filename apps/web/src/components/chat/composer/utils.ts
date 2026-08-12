import type { MentionQueryRange, TextSelection } from "./types";

export function getMentionQueryRange(
  text: string,
  cursor: number
): MentionQueryRange | null {
  if (cursor < 0) {
    return null;
  }

  const mentionStart = text.lastIndexOf("@", cursor - 1);
  if (mentionStart < 0) {
    return null;
  }

  const previousChar = text[mentionStart - 1];
  if (mentionStart > 0 && previousChar && !/\s/.test(previousChar)) {
    return null;
  }

  const query = text.slice(mentionStart + 1, cursor);
  if (/\s/.test(query)) {
    return null;
  }

  return {
    start: mentionStart,
    end: cursor,
    query
  };
}

export function focusComposerTextarea(
  selectionStart: number,
  selectionEnd: number
) {
  window.requestAnimationFrame(() => {
    const textarea = document.querySelector(
      ".im-composer-textarea"
    ) as HTMLTextAreaElement | null;
    textarea?.focus();
    textarea?.setSelectionRange(selectionStart, selectionEnd);
  });
}

export function readTextAreaSelection(
  target: HTMLTextAreaElement
): TextSelection {
  return {
    start: target.selectionStart ?? target.value.length,
    end: target.selectionEnd ?? target.value.length
  };
}

export function getVoiceMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? "";
}
