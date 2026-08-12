import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  getFileMessageKindLabel,
  type MessageFileContent
} from "@mushroom/shared";
import { useAppTheme } from "../../../../styles/app-styles";

export interface AudioBubbleContentProps {
  content: MessageFileContent;
  voicePlaying: boolean;
  onToggleVoicePlayback: () => void;
  onLongPress: () => void;
}

export const AudioBubbleContent = memo(function AudioBubbleContent(
  props: AudioBubbleContentProps
) {
  const { t } = useTranslation();
  const { styles } = useAppTheme();
  return (
    <Pressable
      onPress={props.onToggleVoicePlayback}
      onLongPress={props.onLongPress}
      delayLongPress={200}
      style={styles.voiceCard}
    >
      <View style={styles.voiceCardRow}>
        <View
          style={[
            styles.voiceActionPill,
            props.voicePlaying ? styles.voiceActionPillActive : null
          ]}
        >
          <Text
            style={[
              styles.voiceActionText,
              props.voicePlaying ? styles.voiceActionTextActive : null
            ]}
          >
            {props.voicePlaying ? t("chatMessage.stop") : t("chatMessage.play")}
          </Text>
        </View>
        <Text style={styles.fileKind}>
          {getFileMessageKindLabel(props.content)}
        </Text>
      </View>
    </Pressable>
  );
});
