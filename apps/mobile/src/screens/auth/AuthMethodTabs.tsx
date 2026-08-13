import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../styles/app-styles";
import type { AuthMethod } from "../../types/app";

export function AuthMethodTabs(props: {
  value: AuthMethod;
  onChange: (method: AuthMethod) => void;
}) {
  const { t } = useTranslation();
  const { styles } = useAppTheme();

  const tabs: { key: AuthMethod; label: string }[] = [
    { key: "account", label: t("auth.methodAccount") },
    { key: "phone", label: t("auth.methodPhone") }
  ];

  return (
    <View style={styles.authMethodTabs}>
      {tabs.map(tab => {
        const active = props.value === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => props.onChange(tab.key)}
            style={[styles.authMethodTab, active && styles.authMethodTabActive]}
            testID={`auth-method-${tab.key}`}
          >
            <Text
              style={[
                styles.authMethodTabText,
                active && styles.authMethodTabTextActive
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
