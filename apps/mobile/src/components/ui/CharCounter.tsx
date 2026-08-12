import { Text, View } from "react-native";
import { useAppTheme } from "../../styles/app-styles";

/**
 * 输入框字符计数器（多行编辑页右下角，如 "12/100"）。
 *
 * 达到上限时数字变红，配合 `TextInput.maxLength` 提示用户已经输满。
 */
export function CharCounter(props: {
  current: number;
  max: number;
  testID?: string;
}) {
  const { theme } = useAppTheme();
  const exhausted = props.current >= props.max;

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "flex-end",
        marginTop: 4,
        paddingRight: 4
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: exhausted ? "700" : "500",
          color: exhausted ? "#ef4444" : theme.colors.textSoft,
          fontVariant: ["tabular-nums"]
        }}
        testID={props.testID ?? "char-counter"}
      >
        {props.current}/{props.max}
      </Text>
    </View>
  );
}
