import type { ReactNode } from "react";
import type { ContactListItem } from "@mushroom/shared";
import { Pressable, Text, View } from "react-native";
import { AppAvatar } from "../ui";
import { useAppTheme } from "../../styles/app-styles";
import { colorFromSeed } from "../../styles/theme";

export function FriendRow(props: {
  friend: ContactListItem;
  onPress: () => void;
  footer?: ReactNode;
}) {
  const { styles, theme } = useAppTheme();
  const avatarColor = colorFromSeed(
    props.friend.nickname || props.friend.username || "user",
    theme.avatarPalette
  );

  return (
    <>
      <Pressable style={styles.rowCard} onPress={props.onPress}>
        <View style={styles.rowMain}>
          <AppAvatar
            label={props.friend.nickname || props.friend.username || "?"}
            imageUrl={props.friend.avatar_url}
            style={[
              styles.rowAvatar,
              { backgroundColor: avatarColor, borderRadius: 8 }
            ]}
            textStyle={styles.rowAvatarText}
          />
          <View style={styles.rowBody}>
            <View style={styles.rowHeader}>
              <Text numberOfLines={1} style={styles.rowTitle}>
                {props.friend.nickname || props.friend.username}
              </Text>
            </View>
            {props.footer ? (
              <View style={styles.friendFooter}>{props.footer}</View>
            ) : null}
          </View>
        </View>
      </Pressable>
      <View style={styles.rowDivider} />
    </>
  );
}
