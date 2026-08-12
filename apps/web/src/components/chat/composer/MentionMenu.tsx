import { Avatar } from "antd";
import type { MentionOption } from "./types";

interface MentionMenuProps {
  highlightedMentionIndex: number;
  mentionOptions: MentionOption[];
  onApplyMentionOption: (option: MentionOption) => void;
}

export function MentionMenu({
  highlightedMentionIndex,
  mentionOptions,
  onApplyMentionOption
}: MentionMenuProps) {
  return (
    <div className="im-composer-mention-menu">
      {mentionOptions.map((option, index) => (
        <button
          key={option.key}
          type="button"
          className={`im-composer-mention-item${index === highlightedMentionIndex ? " is-active" : ""}`}
          onMouseDown={event => {
            event.preventDefault();
            onApplyMentionOption(option);
          }}
        >
          {option.kind === "all" ? (
            <Avatar className="im-composer-mention-avatar">@</Avatar>
          ) : (
            <Avatar
              className="im-composer-mention-avatar"
              src={option.avatarUrl || undefined}
            >
              {option.nickname?.[0]}
            </Avatar>
          )}
          <span className="im-composer-mention-copy">
            <span className="im-composer-mention-name">
              {option.kind === "all" ? option.label : option.nickname}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
