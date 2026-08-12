import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import type { PresenceLevel } from "@mushroom/shared";
import { useAppTheme } from "../../styles/app-styles";

export interface OnlineStatusDotProps {
  level: PresenceLevel;
  /** Diameter of the dot in px. Defaults to 12. */
  size?: number;
  /** Border (halo) color around the dot. Defaults to theme.colors.surface. */
  borderColor?: string;
  /** Border thickness in px. Defaults to 2. */
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Avatar online-status indicator.
 *
 * Renders a small accent dot when the user is online or recently active,
 * and renders nothing when offline. The caller is responsible for placing
 * this component (typically absolutely positioned over the avatar's
 * bottom-right corner).
 */
export function OnlineStatusDot(props: OnlineStatusDotProps) {
  const { t } = useTranslation();
  const { level } = props;
  const { theme } = useAppTheme();

  if (level === "offline") {
    return null;
  }

  const size = props.size ?? 12;
  const borderWidth = props.borderWidth ?? 2;
  const borderColor = props.borderColor ?? theme.colors.surface;
  const backgroundColor =
    level === "online" ? theme.colors.accent : theme.colors.presenceRecent;

  return (
    <View
      accessibilityLabel={
        level === "online" ? t("chatDetail.online") : t("ui.recentlyActive")
      }
      testID={props.testID}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          borderColor,
          borderWidth
        },
        props.style
      ]}
    />
  );
}
