import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import { AccountPageShell } from "../../account/AccountPageShell";
import { AddressBookMatchRow } from "../../contacts/AddressBookMatchRow";
import { useAppTheme } from "../../../styles/app-styles";
import type { AppStackParamList } from "../../../types/navigation";
import { useAddContactProps } from "../AddContactContext";

type Navigation = NativeStackNavigationProp<AppStackParamList>;

export function AddressBookMatchListScreen() {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const navigation = useNavigation<Navigation>();
  const props = useAddContactProps();
  const local = makeStyles(theme);

  const isAuthorized = props.addressBookPermission === "authorized";
  const matches = props.addressBookMatches;

  // Drives both the header refresh button and the empty-state CTA.
  // - denied: user previously rejected the OS prompt → guide to Settings
  //   (re-invoking the request would no-op on iOS).
  // - undetermined / unknown: refresh triggers the action which lazily asks
  //   the OS for permission, surfacing the system dialog.
  // - authorized: just re-sync matches.
  function handlePrimaryAction() {
    if (props.addressBookPermission === "denied") {
      Alert.alert(
        t("addressBookList.title"),
        t("contacts.discoveryPermissionGuide"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.systemSettings"),
            onPress: () => Linking.openSettings()
          }
        ]
      );
      return;
    }
    props.onRefreshAddressBookMatches();
  }

  async function handleInvite() {
    try {
      await Share.share({
        message: t("addContactScreen.inviteMessage", {
          link: t("addContactScreen.inviteLinkPlaceholder")
        })
      });
    } catch {
      // ignore
    }
  }

  return (
    <AccountPageShell
      title={t("addressBookList.title")}
      onBack={() => navigation.goBack()}
      rightAction={
        <Pressable
          onPress={handlePrimaryAction}
          hitSlop={8}
          disabled={props.addressBookSyncing}
          accessibilityRole="button"
          accessibilityLabel={
            props.addressBookSyncing
              ? t("addressBookList.refreshing")
              : t("addressBookList.refresh")
          }
          style={({ pressed }) => [
            local.refreshButton,
            pressed && { opacity: 0.7 }
          ]}
          testID="address-book-list-refresh"
        >
          {props.addressBookSyncing ? (
            <ActivityIndicator size="small" color={theme.colors.accentStrong} />
          ) : (
            <Ionicons
              name="refresh"
              size={20}
              color={theme.colors.accentStrong}
            />
          )}
        </Pressable>
      }
      testID="address-book-match-list-screen"
    >
      <ScrollView contentContainerStyle={local.content}>
        {!isAuthorized ? (
          <View style={local.permissionCard}>
            <View style={local.permissionIconWrap}>
              <Ionicons
                name="people-outline"
                size={28}
                color={theme.colors.success}
              />
            </View>
            <Text style={local.permissionTitle}>
              {t("contacts.discoveryPermissionTitle")}
            </Text>
            <Text style={local.permissionDesc}>
              {t("contacts.discoveryPermissionDesc")}
            </Text>
            <Pressable
              onPress={handlePrimaryAction}
              style={local.permissionButton}
              testID="address-book-list-request-permission"
            >
              <Text style={local.permissionButtonText}>
                {props.addressBookSyncing
                  ? t("addressBookList.refreshing")
                  : t("contacts.discoveryAllow")}
              </Text>
            </Pressable>
          </View>
        ) : props.addressBookSyncing && matches.length === 0 ? (
          <View style={local.statusBlock}>
            <ActivityIndicator color={theme.colors.accentStrong} />
          </View>
        ) : matches.length === 0 ? (
          <View style={local.statusBlock}>
            <Text style={local.emptyText}>{t("addressBookList.empty")}</Text>
            <Pressable
              onPress={() => void handleInvite()}
              style={local.inviteButton}
              testID="address-book-list-invite"
            >
              <Text style={local.inviteText}>
                {t("addressBookList.invite")}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={local.sectionLabel}>
              {t("addressBookList.sectionMatched")}
            </Text>
            <View style={local.listCard}>
              {matches.map(entry => (
                <AddressBookMatchRow
                  key={entry.matched_user_id}
                  entry={entry}
                  onOpenConversation={() =>
                    props.onOpenAddressBookConversation(entry)
                  }
                  onSaveContact={() => props.onSaveAddressBookContact(entry)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </AccountPageShell>
  );
}

function makeStyles(theme: ReturnType<typeof useAppTheme>["theme"]) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 32
    },
    refreshButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center"
    },
    permissionCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center"
    },
    permissionIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.colors.successSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12
    },
    permissionTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 6,
      textAlign: "center"
    },
    permissionDesc: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 16,
      textAlign: "center"
    },
    permissionButton: {
      backgroundColor: theme.colors.accentStrong,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 14
    },
    permissionButtonText: {
      color: theme.colors.textInverse,
      fontSize: 14,
      fontWeight: "700"
    },
    statusBlock: {
      alignItems: "center",
      paddingVertical: 32,
      gap: 12
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontSize: 14
    },
    inviteButton: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 14,
      backgroundColor: theme.colors.accentSoft
    },
    inviteText: {
      color: theme.colors.accentStrong,
      fontSize: 14,
      fontWeight: "700"
    },
    sectionLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      marginBottom: 8
    },
    listCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 4
    }
  });
}
