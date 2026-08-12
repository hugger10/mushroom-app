import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { useAppTheme } from "../../styles/app-styles";
import { IconGlyph } from "./IconGlyph";
import { PressableRow } from "../../hooks/usePressAnimation";

export function TabButton(props: {
  label: string;
  icon: "chat" | "contacts" | "settings";
  active: boolean;
  hasAlert?: boolean;
  testID?: string;
  alertTestID?: string;
  onPress: () => void;
}) {
  const { styles } = useAppTheme();
  const scaleAnim = useRef(new Animated.Value(props.active ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: props.active ? 1 : 0,
      useNativeDriver: true,
      friction: 6,
      tension: 60
    }).start();
  }, [props.active, scaleAnim]);

  const scale = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1]
  });

  return (
    <PressableRow
      onPress={props.onPress}
      testID={props.testID}
      style={[styles.tabButton, props.active ? styles.tabButtonActive : null]}
      idleColor="transparent"
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <IconGlyph
          name={props.icon}
          active={props.active}
          textStyle={styles.tabButtonIconText}
        />
      </Animated.View>
      <Text
        style={[
          styles.tabButtonLabel,
          props.active ? styles.tabButtonLabelActive : null
        ]}
      >
        {props.label}
      </Text>
      {props.hasAlert ? (
        <View style={styles.tabBadgeWrap} testID={props.alertTestID}>
          <Text style={styles.tabBadgeText}>!</Text>
        </View>
      ) : null}
    </PressableRow>
  );
}
