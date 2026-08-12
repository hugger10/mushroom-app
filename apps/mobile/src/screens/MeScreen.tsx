import {
  MUSHROOM_APP_VERSION,
  type MobileAppSnapshot
} from "@mushroom/app-core";
import {
  MUSHROOM_LANGUAGE_LABELS,
  MUSHROOM_SUPPORTED_LANGUAGES,
  MUSHROOM_THEME_PREFERENCES,
  type MushroomSupportedLanguage,
  type MushroomThemePreference
} from "@mushroom/shared";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Icon from "react-native-vector-icons/Ionicons";
import { PressableRow } from "../hooks/usePressAnimation";
import {
  AppAvatar,
  BottomSheet,
  BottomSheetOptionList,
  LogoutConfirmSheet
} from "../components/ui";
import { useMeProps } from "../features/account/MeContext";
import { setAppLanguage, useAppLanguage } from "../i18n";
import { useAppTheme } from "../styles/app-styles";
import { colorFromSeed } from "../styles/theme";
import type { AppStackParamList } from "../types/navigation";

export function MeScreen(props: {
  snapshot: MobileAppSnapshot;
  onRefreshMeData: () => void;
  onLogout: (options?: { wipeLocalData?: boolean }) => void;
}) {
  const { t } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [selectionDrawer, setSelectionDrawer] = useState<
    "theme" | "language" | null
  >(null);
  const [logoutSheetVisible, setLogoutSheetVisible] = useState(false);
  const { language, languageLabel } = useAppLanguage();
  const { styles, theme, themePreference, resolvedTheme, setThemePreference } =
    useAppTheme();
  const me = useMeProps();
  const nickname =
    props.snapshot.auth.profile?.nickname ||
    props.snapshot.auth.user?.nickname ||
    "Mushroom";
  const avatarUrl =
    props.snapshot.auth.profile?.avatar_url ||
    props.snapshot.auth.user?.avatar ||
    "";
  const avatarColor = colorFromSeed(nickname, theme.avatarPalette);
  const themeLabel =
    themePreference === "system"
      ? `${t("common.systemDefault")} · ${
          resolvedTheme === "dark"
            ? t("common.darkMode")
            : t("common.lightMode")
        }`
      : resolvedTheme === "dark"
        ? t("common.darkMode")
        : t("common.lightMode");
  const themeOptions: Array<{
    value: MushroomThemePreference;
    label: string;
  }> = MUSHROOM_THEME_PREFERENCES.map(value => ({
    value,
    label:
      value === "system"
        ? t("common.systemDefault")
        : value === "dark"
          ? t("common.darkMode")
          : t("common.lightMode")
  }));
  const languageOptions: Array<{
    value: MushroomSupportedLanguage;
    label: string;
  }> = MUSHROOM_SUPPORTED_LANGUAGES.map(value => ({
    value,
    label: MUSHROOM_LANGUAGE_LABELS[value]
  }));
  const infoRows = [
    {
      key: "profile",
      icon: "person-circle-outline",
      label: t("me.myProfile"),
      iconTint: "#4F8CFF",
      iconBackground:
        theme.mode === "dark" ? "rgba(79, 140, 255, 0.2)" : "#E8F1FF"
    },
    {
      key: "notifications",
      icon: "notifications-outline",
      label: t("me.notifications"),
      iconTint: "#FF7A59",
      iconBackground:
        theme.mode === "dark" ? "rgba(255, 122, 89, 0.2)" : "#FFF0EB"
    }
  ];
  const serviceRows = [
    {
      key: "security",
      icon: "shield-checkmark-outline",
      label: t("me.accountSecurity"),
      iconTint: "#59C18A",
      iconBackground:
        theme.mode === "dark" ? "rgba(89, 193, 138, 0.2)" : "#EBFFF4"
    },
    {
      key: "storageData",
      icon: "server-outline",
      label: t("me.storageData"),
      iconTint: "#3FB6FF",
      iconBackground:
        theme.mode === "dark" ? "rgba(63, 182, 255, 0.2)" : "#E8F6FF"
    },
    {
      key: "exportLogs",
      icon: "document-text-outline",
      label: t("me.exportLogs"),
      iconTint: "#FFA940",
      iconBackground:
        theme.mode === "dark" ? "rgba(255, 169, 64, 0.2)" : "#FFF4E5"
    },
    {
      key: "help",
      icon: "help-circle-outline",
      label: t("me.helpFeedback"),
      iconTint: "#A874FF",
      iconBackground:
        theme.mode === "dark" ? "rgba(168, 116, 255, 0.2)" : "#F4EEFF"
    }
  ];

  const closeSelectionDrawer = useCallback(() => {
    setSelectionDrawer(null);
  }, []);

  function openSecurityPage() {
    props.onRefreshMeData();
    navigation.navigate("AccountSecurityOverview");
  }

  function openNotificationPage() {
    navigation.navigate("NotificationSettings");
  }

  function openProfileEditor() {
    navigation.navigate("MyProfile");
  }

  function previewAvatar() {
    me.onPreviewAvatar({ avatarUrl, label: nickname });
  }

  function handleThemeChange(value: MushroomThemePreference) {
    closeSelectionDrawer();
    setTimeout(() => {
      setThemePreference(value);
    }, 350);
  }

  function handleLanguageChange(value: MushroomSupportedLanguage) {
    closeSelectionDrawer();
    setTimeout(() => {
      void setAppLanguage(value);
    }, 350);
  }

  function showComingSoon() {
    Alert.alert(t("common.comingSoon"), t("common.comingSoonDescription"));
  }

  function confirmLogout() {
    // Single-step confirmation: see LogoutConfirmSheet. The previous
    // implementation chained two Alert.alert dialogs (sign-out then
    // wipe-local-data); we now show one bottom sheet that exposes the
    // wipe option as an unchecked checkbox so the user only has to
    // confirm once.
    setLogoutSheetVisible(true);
  }

  function handleLogoutConfirm(wipeLocalData: boolean) {
    setLogoutSheetVisible(false);
    props.onLogout({ wipeLocalData });
  }

  return (
    <View style={styles.meScreenContainer}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces
        alwaysBounceVertical
        contentContainerStyle={styles.meScreenScrollContent}
      >
        <View style={styles.meScreenTopHero}>
          <TouchableOpacity
            style={styles.meScreenTopQrButton}
            activeOpacity={0.82}
            onPress={showComingSoon}
            testID="me-qr-trigger"
            hitSlop={8}
          >
            <Icon name="qr-code-outline" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.meScreenTopAvatarWrapper}>
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={avatarUrl ? previewAvatar : undefined}
              disabled={!avatarUrl}
              style={styles.meScreenTopAvatarTouch}
              testID="me-profile-avatar-preview"
            >
              <AppAvatar
                label={nickname}
                imageUrl={avatarUrl}
                style={[
                  styles.meScreenTopAvatar,
                  { backgroundColor: avatarColor }
                ]}
                textStyle={styles.meScreenTopAvatarText}
              />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={me.onPickProfileAvatar}
              style={styles.meScreenTopAvatarCameraBadge}
              testID="me-profile-avatar-edit"
              hitSlop={6}
            >
              <Icon name="camera" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <Text numberOfLines={1} style={styles.meScreenTopNickname}>
            {nickname}
          </Text>
        </View>

        <View style={styles.meScreenSection}>
          {infoRows.map((item, index) => (
            <View key={item.key}>
              {index > 0 ? <View style={styles.meScreenSeparator} /> : null}
              <PressableRow
                style={styles.meScreenMenuItem}
                onPress={
                  item.key === "notifications"
                    ? openNotificationPage
                    : item.key === "profile"
                      ? openProfileEditor
                      : showComingSoon
                }
                testID={
                  item.key === "notifications"
                    ? "me-notifications-trigger"
                    : item.key === "profile"
                      ? "me-profile-menu-trigger"
                      : undefined
                }
              >
                <View style={styles.meScreenMenuLeft}>
                  <View
                    style={[
                      styles.meScreenMenuIconWrapper,
                      styles.meScreenMenuIconChip,
                      { backgroundColor: item.iconBackground }
                    ]}
                  >
                    <Icon name={item.icon} size={19} color={item.iconTint} />
                  </View>
                  <Text style={styles.meScreenMenuTitle}>{item.label}</Text>
                </View>
                <Icon
                  name="chevron-forward"
                  size={18}
                  color={theme.colors.textSoft}
                />
              </PressableRow>
            </View>
          ))}
        </View>

        <Text style={styles.meScreenSectionLabel}>{t("me.preferences")}</Text>
        <View style={styles.meScreenSection}>
          <PressableRow
            style={styles.meScreenMenuItem}
            onPress={() => setSelectionDrawer("theme")}
            testID="me-theme-trigger"
          >
            <View style={styles.meScreenMenuLeft}>
              <View
                style={[
                  styles.meScreenMenuIconWrapper,
                  styles.meScreenMenuIconChip,
                  {
                    backgroundColor:
                      theme.mode === "dark"
                        ? "rgba(107, 93, 254, 0.2)"
                        : "#EFEDFF"
                  }
                ]}
              >
                <Icon
                  name={resolvedTheme === "dark" ? "moon" : "sunny-outline"}
                  size={19}
                  color={theme.colors.accent}
                />
              </View>
              <Text style={styles.meScreenMenuTitle} numberOfLines={1}>
                {t("me.darkMode")}
              </Text>
            </View>
            <View style={styles.meScreenMenuValueWrap}>
              <Text style={styles.meScreenMenuValue} numberOfLines={1}>
                {themeLabel}
              </Text>
              <Icon
                name="chevron-forward"
                size={18}
                color={theme.colors.textSoft}
              />
            </View>
          </PressableRow>
          <View style={styles.meScreenSeparator} />
          <PressableRow
            style={styles.meScreenMenuItem}
            onPress={() => setSelectionDrawer("language")}
            testID="me-language-trigger"
          >
            <View style={styles.meScreenMenuLeft}>
              <View
                style={[
                  styles.meScreenMenuIconWrapper,
                  styles.meScreenMenuIconChip,
                  {
                    backgroundColor:
                      theme.mode === "dark"
                        ? "rgba(89, 193, 138, 0.2)"
                        : "#EBFFF4"
                  }
                ]}
              >
                <Icon
                  name="language-outline"
                  size={19}
                  color={theme.colors.success}
                />
              </View>
              <Text style={styles.meScreenMenuTitle} numberOfLines={1}>
                {t("me.switchLanguage")}
              </Text>
            </View>
            <View style={styles.meScreenMenuValueWrap}>
              <Text style={styles.meScreenMenuValue} numberOfLines={1}>
                {languageLabel}
              </Text>
              <Icon
                name="chevron-forward"
                size={18}
                color={theme.colors.textSoft}
              />
            </View>
          </PressableRow>
        </View>

        <Text style={styles.meScreenSectionLabel}>{t("me.services")}</Text>
        <View style={styles.meScreenSection}>
          {serviceRows.map((item, index) => (
            <View key={item.key}>
              {index > 0 ? <View style={styles.meScreenSeparator} /> : null}
              <PressableRow
                style={styles.meScreenMenuItem}
                onPress={
                  item.key === "security"
                    ? openSecurityPage
                    : item.key === "storageData"
                      ? () => navigation.navigate("StorageDataOverview")
                      : showComingSoon
                }
                testID={
                  item.key === "security"
                    ? "me-account-security-trigger"
                    : item.key === "storageData"
                      ? "me-storage-data-trigger"
                      : item.key === "exportLogs"
                        ? "me-export-logs-trigger"
                        : item.key === "help"
                          ? "me-help-trigger"
                          : undefined
                }
              >
                <View style={styles.meScreenMenuLeft}>
                  <View
                    style={[
                      styles.meScreenMenuIconWrapper,
                      styles.meScreenMenuIconChip,
                      { backgroundColor: item.iconBackground }
                    ]}
                  >
                    <Icon name={item.icon} size={19} color={item.iconTint} />
                  </View>
                  <Text style={styles.meScreenMenuTitle}>{item.label}</Text>
                </View>
                <Icon
                  name="chevron-forward"
                  size={18}
                  color={theme.colors.textSoft}
                />
              </PressableRow>
            </View>
          ))}
        </View>

        <View style={styles.meScreenSection}>
          <PressableRow
            style={styles.meScreenLogoutButton}
            onPress={confirmLogout}
          >
            <Icon
              name="log-out-outline"
              size={19}
              color={theme.colors.danger}
              style={styles.meScreenLogoutIcon}
            />
            <Text style={styles.meScreenLogoutTitle}>{t("common.logout")}</Text>
          </PressableRow>
        </View>

        <Text style={styles.meScreenVersionText}>
          {t("me.version", { version: MUSHROOM_APP_VERSION })}
        </Text>
      </ScrollView>

      <BottomSheet
        visible={selectionDrawer === "theme"}
        title={t("me.darkMode")}
        onClose={closeSelectionDrawer}
        testID="me-theme-sheet"
      >
        <BottomSheetOptionList
          options={themeOptions.map(option => ({
            value: option.value,
            label: option.label
          }))}
          selectedValue={themePreference}
          onSelect={handleThemeChange}
          testIDPrefix="me-theme-option"
        />
      </BottomSheet>

      <BottomSheet
        visible={selectionDrawer === "language"}
        title={t("me.switchLanguage")}
        onClose={closeSelectionDrawer}
        testID="me-language-sheet"
      >
        <BottomSheetOptionList
          options={languageOptions.map(option => ({
            value: option.value,
            label: option.label
          }))}
          selectedValue={language}
          onSelect={handleLanguageChange}
          testIDPrefix="me-language-option"
        />
      </BottomSheet>

      <LogoutConfirmSheet
        visible={logoutSheetVisible}
        onCancel={() => setLogoutSheetVisible(false)}
        onConfirm={handleLogoutConfirm}
      />
    </View>
  );
}
