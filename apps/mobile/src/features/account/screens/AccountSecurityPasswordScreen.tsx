import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "react-native-vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAppTheme } from "../../../styles/app-styles";
import type { AppStackParamList } from "../../../types/navigation";
import { AccountPageShell } from "../AccountPageShell";
import { useAccountSecurityProps } from "../AccountSecurityContext";
import { SaveHeaderButton } from "../../../components/ui/SaveHeaderButton";
import { PASSWORD_MAX_LENGTH } from "@mushroom/shared";

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type PasswordFieldKey = keyof PasswordForm;

export function AccountSecurityPasswordScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const props = useAccountSecurityProps();
  const [form, setForm] = useState<PasswordForm>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [revealed, setRevealed] = useState<Record<PasswordFieldKey, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false
  });
  const [saving, setSaving] = useState(false);

  function toggleRevealed(key: PasswordFieldKey) {
    setRevealed(state => ({ ...state, [key]: !state[key] }));
  }

  async function submit() {
    if (!form.currentPassword.trim()) {
      Alert.alert(
        t("me.security.passwordPage.errorTitle"),
        t("me.security.passwordPage.errorCurrentRequired")
      );
      return;
    }
    if (form.newPassword.length < 6) {
      Alert.alert(
        t("me.security.passwordPage.errorTitle"),
        t("me.security.passwordPage.errorNewTooShort")
      );
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      Alert.alert(
        t("me.security.passwordPage.errorTitle"),
        t("me.security.passwordPage.errorMismatch")
      );
      return;
    }

    setSaving(true);
    try {
      await props.onChangePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword
      });
      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  const fields: Array<{
    key: PasswordFieldKey;
    icon: string;
    placeholder: string;
    testID: string;
  }> = [
    {
      key: "currentPassword",
      icon: "lock-closed-outline",
      placeholder: t("me.security.passwordPage.currentPlaceholder"),
      testID: "me-password-current-input"
    },
    {
      key: "newPassword",
      icon: "key-outline",
      placeholder: t("me.security.passwordPage.newPlaceholder"),
      testID: "me-password-new-input"
    },
    {
      key: "confirmPassword",
      icon: "checkmark-circle-outline",
      placeholder: t("me.security.passwordPage.confirmPlaceholder"),
      testID: "me-password-confirm-input"
    }
  ];

  return (
    <AccountPageShell
      title={t("me.security.passwordPage.title")}
      onBack={() => navigation.goBack()}
      rightAction={
        <SaveHeaderButton
          onPress={() => {
            void submit();
          }}
          pending={props.pending || saving}
          title={t("me.security.passwordPage.submit")}
          testID="me-password-submit"
        />
      }
      testID="account-security-password"
    >
      <ScrollView
        style={styles.meScreenEditorScroll}
        contentContainerStyle={styles.accountSecurityContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.accountSecuritySummaryBar}>
          <Text style={styles.accountSecuritySummaryText}>
            {t("me.security.passwordPage.notice")}
          </Text>
        </View>
        <View style={styles.meScreenEditorCard}>
          {fields.map((field, index) => {
            const reveal = revealed[field.key];
            return (
              <View key={field.key}>
                {index > 0 ? (
                  <View style={styles.meScreenFullSeparator} />
                ) : null}
                <View style={styles.meScreenEditorRow}>
                  <Icon
                    name={field.icon}
                    size={22}
                    color={theme.colors.text}
                    style={styles.meScreenEditorRowIcon}
                  />
                  <TextInput
                    style={styles.meScreenEditorInput}
                    value={form[field.key]}
                    onChangeText={value =>
                      setForm(current => ({
                        ...current,
                        [field.key]: value
                      }))
                    }
                    placeholder={field.placeholder}
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    secureTextEntry={!reveal}
                    autoCapitalize="none"
                    maxLength={PASSWORD_MAX_LENGTH}
                    testID={field.testID}
                  />
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={
                      reveal
                        ? t("me.security.passwordPage.hidePassword")
                        : t("me.security.passwordPage.showPassword")
                    }
                    onPress={() => toggleRevealed(field.key)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID={`${field.testID}-toggle`}
                  >
                    <Icon
                      name={reveal ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color={theme.colors.textSoft}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </AccountPageShell>
  );
}
