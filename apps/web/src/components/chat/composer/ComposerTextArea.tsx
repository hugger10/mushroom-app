import { useState } from "react";
import { Input } from "antd";
import { MAX_TEXT_LENGTH } from "@mushroom/shared";
import type { MentionOption, TextSelectionRef } from "./types";
import { readTextAreaSelection } from "./utils";

interface ComposerTextAreaProps {
  value: string;
  placeholder: string;
  hasTextInput: boolean;
  isMentionMenuVisible: boolean;
  mentionOptions: MentionOption[];
  highlightedMentionIndex: number;
  selectionRef: TextSelectionRef;
  onApplyMentionOption: (option: MentionOption) => void;
  onChangeValue: (nextValue: string) => void;
  onDismissMentionMenu: () => void;
  onHighlightedMentionIndexChange: (
    updater: (current: number) => number
  ) => void;
  onSelectionChange: (value: string, cursor: number) => void;
  onSend: () => void;
}

export function ComposerTextArea({
  value,
  placeholder,
  hasTextInput,
  isMentionMenuVisible,
  mentionOptions,
  highlightedMentionIndex,
  selectionRef,
  onApplyMentionOption,
  onChangeValue,
  onDismissMentionMenu,
  onHighlightedMentionIndexChange,
  onSelectionChange,
  onSend
}: ComposerTextAreaProps) {
  const [isComposing, setIsComposing] = useState(false);

  const captureSelection = (target: HTMLTextAreaElement) => {
    const nextSelection = readTextAreaSelection(target);
    selectionRef.current = nextSelection;
    onSelectionChange(target.value, nextSelection.end);
  };

  return (
    <Input.TextArea
      className="im-composer-textarea"
      value={value}
      onChange={event => {
        const target = event.target as HTMLTextAreaElement;
        selectionRef.current = readTextAreaSelection(target);
        onChangeValue(target.value);
      }}
      onSelect={event => {
        captureSelection(event.target as HTMLTextAreaElement);
      }}
      onClick={event => {
        captureSelection(event.target as HTMLTextAreaElement);
      }}
      onKeyUp={event => {
        const target = event.target as HTMLTextAreaElement;
        if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) {
          return;
        }
        captureSelection(target);
      }}
      onKeyDown={event => {
        if (
          isComposing ||
          ("isComposing" in event.nativeEvent &&
            Boolean(event.nativeEvent.isComposing))
        ) {
          return;
        }
        if (isMentionMenuVisible) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onHighlightedMentionIndexChange(current =>
              current >= mentionOptions.length - 1 ? 0 : current + 1
            );
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            onHighlightedMentionIndexChange(current =>
              current <= 0 ? mentionOptions.length - 1 : current - 1
            );
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onDismissMentionMenu();
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onApplyMentionOption(
              mentionOptions[highlightedMentionIndex] || mentionOptions[0]
            );
            return;
          }
        }

        if (event.key === "Enter" && !event.shiftKey && hasTextInput) {
          event.preventDefault();
          onSend();
        }
      }}
      placeholder={placeholder}
      autoSize={{ minRows: 1, maxRows: 3 }}
      maxLength={MAX_TEXT_LENGTH}
      style={{ resize: "none" }}
      onCompositionStart={() => {
        setIsComposing(true);
      }}
      onCompositionEnd={() => {
        setIsComposing(false);
      }}
    />
  );
}
