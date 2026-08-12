import { Pressable, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../../../styles/app-styles";

export function CallCircleButton(props: {
  icon: string;
  label: string;
  tone?: "default" | "danger" | "accept";
  active?: boolean;
  onPress: () => void;
}) {
  const { styles } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.callCircleButton,
        pressed ? styles.callCircleButtonPressed : null
      ]}
    >
      <View
        style={[
          styles.callCircleButtonIconWrap,
          props.tone === "danger" ? styles.callCircleButtonDanger : null,
          props.tone === "accept" ? styles.callCircleButtonAccept : null,
          props.active ? styles.callCircleButtonActive : null
        ]}
      >
        <Ionicons
          name={props.icon}
          style={styles.callCircleButtonIcon}
          color="#ffffff"
        />
      </View>
      <Text style={styles.callCircleButtonLabel}>{props.label}</Text>
    </Pressable>
  );
}
