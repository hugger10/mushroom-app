import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "react-native-vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAppTheme } from "../../../styles/app-styles";
import type { AppStackParamList } from "../../../types/navigation";
import { AccountPageShell } from "../AccountPageShell";
import { useAccountSecurityProps } from "../AccountSecurityContext";
import {
  formatAccountSecurityTime,
  getDeviceStatusLabel,
  getDeviceTypeLabel
} from "../account-security-format";
import { confirmLogoutAllDevices } from "./account-security-actions";

export function AccountSecurityDevicesScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const props = useAccountSecurityProps();

  const currentDeviceCount = props.devices.filter(
    device => device.status === 1
  ).length;
  const onlineDeviceCount = props.devices.filter(
    device => device.is_online
  ).length;

  const initialDevices = props.devices.slice(0, 10);

  return (
    <AccountPageShell
      title={t("me.security.devicesPage.title")}
      onBack={() => navigation.goBack()}
      testID="account-security-devices"
    >
      <ScrollView
        style={styles.meScreenEditorScroll}
        contentContainerStyle={styles.accountSecurityContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.accountSecuritySummaryBar}>
          <Text style={styles.accountSecuritySummaryText}>
            {t("me.security.devicesPage.summary", {
              active: currentDeviceCount,
              online: onlineDeviceCount
            })}
          </Text>
        </View>
        {props.devices.length === 0 ? (
          <Text style={styles.accountSecurityEmptyText}>
            {t("me.security.devicesPage.empty")}
          </Text>
        ) : (
          <>
            {initialDevices.map(device => {
              const canRestore = device.status !== 1;
              return (
                <View
                  key={device.device_id}
                  style={styles.accountSecurityDeviceCard}
                >
                  <View style={styles.accountSecurityDeviceHeader}>
                    <View style={styles.accountSecurityDeviceIcon}>
                      <Icon
                        name={
                          device.device_type === 3
                            ? "phone-portrait-outline"
                            : device.device_type === 2
                              ? "desktop-outline"
                              : "hardware-chip-outline"
                        }
                        size={20}
                        color={theme.colors.text}
                      />
                    </View>
                    <View style={styles.accountSecurityDeviceMain}>
                      <Text
                        numberOfLines={1}
                        style={styles.accountSecurityDeviceTitle}
                      >
                        {device.device_name ||
                          getDeviceTypeLabel(t, device.device_type)}
                      </Text>
                      <Text style={styles.accountSecurityDeviceSub}>
                        {`${getDeviceTypeLabel(t, device.device_type)} · ${getDeviceStatusLabel(t, device.status)}`}
                      </Text>
                    </View>
                    {device.is_current_device ? (
                      <View style={styles.accountSecurityTag}>
                        <Text style={styles.accountSecurityTagText}>
                          {t("me.security.devicesPage.currentDevice")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.accountSecurityMetaText}>
                    {t("me.security.devicesPage.lastSeen", {
                      time: formatAccountSecurityTime(device.last_seen_at)
                    })}
                  </Text>
                  <Text style={styles.accountSecurityMetaText}>
                    {t("me.security.devicesPage.ipAndSession", {
                      ip: device.last_ip || "-",
                      count: device.active_session_count
                    })}
                  </Text>
                  <View style={styles.accountSecurityDeviceActions}>
                    {canRestore ? (
                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => props.onRestoreDevice(device)}
                        disabled={props.pending}
                        style={styles.accountSecurityActionButton}
                        testID={`me-device-restore-${device.device_id}`}
                      >
                        <Text style={styles.accountSecurityActionText}>
                          {t("me.security.devicesPage.restore")}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity
                          activeOpacity={0.82}
                          onPress={() => props.onLogoutManagedDevice(device)}
                          disabled={props.pending}
                          style={styles.accountSecurityActionButton}
                          testID={`me-device-logout-${device.device_id}`}
                        >
                          <Text style={styles.accountSecurityActionText}>
                            {t("me.security.devicesPage.logout")}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={0.82}
                          onPress={() => props.onDisableDevice(device)}
                          disabled={props.pending}
                          style={styles.accountSecurityActionButtonDanger}
                          testID={`me-device-disable-${device.device_id}`}
                        >
                          <Text style={styles.accountSecurityDangerText}>
                            {t("me.security.devicesPage.disable")}
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() => confirmLogoutAllDevices(t, props.onLogoutAllDevices)}
          disabled={props.pending}
          style={styles.accountSecurityFullDangerButton}
          testID="me-account-security-logout-all"
        >
          <Text style={styles.accountSecurityDangerButtonText}>
            {t("me.security.logoutAll")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </AccountPageShell>
  );
}
