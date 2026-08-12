import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PressableRow } from "../../../hooks/usePressAnimation";
import Icon from "react-native-vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAppTheme } from "../../../styles/app-styles";
import type { AppStackParamList } from "../../../types/navigation";
import { AccountPageShell } from "../AccountPageShell";
import { useAccountSecurityProps } from "../AccountSecurityContext";
import { getSecurityActionLabel } from "../account-security-format";
import { confirmLogoutOtherDevices } from "./account-security-actions";

export function AccountSecurityOverviewScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const props = useAccountSecurityProps();

  const currentDeviceCount = props.devices.filter(
    device => device.status === 1
  ).length;
  const suspiciousDeviceCount = props.devices.filter(
    device => !device.is_current_device && device.status === 1
  ).length;
  const recentSecurityEvent = props.securityEvents[0];
  const securityStatusTitle =
    suspiciousDeviceCount > 0
      ? t("me.security.statusWarning", { count: suspiciousDeviceCount })
      : t("me.security.statusSafe");
  const securityStatusMeta = recentSecurityEvent
    ? t("me.security.recentEvent", {
        label: getSecurityActionLabel(t, recentSecurityEvent.action)
      })
    : t("me.security.noRecentEvent");

  return (
    <AccountPageShell
      title={t("me.security.title")}
      onBack={() => navigation.goBack()}
      testID="account-security-overview"
    >
      <ScrollView
        style={styles.meScreenEditorScroll}
        contentContainerStyle={styles.accountSecurityContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.accountSecurityHero}>
          <View
            style={[
              styles.accountSecurityHeroIcon,
              suspiciousDeviceCount > 0
                ? styles.accountSecurityHeroIconDanger
                : styles.accountSecurityHeroIconSafe
            ]}
          >
            <Icon
              name={
                suspiciousDeviceCount > 0
                  ? "alert-circle-outline"
                  : "shield-checkmark-outline"
              }
              size={25}
              color={
                suspiciousDeviceCount > 0
                  ? theme.colors.danger
                  : theme.colors.success
              }
            />
          </View>
          <View style={styles.accountSecurityHeroMain}>
            <Text style={styles.accountSecurityHeroTitle}>
              {securityStatusTitle}
            </Text>
            <Text style={styles.accountSecurityHeroSub}>
              {securityStatusMeta}
            </Text>
          </View>
        </View>

        <View style={styles.accountSecurityListSection}>
          <PressableRow
            onPress={() => navigation.navigate("AccountSecurityDevices")}
            style={styles.accountSecurityListRow}
            testID="me-account-security-devices-trigger"
          >
            <View style={styles.accountSecurityListIcon}>
              <Icon
                name="phone-portrait-outline"
                size={20}
                color={theme.colors.accent}
              />
            </View>
            <Text style={styles.accountSecurityListTitle}>
              {t("me.security.devices")}
            </Text>
            <Text style={styles.accountSecurityListValue}>
              {props.devicesLoading
                ? t("me.security.devicesLoading")
                : t("me.security.devicesValue", { count: currentDeviceCount })}
            </Text>
            <Icon
              name="chevron-forward"
              size={18}
              color={theme.colors.textSoft}
            />
          </PressableRow>
          <View style={styles.accountSecurityListSeparator} />
          <PressableRow
            onPress={() => navigation.navigate("AccountSecurityEvents")}
            style={styles.accountSecurityListRow}
            testID="me-account-security-events-trigger"
          >
            <View style={styles.accountSecurityListIcon}>
              <Icon
                name="pulse-outline"
                size={20}
                color={theme.colors.success}
              />
            </View>
            <Text style={styles.accountSecurityListTitle}>
              {t("me.security.events")}
            </Text>
            <Text style={styles.accountSecurityListValue}>
              {t("me.security.eventsValue", {
                count: props.securityEvents.length
              })}
            </Text>
            <Icon
              name="chevron-forward"
              size={18}
              color={theme.colors.textSoft}
            />
          </PressableRow>
        </View>

        <Text style={styles.accountSecuritySectionLabel}>
          {t("me.security.sectionPassword")}
        </Text>
        <View style={styles.accountSecurityListSection}>
          <PressableRow
            onPress={() => navigation.navigate("AccountSecurityPassword")}
            style={styles.accountSecurityListRow}
            testID="me-account-security-password-trigger"
          >
            <View style={styles.accountSecurityListIcon}>
              <Icon name="key-outline" size={20} color={theme.colors.accent} />
            </View>
            <Text style={styles.accountSecurityListTitle}>
              {t("me.security.changePassword")}
            </Text>
            <Icon
              name="chevron-forward"
              size={18}
              color={theme.colors.textSoft}
            />
          </PressableRow>
        </View>

        <Text style={styles.accountSecuritySectionLabel}>
          {t("me.security.sectionPrivacy")}
        </Text>
        <View style={styles.accountSecurityListSection}>
          <PressableRow
            onPress={() => navigation.navigate("AccountSecurityPrivacy")}
            style={styles.accountSecurityListRow}
            testID="me-account-security-privacy-trigger"
          >
            <View style={styles.accountSecurityListIcon}>
              <Icon
                name="lock-closed-outline"
                size={20}
                color={theme.colors.accent}
              />
            </View>
            <Text style={styles.accountSecurityListTitle}>
              {t("me.security.privacy")}
            </Text>
            {props.privacyLoading ? (
              <Text style={styles.accountSecurityListValue}>
                {t("me.security.devicesLoading")}
              </Text>
            ) : null}
            <Icon
              name="chevron-forward"
              size={18}
              color={theme.colors.textSoft}
            />
          </PressableRow>
          <View style={styles.accountSecurityListSeparator} />
          <PressableRow
            onPress={() => navigation.navigate("AccountSecurityBlocked")}
            style={styles.accountSecurityListRow}
            testID="me-account-security-blocked-trigger"
          >
            <View style={styles.accountSecurityListIconDanger}>
              <Icon name="ban-outline" size={20} color={theme.colors.danger} />
            </View>
            <Text style={styles.accountSecurityListTitle}>
              {t("contacts.blockedTitle")}
            </Text>
            <Text style={styles.accountSecurityListValue}>
              {props.blockedContacts.length}
            </Text>
            <Icon
              name="chevron-forward"
              size={18}
              color={theme.colors.textSoft}
            />
          </PressableRow>
        </View>

        <Text style={styles.accountSecuritySectionLabel}>
          {t("me.security.sectionDanger")}
        </Text>
        <View style={styles.accountSecurityListSection}>
          <PressableRow
            onPress={() =>
              confirmLogoutOtherDevices(t, props.onLogoutOtherDevices)
            }
            disabled={props.pending}
            style={styles.accountSecurityListRow}
            testID="me-account-security-logout-others"
          >
            <View style={styles.accountSecurityListIconDanger}>
              <Icon
                name="log-out-outline"
                size={20}
                color={theme.colors.danger}
              />
            </View>
            <Text style={styles.accountSecurityDangerRowTitle}>
              {t("me.security.logoutOthers")}
            </Text>
            <Icon
              name="chevron-forward"
              size={18}
              color={theme.colors.textSoft}
            />
          </PressableRow>
        </View>
      </ScrollView>
    </AccountPageShell>
  );
}
