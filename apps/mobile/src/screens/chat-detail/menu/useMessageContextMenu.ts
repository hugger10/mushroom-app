import { Message } from "@mushroom/shared";
import { useCallback, useState } from "react";
import { Keyboard } from "react-native";
import type { MessageMenuAnchor } from "../../../features/chat";

export type UseMessageContextMenuInput = {
  onSelectMessage: (message: Message) => void;
  onCloseSelectedMessage: () => void;
};

export function useMessageContextMenu(input: UseMessageContextMenuInput) {
  const { onSelectMessage, onCloseSelectedMessage } = input;
  const [menuAnchor, setMenuAnchor] = useState<MessageMenuAnchor | null>(null);

  const handleMessageLongPress = useCallback(
    (message: Message, anchor: MessageMenuAnchor) => {
      Keyboard.dismiss();
      onSelectMessage(message);
      setMenuAnchor(anchor);
    },
    [onSelectMessage]
  );

  const handleCloseMenu = useCallback(() => {
    setMenuAnchor(null);
    onCloseSelectedMessage();
  }, [onCloseSelectedMessage]);

  return { menuAnchor, setMenuAnchor, handleMessageLongPress, handleCloseMenu };
}
