import { useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import DateTimePicker, {
  type DateTimePickerEvent
} from "@react-native-community/datetimepicker";
import Icon from "react-native-vector-icons/Ionicons";
import { useAppTheme } from "../../../styles/app-styles";
import { AccountPageShell } from "../AccountPageShell";
import { SaveHeaderButton } from "../../../components/ui/SaveHeaderButton";
import { useMeProps } from "../MeContext";
import type { AppStackParamList } from "../../../types/navigation";

function formatDateValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Dedicated birthday editor screen using the native date picker:
 * an inline spinner on iOS, a system dialog on Android. The selected date is
 * committed with the header save button.
 */
export function ProfileBirthdayEditScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const me = useMeProps();

  const initialBirthday = me.profileForm.birthday || "";
  const [localBirthday, setLocalBirthday] = useState(initialBirthday);
  // Only used on Android where DateTimePicker is a dialog
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pending, setPending] = useState(false);

  const canSave = !pending && localBirthday !== initialBirthday;

  const birthdayDate = useMemo(() => {
    if (localBirthday) {
      const parsed = new Date(localBirthday);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const fallback = new Date();
    fallback.setFullYear(fallback.getFullYear() - 20);
    return fallback;
  }, [localBirthday]);

  function handleChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS !== "ios") {
      setPickerVisible(false);
    }
    if (event.type === "dismissed") return;
    if (date) {
      setLocalBirthday(formatDateValue(date));
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setPending(true);
    try {
      const ok = await me.onSaveProfile({ birthday: localBirthday });
      if (ok) navigation.goBack();
    } finally {
      setPending(false);
    }
  }

  const title = t("me.birthday");

  return (
    <AccountPageShell
      title={title}
      onBack={() => navigation.goBack()}
      testID="profile-birthday-edit"
      rightAction={
        <SaveHeaderButton
          onPress={handleSave}
          pending={pending}
          disabled={!canSave}
          testID="profile-birthday-save"
        />
      }
    >
      <ScrollView
        style={styles.groupInfoScroll}
        contentContainerStyle={[
          styles.groupInfoScrollContent,
          { paddingTop: 16 }
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.groupInfoEditCard}>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[
              styles.groupInfoEditInput,
              {
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between"
              }
            ]}
            onPress={() => setPickerVisible(true)}
            testID="profile-field-birthday-trigger"
          >
            <Text
              style={{
                fontSize: 15,
                color: localBirthday ? theme.colors.text : theme.colors.textSoft
              }}
            >
              {localBirthday || t("me.birthdayUnset")}
            </Text>
            <Icon
              name="calendar-outline"
              size={22}
              color={theme.colors.textSoft}
            />
          </TouchableOpacity>

          {pickerVisible || Platform.OS === "ios" ? (
            <View style={{ alignItems: "center" }}>
              <DateTimePicker
                value={birthdayDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={new Date()}
                onChange={handleChange}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </AccountPageShell>
  );
}
