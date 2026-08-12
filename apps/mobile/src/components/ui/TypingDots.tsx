import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { useAppTheme } from "../../styles/app-styles";

export function TypingDots(props: {
  tone?: "dark" | "light";
  size?: "sm" | "md";
}) {
  const { styles } = useAppTheme();
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(animation, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    loop.start();
    return () => loop.stop();
  }, [animation]);

  const sizeStyle = props.size === "sm" ? styles.typingDotSmall : null;
  const darkTone = props.tone !== "light";

  return (
    <View style={styles.typingDotsRow}>
      {[0, 1, 2].map(index => {
        const opacity = animation.interpolate({
          inputRange: [0, 0.2 + index * 0.12, 0.45 + index * 0.12, 1],
          outputRange: [0.28, 0.28, 1, 0.28]
        });
        const translateY = animation.interpolate({
          inputRange: [0, 0.2 + index * 0.12, 0.45 + index * 0.12, 1],
          outputRange: [0, 0, -3, 0]
        });

        return (
          <Animated.View
            key={`typing:${index}`}
            style={[
              styles.typingDot,
              sizeStyle,
              darkTone ? styles.typingDotDark : styles.typingDotLight,
              {
                opacity,
                transform: [{ translateY }]
              }
            ]}
          />
        );
      })}
    </View>
  );
}
