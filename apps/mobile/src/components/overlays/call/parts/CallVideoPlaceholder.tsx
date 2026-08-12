import { Text, View } from "react-native";
import { useAppTheme } from "../../../../styles/app-styles";
import { AppAvatar } from "../../../ui";

export function CallVideoPlaceholder(props: {
  label: string;
  imageUrl?: string | null;
  compact?: boolean;
}) {
  const { styles } = useAppTheme();

  return (
    <View
      style={
        props.compact
          ? styles.callPreviewPlaceholder
          : styles.callVideoPlaceholder
      }
    >
      {!props.compact ? (
        <AppAvatar
          label={props.label}
          imageUrl={props.imageUrl}
          style={styles.callAudioAvatar}
          textStyle={styles.callAudioAvatarText}
        />
      ) : null}
      <Text
        style={
          props.compact
            ? styles.callPreviewPlaceholderTitle
            : styles.callVideoPlaceholderTitle
        }
      >
        {props.label}
      </Text>
    </View>
  );
}
