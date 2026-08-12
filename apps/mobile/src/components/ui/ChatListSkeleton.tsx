import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { useAppTheme } from "../../styles/app-styles";

export function ChatListSkeleton() {
  const { styles } = useAppTheme();
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(animation, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(animation, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animation]);

  const opacity = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.42, 0.88]
  });

  return (
    <Animated.View style={[styles.skeletonScreen, { opacity }]}>
      <View style={styles.skeletonHeaderRow}>
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonHeaderIcons}>
          <View style={styles.skeletonCircleSmall} />
        </View>
      </View>

      <View style={styles.skeletonSearchBar} />

      <View style={styles.skeletonList}>
        {Array.from({ length: 7 }).map((_, index) => (
          <View key={`row:${index}`} style={styles.skeletonChatRow}>
            <View style={styles.skeletonCircleMedium} />
            <View style={styles.skeletonChatBody}>
              <View style={styles.skeletonChatTopLine} />
              <View style={styles.skeletonChatBottomLine} />
            </View>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}
