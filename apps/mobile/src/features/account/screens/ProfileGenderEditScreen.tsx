import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Icon from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../../styles/app-styles";
import { AccountPageShell } from "../AccountPageShell";
import { SaveHeaderButton } from "../../../components/ui/SaveHeaderButton";
import { useMeProps } from "../MeContext";
import { GENDER_OPTIONS } from "../profile-fields";
import type { AppStackParamList } from "../../../types/navigation";

/**
 * Dedicated gender picker screen. The user taps an option and confirms with
 * the header save button — the same "full-screen editor + header save"
 * pattern used for the other profile fields.
 */
export function ProfileGenderEditScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const me = useMeProps();

  const initialGender = Number(me.profileForm.gender) || 0;
  const [selected, setSelected] = useState(initialGender);
  const [pending, setPending] = useState(false);

  const canSave = !pending && selected !== initialGender;

  async function handleSave() {
    if (!canSave) return;
    setPending(true);
    try {
      const ok = await me.onSaveProfile({ gender: selected });
      if (ok) navigation.goBack();
    } finally {
      setPending(false);
    }
  }

  return (
    <AccountPageShell
      title={t("me.gender")}
      onBack={() => navigation.goBack()}
      testID="profile-gender-edit"
      rightAction={
        <SaveHeaderButton
          onPress={handleSave}
          pending={pending}
          disabled={!canSave}
          testID="profile-gender-save"
        />
      }
    >
      <View style={{ paddingTop: 16, paddingHorizontal: 16 }}>
        {GENDER_OPTIONS.map((option, index) => {
          const isSelected = selected === option.value;
          return (
            <View key={option.value}>
              {index > 0 ? <View style={styles.meScreenFullSeparator} /> : null}
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => setSelected(option.value)}
                style={[
                  styles.bottomSheetOptionRow,
                  { justifyContent: "space-between" }
                ]}
                testID={`profile-gender-option-${option.value}`}
              >
                <Text
                  style={[
                    styles.bottomSheetOptionLabel,
                    isSelected && { color: theme.colors.accentStrong }
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
                {isSelected ? (
                  <Icon
                    name="checkmark"
                    size={22}
                    color={theme.colors.accentStrong}
                  />
                ) : null}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </AccountPageShell>
  );
}
