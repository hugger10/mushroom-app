import { ActivityIndicator, Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../styles/app-styles";

export function SaveHeaderButton(props: {
  onPress: () => void;
  pending: boolean;
  disabled?: boolean;
  title?: string;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const isDisabled = props.disabled || props.pending;

  return (
    <Pressable
      onPress={props.onPress}
      disabled={isDisabled}
      testID={props.testID}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: props.disabled ? 0.45 : 1
      }}
    >
      {/* Text always occupies space so button width stays stable */}
      <Text
        style={{
          color: theme.colors.accent,
          fontSize: 14,
          fontWeight: "700",
          opacity: props.pending ? 0 : 1
        }}
      >
        {props.title ?? t("common.save")}
      </Text>

      {props.pending ? (
        <ActivityIndicator
          size="small"
          color={theme.colors.accent}
          style={{ position: "absolute" }}
        />
      ) : null}
    </Pressable>
  );
}
