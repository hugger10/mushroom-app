import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../../styles/app-styles";
import { PressableRow } from "../../hooks/usePressAnimation";

export function SubPanelHeader(props: {
  title: string;
  onBack: () => void;
  rightElement?: ReactNode;
}) {
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.groupInfoSubHeader,
        {
          backgroundColor: theme.colors.background,
          marginTop: -insets.top,
          paddingTop: insets.top,
          minHeight: 56 + insets.top
        }
      ]}
    >
      <PressableRow
        style={styles.groupInfoHeaderButton}
        onPress={props.onBack}
        idleColor="transparent"
      >
        <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
      </PressableRow>
      <Text style={styles.groupInfoSubTitle} numberOfLines={1}>
        {props.title}
      </Text>
      {props.rightElement ?? <View style={styles.groupInfoHeaderPlaceholder} />}
    </View>
  );
}
