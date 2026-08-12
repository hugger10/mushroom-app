import { useCallback, useMemo, useState } from "react";
import type { Conversation } from "../../../types/chat";
import type { LoginUser } from "../../../types/user";
import type { MessageMention } from "@mushroom/shared";

interface UseGroupMentionPickerOptions {
  activeConversation: Conversation | null;
  loginUser: LoginUser;
  onPickMention: (mention: MessageMention) => void;
  onPickMentionAll: () => void;
}

export function useGroupMentionPicker({
  activeConversation,
  loginUser,
  onPickMention,
  onPickMentionAll
}: UseGroupMentionPickerOptions) {
  const [isMentionPickerVisible, setIsMentionPickerVisible] = useState(false);

  const currentGroupMember = useMemo(
    () =>
      activeConversation?.type === 2
        ? activeConversation.members?.find(
            member => member.user_id === loginUser.userId
          )
        : undefined,
    [activeConversation, loginUser.userId]
  );

  const canMentionAll = (currentGroupMember?.role ?? 0) >= 1;

  const handlePickMention = useCallback(
    (mention: MessageMention) => {
      onPickMention(mention);
      setIsMentionPickerVisible(false);
    },
    [onPickMention]
  );

  const handlePickMentionAll = useCallback(() => {
    onPickMentionAll();
    setIsMentionPickerVisible(false);
  }, [onPickMentionAll]);

  return {
    currentGroupMember,
    canMentionAll,
    isMentionPickerVisible,
    setIsMentionPickerVisible,
    handlePickMention,
    handlePickMentionAll
  };
}
