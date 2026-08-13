import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../styles/app-styles";

export function CodeSendButton(props: {
  remaining: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { styles } = useAppTheme();
  const disabled = props.remaining > 0;

  const label = disabled
    ? t("auth.codeCountdown", { seconds: props.remaining })
    : t("auth.sendCode");

  return (
    <Pressable
      disabled={disabled}
      onPress={props.onPress}
      style={[styles.authCodeBtn, disabled && styles.authCodeBtnDisabled]}
      testID="auth-send-code"
    >
      <Text style={styles.authCodeBtnText}>{label}</Text>
    </Pressable>
  );
}
