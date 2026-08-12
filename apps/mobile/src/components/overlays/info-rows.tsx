import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import Lucide from "@react-native-vector-icons/lucide/static";
import type { LucideIconName } from "@react-native-vector-icons/lucide/static";
import Ionicons from "react-native-vector-icons/Ionicons";
import type { useAppTheme } from "../../styles/app-styles";
import { usePressAnimation } from "../../hooks/usePressAnimation";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Styles = ReturnType<typeof useAppTheme>["styles"];
type Theme = ReturnType<typeof useAppTheme>["theme"];

/* ───────── Quick action circle ───────── */
export function QuickAction(props: {
  styles: Styles;
  theme: Theme;
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressAnimation(
    props.theme.colors.background
  );
  return (
    <AnimatedPressable
      style={[props.styles.chatInfoQuickActionItem, animatedStyle]}
      onPress={props.onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={props.disabled}
    >
      <View
        style={[
          props.styles.chatInfoQuickActionCircle,
          props.disabled ? props.styles.chatInfoQuickActionCircleDisabled : null
        ]}
      >
        <Ionicons
          name={props.icon}
          size={22}
          color={
            props.disabled
              ? props.theme.colors.textMuted
              : props.theme.colors.accent
          }
        />
      </View>
      <Text
        style={[
          props.styles.chatInfoQuickActionLabel,
          props.disabled ? props.styles.chatInfoQuickActionLabelDisabled : null
        ]}
        numberOfLines={1}
      >
        {props.label}
      </Text>
    </AnimatedPressable>
  );
}

/* ───────── Generic list row ───────── */
export function ListRow(props: {
  styles: Styles;
  theme: Theme;
  icon: string;
  iconSet?: "lucide";
  title: string;
  subtitle?: string;
  metaText?: string;
  rightElement?: ReactNode;
  showChevron?: boolean;
  accentTitle?: boolean;
  dangerTitle?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const titleStyle = props.dangerTitle
    ? props.styles.chatInfoListRowDangerText
    : props.accentTitle
      ? props.styles.chatInfoListRowAccentText
      : props.styles.chatInfoListRowTitle;
  const iconColor = props.disabled
    ? props.theme.colors.textMuted
    : props.dangerTitle
      ? props.theme.colors.danger
      : props.accentTitle
        ? props.theme.colors.accent
        : props.theme.colors.textMuted;
  const { animatedStyle, handlePressIn, handlePressOut } = usePressAnimation(
    props.theme.colors.background
  );
  return (
    <AnimatedPressable
      style={[
        props.styles.chatInfoListRow,
        props.disabled ? { opacity: 0.45 } : null,
        animatedStyle
      ]}
      onPress={props.onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={props.disabled || !props.onPress}
    >
      <View style={props.styles.chatInfoListRowIcon}>
        {props.iconSet === "lucide" ? (
          <Lucide
            name={props.icon as LucideIconName}
            size={22}
            color={iconColor}
          />
        ) : (
          <Ionicons name={props.icon} size={22} color={iconColor} />
        )}
      </View>
      <View style={props.styles.chatInfoListRowBody}>
        <Text style={titleStyle} numberOfLines={1}>
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text style={props.styles.chatInfoListRowSubtitle} numberOfLines={1}>
            {props.subtitle}
          </Text>
        ) : null}
      </View>
      {props.metaText ? (
        <Text style={props.styles.chatInfoListRowMeta} numberOfLines={1}>
          {props.metaText}
        </Text>
      ) : null}
      {props.rightElement ?? null}
      {props.showChevron ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={props.theme.colors.textSoft}
        />
      ) : null}
    </AnimatedPressable>
  );
}

/* ───────── Divider (left-indented hairline) ───────── */
export function Divider(props: { styles: Styles }) {
  return <View style={props.styles.chatInfoListRowDivider} />;
}

/* ───────── Toggle Switch ───────── */
export function ToggleSwitch(props: {
  styles: Styles;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onToggle}
      disabled={props.disabled}
      style={[
        props.styles.groupInfoToggle,
        props.value
          ? props.styles.groupInfoToggleOn
          : props.styles.groupInfoToggleOff,
        props.disabled ? { opacity: 0.5 } : null
      ]}
    >
      <View
        style={[
          props.styles.groupInfoToggleThumb,
          props.value
            ? props.styles.groupInfoToggleThumbOn
            : props.styles.groupInfoToggleThumbOff
        ]}
      />
    </Pressable>
  );
}
