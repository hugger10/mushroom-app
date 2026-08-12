import type { ContactListItem } from "@mushroom/shared";
import { Alert, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  AppAvatar,
  EmptyState,
  SwipeableActionRow
} from "../../../components/ui";
import { Divider } from "../../../components/overlays/info-rows";
import { useAppTheme } from "../../../styles/app-styles";
import { colorFromSeed } from "../../../styles/theme";
import type { AppStackParamList } from "../../../types/navigation";
import { AccountPageShell } from "../AccountPageShell";
import { useAccountSecurityProps } from "../AccountSecurityContext";

function BlockedRowContent(props: { contact: ContactListItem }) {
  const { styles, theme } = useAppTheme();
  const displayName =
    props.contact.remark_name ||
    props.contact.nickname ||
    props.contact.username ||
    "";
  const avatarColor = colorFromSeed(displayName || "user", theme.avatarPalette);

  return (
    <View style={[styles.chatInfoCompactRow, styles.chatInfoCompactRowSurface]}>
      <AppAvatar
        label={displayName || "?"}
        imageUrl={props.contact.avatar_url}
        style={[styles.chatInfoCompactAvatar, { backgroundColor: avatarColor }]}
        textStyle={styles.chatInfoCompactAvatarText}
      />
      <Text numberOfLines={1} style={styles.chatInfoCompactName}>
        {displayName}
      </Text>
    </View>
  );
}

export function AccountSecurityBlockedScreen() {
  const { t } = useTranslation();
  const { styles } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const props = useAccountSecurityProps();
  const blocked = props.blockedContacts;

  const confirmUnblock = (contact: ContactListItem) => {
    const displayName =
      contact.remark_name || contact.nickname || contact.username || "";
    const label =
      displayName || t("display.unknownUser", { id: contact.user_id });
    Alert.alert(
      t("accountActions.unblockTitle"),
      t("accountActions.unblockConfirm", { name: label }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("accountActions.unblock"),
          style: "default",
          onPress: () => props.onUnblockContact(contact)
        }
      ]
    );
  };

  return (
    <AccountPageShell
      title={t("contacts.blockedTitle")}
      onBack={() => navigation.goBack()}
      testID="account-security-blocked"
    >
      <ScrollView
        style={styles.meScreenEditorScroll}
        contentContainerStyle={[
          styles.accountSecurityContent,
          blocked.length > 0 ? styles.accountSecurityBlockedContent : null
        ]}
        showsVerticalScrollIndicator={false}
      >
        {blocked.length === 0 ? (
          <EmptyState label={t("contacts.noBlocked")} />
        ) : (
          <View style={styles.chatInfoSection}>
            {blocked.map((contact, index) => (
              <View key={`blocked:${contact.user_id}`}>
                <SwipeableActionRow
                  actionLabel={t("contacts.unblock")}
                  actionTestID={`blocked-unblock-${contact.user_id}`}
                  onAction={() => confirmUnblock(contact)}
                >
                  <BlockedRowContent contact={contact} />
                </SwipeableActionRow>
                {index < blocked.length - 1 ? (
                  <Divider styles={styles} />
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </AccountPageShell>
  );
}
