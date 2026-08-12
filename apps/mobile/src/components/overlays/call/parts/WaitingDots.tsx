import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { useAppTheme } from "../../../../styles/app-styles";

export function WaitingDots() {
  const { styles } = useAppTheme();
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(animation, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    loop.start();
    return () => loop.stop();
  }, [animation]);

  return (
    <View style={styles.callWaitingDots} pointerEvents="none">
      {[0, 1, 2].map(index => {
        const opacity = animation.interpolate({
          inputRange: [0, 0.18, 0.36, 0.58, 1],
          outputRange:
            index === 0
              ? [0.28, 1, 0.28, 0.28, 0.28]
              : index === 1
                ? [0.28, 0.28, 1, 0.28, 0.28]
                : [0.28, 0.28, 0.28, 1, 0.28]
        });

        return (
          <Animated.View
            key={index}
            style={[styles.callWaitingDot, { opacity }]}
          />
        );
      })}
    </View>
  );
}
