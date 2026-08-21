import { useEffect } from "react";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { useAppTheme } from "../../styles/app-styles";

const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;
const THUMB_SIZE = 24;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - 4;

export function AppSwitch(props: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { theme } = useAppTheme();
  const progress = useSharedValue(props.value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(props.value ? 1 : 0, { duration: 180 });
  }, [props.value, progress]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }]
  }));

  return (
    <Pressable
      onPress={() => {
        if (props.disabled) return;
        props.onValueChange(!props.value);
      }}
      disabled={props.disabled}
      testID={props.testID}
      style={{
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        borderRadius: TRACK_HEIGHT / 2,
        paddingHorizontal: 2,
        justifyContent: "center",
        backgroundColor: props.value
          ? theme.colors.accentMuted
          : theme.colors.surfaceMuted,
        opacity: props.disabled ? 0.5 : 1
      }}
    >
      <Animated.View
        style={[
          {
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: THUMB_SIZE / 2,
            backgroundColor: props.value
              ? theme.colors.accent
              : theme.colors.textSoft
          },
          thumbStyle
        ]}
      />
    </Pressable>
  );
}
