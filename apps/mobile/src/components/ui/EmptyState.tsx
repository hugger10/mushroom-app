import { Text, View } from "react-native";
import { useAppTheme } from "../../styles/app-styles";

export function EmptyState({ label }: { label: string }) {
  const { styles } = useAppTheme();
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>{label}</Text>
    </View>
  );
}
