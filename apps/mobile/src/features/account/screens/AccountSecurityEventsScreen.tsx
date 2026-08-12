import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAppTheme } from "../../../styles/app-styles";
import type { AppStackParamList } from "../../../types/navigation";
import { AccountPageShell } from "../AccountPageShell";
import { useAccountSecurityProps } from "../AccountSecurityContext";
import {
  formatAccountSecurityTime,
  getSecurityActionLabel
} from "../account-security-format";

export function AccountSecurityEventsScreen() {
  const { t } = useTranslation();
  const { styles } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const props = useAccountSecurityProps();

  return (
    <AccountPageShell
      title={t("me.security.eventsPage.title")}
      onBack={() => navigation.goBack()}
      testID="account-security-events"
    >
      <ScrollView
        style={styles.meScreenEditorScroll}
        contentContainerStyle={styles.accountSecurityContent}
        showsVerticalScrollIndicator={false}
      >
        {props.securityEvents.length === 0 ? (
          <Text style={styles.accountSecurityEmptyText}>
            {t("me.security.eventsPage.empty")}
          </Text>
        ) : (
          props.securityEvents.map(event => (
            <View
              key={event.id}
              style={styles.accountSecurityEventRow}
              testID={`me-security-event-${event.id}`}
            >
              <View style={styles.accountSecurityEventDot} />
              <View style={styles.accountSecurityEventMain}>
                <Text style={styles.accountSecurityEventTitle}>
                  {getSecurityActionLabel(t, event.action)}
                </Text>
                <Text style={styles.accountSecurityMetaText}>
                  {`${formatAccountSecurityTime(event.created_at)} · ${event.ip || "-"} · ${event.device_id || "-"}`}
                </Text>
              </View>
              <Text
                style={[
                  styles.accountSecurityEventStatus,
                  event.action_status === 0
                    ? styles.accountSecurityEventStatusSuccess
                    : styles.accountSecurityEventStatusFailed
                ]}
              >
                {event.action_status === 0
                  ? t("me.security.eventsPage.success")
                  : t("me.security.eventsPage.failed")}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </AccountPageShell>
  );
}
