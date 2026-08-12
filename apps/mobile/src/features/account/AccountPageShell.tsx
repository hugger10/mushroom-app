import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../styles/app-styles";
import { PressableRow } from "../../hooks/usePressAnimation";

export function AccountPageShell(props: {
  title: string;
  onBack: () => void;
  rightAction?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.meScreenPage,
        {
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 12)
        }
      ]}
      testID={props.testID}
    >
      <View style={styles.meScreenPageHeader}>
        <PressableRow
          onPress={props.onBack}
          style={styles.meScreenPageHeaderButton}
          idleColor="transparent"
        >
          <Icon name="chevron-back" size={28} color={theme.colors.text} />
        </PressableRow>
        <Text numberOfLines={1} style={styles.meScreenPageTitle}>
          {props.title}
        </Text>
        <View
          style={[
            styles.meScreenPageHeaderAction,
            props.rightAction
              ? {
                  width: undefined,
                  minWidth: 44,
                  maxWidth: 140,
                  paddingHorizontal: 8,
                  flexShrink: 0
                }
              : null
          ]}
        >
          {props.rightAction ?? (
            <View style={styles.meScreenPageHeaderSpacer} />
          )}
        </View>
      </View>
      {props.children}
    </View>
  );
}
