import { Pressable, Text } from "react-native";
import { useAppTheme } from "../../styles/app-styles";

export function SmallChip(props: {
  label: string;
  active?: boolean;
  tone?: "default" | "danger";
  onPress: () => void;
}) {
  const { styles } = useAppTheme();
  return (
    <Pressable
      onPress={props.onPress}
      style={[
        styles.smallChip,
        props.active ? styles.smallChipActive : null,
        props.tone === "danger" ? styles.smallChipDanger : null
      ]}
    >
      <Text
        style={[
          styles.smallChipText,
          props.active ? styles.smallChipTextActive : null,
          props.tone === "danger" ? styles.smallChipTextDanger : null
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}
