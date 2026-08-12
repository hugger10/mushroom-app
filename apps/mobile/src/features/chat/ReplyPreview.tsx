import { getMessageSummaryText, type Message } from "@mushroom/shared";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../styles/app-styles";

export function ReplyPreview(props: {
  replyTarget: Message | null;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { styles } = useAppTheme();
  if (!props.replyTarget) {
    return null;
  }

  return (
    <View style={styles.replyPreview}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.replyPreviewLabel}>
          {t("chat.replyTo", {
            name:
              props.replyTarget.sender_nickname ||
              t("chatMessage.unknownUser", {
                id: props.replyTarget.sender_id
              })
          })}
        </Text>
        <Text numberOfLines={2} style={styles.replyPreviewText}>
          {getMessageSummaryText(props.replyTarget.content, t)}
        </Text>
      </View>
      <Pressable
        onPress={props.onCancel}
        hitSlop={8}
        style={{ alignSelf: "flex-start", paddingTop: 2 }}
      >
        <Ionicons name="close" size={18} color="#FF3B30" />
      </Pressable>
    </View>
  );
}
