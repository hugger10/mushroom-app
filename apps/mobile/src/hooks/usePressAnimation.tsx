import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { useAppTheme } from "../styles/app-styles";

export function usePressAnimation(idleColor?: string) {
  const { theme } = useAppTheme();
  const bgProgress = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      bgProgress.value,
      [0, 1],
      [idleColor ?? theme.colors.background, theme.colors.surfaceMuted]
    )
  }));
  const handlePressIn = () => {
    bgProgress.value = withTiming(1, { duration: 150 });
  };
  const handlePressOut = () => {
    bgProgress.value = withTiming(0, { duration: 200 });
  };
  return { animatedStyle, handlePressIn, handlePressOut };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableRow(props: {
  style: StyleProp<ViewStyle>;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  children: ReactNode;
  idleColor?: string;
}) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressAnimation(
    props.idleColor
  );
  return (
    <AnimatedPressable
      style={[props.style, animatedStyle]}
      onPress={props.onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={props.disabled}
      testID={props.testID}
    >
      {props.children}
    </AnimatedPressable>
  );
}
