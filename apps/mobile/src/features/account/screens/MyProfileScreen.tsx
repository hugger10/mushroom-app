import { useEffect, useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Icon from "react-native-vector-icons/Ionicons";
import { PressableRow } from "../../../hooks/usePressAnimation";
import { useAppTheme } from "../../../styles/app-styles";
import { AccountPageShell } from "../AccountPageShell";
import { useMeProps, type MeProfileForm } from "../MeContext";
import type { AppStackParamList } from "../../../types/navigation";
import type { ProfileField } from "../profile-fields";

interface FieldMeta {
  key: ProfileField;
  icon: string;
  labelKey: string;
  iconTint: string;
  iconBg: string;
}

const PROFILE_FIELDS: FieldMeta[] = [
  {
    key: "nickname",
    icon: "person-outline",
    labelKey: "profile.basic.nickname",
    iconTint: "#4F8CFF",
    iconBg: "rgba(79, 140, 255, 0.2)"
  },
  {
    key: "email",
    icon: "mail-outline",
    labelKey: "me.email",
    iconTint: "#A874FF",
    iconBg: "rgba(168, 116, 255, 0.2)"
  },
  {
    key: "phone",
    icon: "call-outline",
    labelKey: "me.phone",
    iconTint: "#59C18A",
    iconBg: "rgba(89, 193, 138, 0.2)"
  },
  {
    key: "signature",
    icon: "text-outline",
    labelKey: "profile.basic.signature",
    iconTint: "#FFA940",
    iconBg: "rgba(255, 169, 64, 0.2)"
  },
  {
    key: "birthday",
    icon: "calendar-outline",
    labelKey: "me.birthday",
    iconTint: "#FF7A59",
    iconBg: "rgba(255, 122, 89, 0.2)"
  },
  {
    key: "gender",
    icon: "male-female-outline",
    labelKey: "me.gender",
    iconTint: "#3FB6FF",
    iconBg: "rgba(63, 182, 255, 0.2)"
  }
];

function getFieldDisplayValue(
  field: ProfileField,
  form: MeProfileForm,
  t: ReturnType<typeof useTranslation>["t"]
): string {
  switch (field) {
    case "nickname":
      return form.nickname || t("me.birthdayUnset");
    case "email":
      return form.email || t("me.birthdayUnset");
    case "phone":
      return form.phone || t("me.birthdayUnset");
    case "signature":
      return form.signature || t("me.birthdayUnset");
    case "birthday":
      return form.birthday || t("me.birthdayUnset");
    case "gender": {
      const genderVal = Number(form.gender);
      if (genderVal === 1) return t("contacts.profileGenderMale");
      if (genderVal === 2) return t("contacts.profileGenderFemale");
      return t("me.profile.genderSecret");
    }
    default:
      return "";
  }
}

function openFieldEditor(
  field: ProfileField,
  navigation: NativeStackNavigationProp<AppStackParamList>
) {
  if (field === "gender") {
    navigation.navigate("MyProfileGenderEdit");
    return;
  }
  if (field === "birthday") {
    navigation.navigate("MyProfileBirthdayEdit");
    return;
  }
  navigation.navigate("MyProfileFieldEdit", { field });
}

export function MyProfileScreen() {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const me = useMeProps();
  const seededRef = useRef(false);

  // Seed the form from the latest snapshot every time the screen mounts.
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const snapshot = me.snapshot.auth;
    const avatarUrl =
      snapshot.profile?.avatar_url || snapshot.user?.avatar || "";
    me.onChangeProfileForm({
      nickname:
        snapshot.profile?.nickname || snapshot.user?.nickname || "Mushroom",
      avatar_url: avatarUrl,
      email: snapshot.profile?.email || "",
      phone: snapshot.profile?.phone || "",
      gender: snapshot.profile?.gender ?? 0,
      birthday: snapshot.profile?.birthday || "",
      signature: snapshot.profile?.signature || ""
    });
  }, []);
  // Reset seededRef on unmount so re-mount always re-seeds from fresh snapshot
  useEffect(() => {
    return () => {
      seededRef.current = false;
    };
  }, []);

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <AccountPageShell
      title={t("me.myProfile")}
      onBack={handleBack}
      testID="me-my-profile-page"
    >
      <ScrollView
        style={styles.groupInfoScroll}
        contentContainerStyle={styles.meScreenScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.meScreenSection}>
          {PROFILE_FIELDS.map((meta, index) => {
            const currentValue = getFieldDisplayValue(
              meta.key,
              me.profileForm,
              t
            );
            return (
              <View key={meta.key}>
                {index > 0 ? <View style={styles.meScreenSeparator} /> : null}
                <PressableRow
                  style={styles.meScreenMenuItem}
                  onPress={() => openFieldEditor(meta.key, navigation)}
                  testID={`my-profile-row-${meta.key}`}
                >
                  <View style={styles.meScreenMenuLeft}>
                    <View
                      style={[
                        styles.meScreenMenuIconWrapper,
                        styles.meScreenMenuIconChip,
                        { backgroundColor: meta.iconBg }
                      ]}
                    >
                      <Icon name={meta.icon} size={19} color={meta.iconTint} />
                    </View>
                    <Text style={styles.meScreenMenuTitle}>
                      {t(meta.labelKey)}
                    </Text>
                  </View>
                  <View style={styles.meScreenMenuValueWrap}>
                    <Text style={styles.meScreenMenuValue} numberOfLines={1}>
                      {currentValue}
                    </Text>
                    <Icon
                      name="chevron-forward"
                      size={18}
                      color={theme.colors.textSoft}
                    />
                  </View>
                </PressableRow>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </AccountPageShell>
  );
}
