import { memo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Message } from "@mushroom/shared";
import { useAppTheme } from "../../../../styles/app-styles";
import { renderHighlightedText } from "../utils/highlightText";

export interface ReplyPreviewBlockProps {
  replyTo: NonNullable<Message["reply_to"]>;
  searchActive?: boolean;
  searchKeyword?: string;
}

export const ReplyPreviewBlock = memo(function ReplyPreviewBlock({
  replyTo,
  searchActive,
  searchKeyword
}: ReplyPreviewBlockProps) {
  const { t } = useTranslation();
  const { styles } = useAppTheme();
  return (
    <View style={styles.replyBlock}>
      <Text style={styles.replyAuthor}>
        {replyTo.sender_nickname ||
          t("chatMessage.unknownUser", { id: replyTo.sender_id })}
      </Text>
      <Text numberOfLines={2} style={styles.replyText}>
        {searchActive
          ? renderHighlightedText(
              replyTo.text,
              searchKeyword,
              styles.searchHighlightText
            )
          : replyTo.text}
      </Text>
    </View>
  );
});
