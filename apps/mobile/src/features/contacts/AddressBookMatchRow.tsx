import Ionicons from "react-native-vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AppAvatar } from "../../components/ui";
import type { AddressBookMatchCacheEntry } from "../../data/address-book-match-cache";
import { useAppTheme } from "../../styles/app-styles";
import { colorFromSeed } from "../../styles/theme";

export function AddressBookMatchRow(props: {
  entry: AddressBookMatchCacheEntry;
  onOpenConversation: () => void;
  onSaveContact: () => void;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const accountName = props.entry.nickname || props.entry.username;
  const avatarColor = colorFromSeed(
    accountName || "match",
    theme.avatarPalette
  );

  return (
    <View style={styles.addressBookMatchRow}>
      <AppAvatar
        label={accountName || "?"}
        imageUrl={props.entry.avatar_url || undefined}
        style={[
          styles.addressBookMatchAvatar,
          { backgroundColor: avatarColor }
        ]}
        textStyle={styles.contactsAvatarText}
      />
      <View style={styles.addressBookMatchBody}>
        <Text numberOfLines={1} style={styles.addressBookMatchLocalName}>
          {props.entry.local_display_name}
        </Text>
        <Text numberOfLines={1} style={styles.addressBookMatchAccountName}>
          {accountName}
        </Text>
      </View>
      <View style={styles.addressBookMatchActions}>
        <Pressable
          style={({ pressed }) => [
            styles.addressBookMatchIconButton,
            pressed && styles.addressBookMatchIconButtonPressed
          ]}
          onPress={props.onOpenConversation}
          testID={`address-book-match-message-${props.entry.matched_user_id}`}
        >
          <Ionicons
            name="chatbubble-outline"
            size={17}
            color={theme.colors.accentStrong}
          />
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.addressBookMatchSaveButton,
            pressed && styles.addressBookMatchSaveButtonPressed
          ]}
          onPress={props.onSaveContact}
          testID={`address-book-match-save-${props.entry.matched_user_id}`}
        >
          <Text style={styles.addressBookMatchSaveText}>
            {t("common.save")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
