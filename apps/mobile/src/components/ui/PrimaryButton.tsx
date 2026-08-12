import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from "react-native";
import { useAppTheme } from "../../styles/app-styles";

export function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "primary" | "secondary" | "danger";
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { styles } = useAppTheme();
  const toneStyle =
    props.tone === "danger"
      ? styles.buttonDanger
      : props.tone === "secondary"
        ? styles.buttonSecondary
        : styles.buttonPrimary;
  const labelStyle: StyleProp<TextStyle> = [
    styles.buttonLabel,
    props.tone === "secondary" ? styles.buttonLabelSecondary : null,
    props.tone === "danger" ? styles.buttonLabelDanger : null
  ];
  const flattenedLabel = StyleSheet.flatten(labelStyle) as
    | { color?: string }
    | undefined;
  const indicatorColor = flattenedLabel?.color ?? "#ffffff";
  const isDisabled = props.disabled || props.loading;

  return (
    <Pressable
      disabled={isDisabled}
      onPress={props.onPress}
      testID={props.testID}
      style={({ pressed }) => [
        styles.buttonBase,
        props.compact ? styles.buttonCompact : null,
        toneStyle,
        props.style,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed
      ]}
    >
      {props.loading ? (
        <ActivityIndicator size="small" color={indicatorColor} />
      ) : (
        <Text style={labelStyle}>{props.label}</Text>
      )}
    </Pressable>
  );
}
