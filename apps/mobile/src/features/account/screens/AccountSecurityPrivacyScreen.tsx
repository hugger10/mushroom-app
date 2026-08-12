import type { PrivacyRule, UserPrivacySettings } from "@mushroom/shared";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "react-native-vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAppTheme } from "../../../styles/app-styles";
import type { AppStackParamList } from "../../../types/navigation";
import { AccountPageShell } from "../AccountPageShell";
import { useAccountSecurityProps } from "../AccountSecurityContext";
import { getPrivacyRuleLabel } from "../account-security-format";
import { BottomSheet, BottomSheetOptionList } from "../../../components/ui";

type PrivacySettingKey = keyof UserPrivacySettings;

const PRIVACY_ROW_KEYS: PrivacySettingKey[] = [
  "discoverable_by_username",
  "discoverable_by_phone",
  "presence_visibility",
  "message_permission",
  "read_receipts_visibility"
];

// 已读回执是双向开关：只允许 "所有人(0) / 关闭(2)"。"仅联系人" 在产品上
// 没有合理的对称语义（A 是 B 的联系人不蕴含 B 是 A 的联系人），所以隐藏。
const BINARY_PRIVACY_KEYS = new Set<PrivacySettingKey>([
  "read_receipts_visibility"
]);

export function AccountSecurityPrivacyScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const props = useAccountSecurityProps();
  const [activeRow, setActiveRow] = useState<PrivacySettingKey | null>(null);

  const privacyRuleOptions: Array<{ value: PrivacyRule; label: string }> = [
    { value: 0, label: t("me.security.privacyPage.rules.everyone") },
    { value: 1, label: t("me.security.privacyPage.rules.contactsOnly") },
    { value: 2, label: t("me.security.privacyPage.rules.off") }
  ];

  function handleSelect(value: PrivacyRule) {
    if (activeRow) {
      props.onUpdatePrivacySetting(activeRow, value);
    }
    setActiveRow(null);
  }

  return (
    <AccountPageShell
      title={t("me.security.privacyPage.title")}
      onBack={() => navigation.goBack()}
      testID="account-security-privacy"
    >
      <ScrollView
        style={styles.meScreenEditorScroll}
        contentContainerStyle={styles.accountSecurityContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.accountSecurityListSection}>
          {PRIVACY_ROW_KEYS.map((key, index) => {
            const value = props.privacySettings?.[key];
            return (
              <View key={key}>
                {index > 0 ? (
                  <View style={styles.accountSecurityListSeparator} />
                ) : null}
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => setActiveRow(key)}
                  disabled={props.pending}
                  style={styles.accountSecurityListRow}
                  testID={`me-privacy-row-${key}`}
                >
                  <View style={styles.accountSecurityPrivacyMain}>
                    <Text style={styles.accountSecurityListTitle}>
                      {t(`me.security.privacyPage.rows.${key}.title`)}
                    </Text>
                    <Text style={styles.accountSecurityPrivacySub}>
                      {t(`me.security.privacyPage.rows.${key}.detail`)}
                    </Text>
                  </View>
                  <Text style={styles.accountSecurityListValue}>
                    {getPrivacyRuleLabel(t, value)}
                  </Text>
                  <Icon
                    name="chevron-forward"
                    size={18}
                    color={theme.colors.textSoft}
                  />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <BottomSheet
        visible={activeRow !== null}
        title={
          activeRow
            ? t(`me.security.privacyPage.rows.${activeRow}.title`)
            : undefined
        }
        onClose={() => setActiveRow(null)}
        testID="me-privacy-sheet"
      >
        <BottomSheetOptionList
          options={
            activeRow && BINARY_PRIVACY_KEYS.has(activeRow)
              ? privacyRuleOptions.filter(opt => opt.value !== 1)
              : privacyRuleOptions
          }
          selectedValue={
            activeRow ? props.privacySettings?.[activeRow] : undefined
          }
          onSelect={handleSelect}
          testIDPrefix={
            activeRow ? `me-privacy-${activeRow}-option` : undefined
          }
        />
      </BottomSheet>
    </AccountPageShell>
  );
}
