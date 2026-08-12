import { useTranslation } from "react-i18next";
import { getSystemMessageText, isSystemMessageContent } from "@mushroom/shared";
import type { Message } from "../../../types/chat";

interface SystemMessageChipProps {
  message: Message;
}

/**
 * Centered chip rendered for system messages (`type === 0`). Bypasses the
 * regular row/bubble framework — sits inline in the list between regular rows.
 */
export function SystemMessageChip({ message }: SystemMessageChipProps) {
  const { t } = useTranslation();
  return (
    <div className="im-system-message">
      <div className="im-system-message-chip">
        {isSystemMessageContent(message.content)
          ? getSystemMessageText(message.content, t)
          : (message.content.text as string)}
      </div>
    </div>
  );
}
