import type { MobileMessageSearchResult } from "@mushroom/app-core";
import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../styles/app-styles";
import { formatConversationTime } from "../../utils/app-ui";

export function SearchResultRow(props: {
  result: MobileMessageSearchResult;
  active: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { styles } = useAppTheme();
  return (
    <Pressable
      onPress={props.onPress}
      style={[
        styles.searchResultCard,
        props.active ? styles.searchResultCardActive : null
      ]}
    >
      <Text numberOfLines={1} style={styles.searchResultTitle}>
        {props.result.message.sender_nickname ||
          t("chatMessage.unknownUser", {
            id: props.result.message.sender_id
          })}
        <Text style={styles.searchResultMeta}>
          {` · ${formatConversationTime(props.result.message.created_at)}`}
        </Text>
      </Text>
      <Text numberOfLines={2} style={styles.searchResultBody}>
        {props.result.summary}
      </Text>
    </Pressable>
  );
}
