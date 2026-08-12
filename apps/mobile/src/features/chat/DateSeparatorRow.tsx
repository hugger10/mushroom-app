import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../styles/app-styles";

/**
 * WhatsApp-style date separator row in mobile chat detail.
 * Visually lighter and smaller than the system message chip.
 */
export const DateSeparatorRow = memo(function DateSeparatorRow({
  label
}: {
  label: string;
}) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.row}>
      <Text
        style={[styles.text, { color: theme.colors.textSoft, opacity: 0.85 }]}
      >
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    backgroundColor: "transparent",
    letterSpacing: 0.2
  }
});
