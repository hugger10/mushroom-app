import { View, type StyleProp, type ViewStyle } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { colorFromSeed } from "../../styles/theme";
import { useAppTheme } from "../../styles/app-styles";

interface GroupAvatarProps {
  /**
   * Pre-computed seed for the random background color. Prefer the conversation
   * id so the color stays consistent even when the group name changes.
   * See `getConversationAvatarSeed` in `utils/display`.
   */
  seed: string;
  /** Display name, used only as accessibility label. */
  name?: string | null;
  size: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Default group conversation avatar: circular background with a deterministic
 * random color (seeded by `seed`) and a centered group icon. Whether to use a
 * custom uploaded avatar instead is decided by the caller — this component
 * only renders the icon fallback.
 */
export function GroupAvatar({ seed, name, size, style }: GroupAvatarProps) {
  const { theme } = useAppTheme();
  const backgroundColor = colorFromSeed(seed, theme.avatarPalette);

  return (
    <View
      accessibilityLabel={name || undefined}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center"
        },
        style
      ]}
    >
      <Ionicons name="people" size={Math.floor(size * 0.55)} color="#fff" />
    </View>
  );
}
