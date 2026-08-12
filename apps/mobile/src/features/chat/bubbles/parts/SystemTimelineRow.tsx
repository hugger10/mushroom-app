import { memo } from "react";
import { Text, View } from "react-native";
import { useAppTheme } from "../../../../styles/app-styles";

export interface SystemTimelineRowProps {
  text: string;
}

export const SystemTimelineRow = memo(function SystemTimelineRow({
  text
}: SystemTimelineRowProps) {
  const { styles } = useAppTheme();
  return (
    <View style={styles.messageRow}>
      <View style={styles.systemMessageWrap}>
        <Text style={styles.systemMessageText}>{text}</Text>
      </View>
    </View>
  );
});
