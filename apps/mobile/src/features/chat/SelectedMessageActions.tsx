import type { Message } from "@mushroom/shared";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { SmallChip } from "../../components/ui";
import { useAppTheme } from "../../styles/app-styles";

export function SelectedMessageActions(props: {
  selectedMessage: Message | null;
  forwardingMessageId: string | null;
  replyTargetId: string | null;
  canRecallMessage: (message: Message | null) => boolean;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onToggleFavorite: (message: Message) => void;
  onTogglePin: (message: Message) => void;
  onRecall: (message: Message) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { styles } = useAppTheme();
  const { selectedMessage } = props;
  if (!selectedMessage || props.forwardingMessageId) {
    return null;
  }

  return (
    <View style={styles.actionTray}>
      <SmallChip
        label={t("chat.reply")}
        active={props.replyTargetId === selectedMessage.client_message_id}
        onPress={() => props.onReply(selectedMessage)}
      />
      <SmallChip
        label={t("chatMessage.forward")}
        onPress={() => props.onForward(selectedMessage)}
      />
      <SmallChip
        label={
          selectedMessage.is_favorited
            ? t("chatMessage.unfavorite")
            : t("chatMessage.favorite")
        }
        active={Boolean(selectedMessage.is_favorited)}
        onPress={() => props.onToggleFavorite(selectedMessage)}
      />
      <SmallChip
        label={
          selectedMessage.is_pinned
            ? t("chatMessage.unpin")
            : t("chatMessage.pin")
        }
        active={Boolean(selectedMessage.is_pinned)}
        onPress={() => props.onTogglePin(selectedMessage)}
      />
      {props.canRecallMessage(selectedMessage) ? (
        <SmallChip
          label={t("chat.recall")}
          tone="danger"
          onPress={() => props.onRecall(selectedMessage)}
        />
      ) : null}
      <SmallChip label={t("common.close")} onPress={props.onClose} />
    </View>
  );
}
