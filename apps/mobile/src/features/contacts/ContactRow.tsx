import type { ContactListItem } from "@mushroom/shared";
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  type SharedValue
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { AppAvatar } from "../../components/ui";
import { useAppTheme } from "../../styles/app-styles";
import { colorFromSeed } from "../../styles/theme";
import { usePressAnimation } from "../../hooks/usePressAnimation";

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

function RemarkAction(props: {
  dragX: SharedValue<number>;
  onPress: () => void;
  testID: string;
}) {
  const { styles } = useAppTheme();
  const { t } = useTranslation();
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(props.dragX.value, [-80, 0], [0, 80], "clamp")
      }
    ]
  }));
  return (
    <Reanimated.View style={[styles.swipeActionWrap, animatedStyle]}>
      <Pressable
        style={styles.swipeRemarkButton}
        onPress={props.onPress}
        testID={props.testID}
      >
        <Text style={styles.swipeRemarkText}>{t("contacts.remark")}</Text>
      </Pressable>
    </Reanimated.View>
  );
}

export function ContactRow(props: {
  contact: ContactListItem;
  onPress: () => void;
  onRemark?: () => void;
  isLast?: boolean;
}) {
  const { styles, theme } = useAppTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const { animatedStyle, handlePressIn, handlePressOut } = usePressAnimation();
  const displayName =
    props.contact.remark_name ||
    props.contact.nickname ||
    props.contact.username ||
    "";
  const avatarColor = colorFromSeed(displayName || "user", theme.avatarPalette);

  const row = (
    <AnimatedPressable
      style={[
        styles.contactsRow,
        props.isLast ? styles.contactsRowLast : null,
        animatedStyle
      ]}
      onPress={props.onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      testID={`contact-row-${props.contact.user_id}`}
    >
      <AppAvatar
        label={displayName || "?"}
        imageUrl={props.contact.avatar_url}
        style={[styles.contactsAvatar, { backgroundColor: avatarColor }]}
        textStyle={styles.contactsAvatarText}
      />
      <View style={styles.contactsRowBody}>
        <Text numberOfLines={1} style={styles.contactsRowTitle}>
          {displayName}
        </Text>
      </View>
    </AnimatedPressable>
  );

  return (
    <>
      {props.onRemark ? (
        <ReanimatedSwipeable
          ref={swipeableRef}
          renderRightActions={(_progress, dragX) => (
            <RemarkAction
              dragX={dragX}
              onPress={() => {
                swipeableRef.current?.close();
                props.onRemark?.();
              }}
              testID={`contact-remark-${props.contact.user_id}`}
            />
          )}
          overshootRight={false}
          rightThreshold={40}
        >
          {row}
        </ReanimatedSwipeable>
      ) : (
        row
      )}
      {!props.isLast ? <View style={styles.contactsListDivider} /> : null}
    </>
  );
}
