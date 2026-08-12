import { memo } from "react";
import { Pressable } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../../../styles/app-styles";

export interface MultiSelectCheckboxProps {
  selected: boolean;
  onToggle?: () => void;
}

export const MultiSelectCheckbox = memo(function MultiSelectCheckbox({
  selected,
  onToggle
}: MultiSelectCheckboxProps) {
  const { theme } = useAppTheme();
  return (
    <Pressable
      onPress={onToggle}
      style={{
        width: 32,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "center"
      }}
    >
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={24}
        color={selected ? theme.colors.accent : theme.colors.textSoft}
      />
    </Pressable>
  );
});
