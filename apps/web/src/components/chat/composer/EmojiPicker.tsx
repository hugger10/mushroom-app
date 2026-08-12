import { Button, Popover } from "antd";
import { SmileOutlined } from "@ant-design/icons";
import { ALL_EMOJIS } from "./emoji";

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

export function EmojiPicker({ onEmojiSelect }: EmojiPickerProps) {
  return (
    <Popover
      trigger="click"
      placement="topRight"
      content={
        <div className="im-composer-emoji-grid">
          {ALL_EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => onEmojiSelect(emoji)}
              className="im-composer-emoji-button"
            >
              {emoji}
            </button>
          ))}
        </div>
      }
    >
      <Button
        className="im-composer-emoji-trigger"
        type="text"
        icon={<SmileOutlined className="im-composer-emoji-trigger-icon" />}
      />
    </Popover>
  );
}
