import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../styles/app-styles";
import { usePressAnimation } from "../../hooks/usePressAnimation";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function FunctionEntryRow(props: {
  icon: string;
  iconColor: string;
  iconBg: string;
  label: string;
  badge?: number;
  onPress: () => void;
  testID?: string;
  isLast?: boolean;
}) {
  const { styles } = useAppTheme();
  const { animatedStyle, handlePressIn, handlePressOut } = usePressAnimation();

  return (
    <>
      <AnimatedPressable
        style={[styles.funcEntryRow, animatedStyle]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={props.onPress}
        testID={props.testID}
      >
        <View
          style={[styles.funcEntryIconWrap, { backgroundColor: props.iconBg }]}
        >
          <Ionicons name={props.icon} size={18} color={props.iconColor} />
        </View>
        <View style={styles.funcEntryBody}>
          <Text style={styles.funcEntryLabel}>{props.label}</Text>
        </View>
        {props.badge != null && props.badge > 0 ? (
          <View style={styles.funcEntryBadge}>
            <Text style={styles.funcEntryBadgeText}>{props.badge}</Text>
          </View>
        ) : null}
        <Ionicons
          name="chevron-forward"
          size={16}
          color={styles.funcEntryArrowColor.color}
        />
      </AnimatedPressable>
      {!props.isLast ? <View style={styles.funcEntryDivider} /> : null}
    </>
  );
}
