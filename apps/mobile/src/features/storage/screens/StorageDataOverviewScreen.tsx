import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PressableRow } from "../../../hooks/usePressAnimation";
import Icon from "react-native-vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomSheet, BottomSheetOptionList } from "../../../components/ui";
import { useAppTheme } from "../../../styles/app-styles";
import type { AppStackParamList } from "../../../types/navigation";
import { AccountPageShell } from "../../account/AccountPageShell";
import { useMediaAutoDownloadPreferences } from "../storage-preferences";
import {
  MEDIA_AUTO_DOWNLOAD_POLICIES,
  MEDIA_CATEGORIES,
  type MediaAutoDownloadPolicy,
  type MediaCategory
} from "../types";
import { formatStorageSize, useStorageUsage } from "../useStorageUsage";

const CATEGORY_ICONS: Record<MediaCategory, string> = {
  photos: "image-outline",
  audio: "musical-notes-outline",
  videos: "videocam-outline",
  documents: "document-text-outline"
};

const CATEGORY_TINTS: Record<MediaCategory, string> = {
  photos: "#3FB6FF",
  audio: "#FF7A59",
  videos: "#A874FF",
  documents: "#59C18A"
};

export function StorageDataOverviewScreen() {
  const { t, i18n } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { usage, loading } = useStorageUsage();
  const { preferences, update } = useMediaAutoDownloadPreferences();
  const [activeCategory, setActiveCategory] = useState<MediaCategory | null>(
    null
  );

  const totalLabel = loading
    ? t("me.storage.usagePage.loading")
    : formatStorageSize(usage.totalBytes, i18n.language);

  const policyOptions = useMemo(
    () =>
      MEDIA_AUTO_DOWNLOAD_POLICIES.map(policy => ({
        value: policy,
        label: t(`me.storage.mediaPage.policy.${policy}`)
      })),
    [t]
  );

  function policyLabel(policy: MediaAutoDownloadPolicy) {
    return t(`me.storage.mediaPage.policy.${policy}`);
  }

  function categoryLabel(category: MediaCategory) {
    return t(`me.storage.mediaPage.${category}`);
  }

  function handleSelect(policy: MediaAutoDownloadPolicy) {
    if (activeCategory) {
      update(activeCategory, policy);
    }
    setActiveCategory(null);
  }

  return (
    <AccountPageShell
      title={t("me.storage.title")}
      onBack={() => navigation.goBack()}
      testID="storage-data-overview"
    >
      <ScrollView
        style={styles.meScreenEditorScroll}
        contentContainerStyle={styles.accountSecurityContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.accountSecuritySectionLabel}>
          {t("me.storage.sectionStorage")}
        </Text>
        <View style={styles.accountSecurityListSection}>
          <PressableRow
            onPress={() => navigation.navigate("StorageUsage")}
            style={styles.accountSecurityListRow}
            testID="storage-usage-trigger"
          >
            <View style={styles.accountSecurityListIcon}>
              <Icon
                name="pie-chart-outline"
                size={20}
                color={theme.colors.accent}
              />
            </View>
            <Text style={styles.accountSecurityListTitle}>
              {t("me.storage.storageUsage")}
            </Text>
            <Text style={styles.accountSecurityListValue}>{totalLabel}</Text>
            <Icon
              name="chevron-forward"
              size={18}
              color={theme.colors.textSoft}
            />
          </PressableRow>
        </View>

        <Text style={styles.accountSecuritySectionLabel}>
          {t("me.storage.sectionMedia")}
        </Text>
        <View style={styles.accountSecurityListSection}>
          {MEDIA_CATEGORIES.map((category, index) => (
            <View key={category}>
              {index > 0 ? (
                <View style={styles.accountSecurityListSeparator} />
              ) : null}
              <PressableRow
                onPress={() => setActiveCategory(category)}
                style={styles.accountSecurityListRow}
                testID={`media-auto-download-${category}`}
              >
                <View
                  style={[
                    styles.accountSecurityListIcon,
                    {
                      backgroundColor:
                        theme.mode === "dark"
                          ? "rgba(255,255,255,0.06)"
                          : theme.colors.surfaceMuted
                    }
                  ]}
                >
                  <Icon
                    name={CATEGORY_ICONS[category]}
                    size={20}
                    color={CATEGORY_TINTS[category]}
                  />
                </View>
                <Text style={styles.accountSecurityListTitle}>
                  {categoryLabel(category)}
                </Text>
                <Text style={styles.accountSecurityListValue}>
                  {policyLabel(preferences[category])}
                </Text>
                <Icon
                  name="chevron-forward"
                  size={18}
                  color={theme.colors.textSoft}
                />
              </PressableRow>
            </View>
          ))}
        </View>
      </ScrollView>

      <BottomSheet
        visible={activeCategory !== null}
        title={
          activeCategory
            ? t("me.storage.mediaPage.sheetTitle", {
                category: categoryLabel(activeCategory)
              })
            : undefined
        }
        onClose={() => setActiveCategory(null)}
        testID="media-auto-download-sheet"
      >
        <BottomSheetOptionList
          options={policyOptions}
          selectedValue={
            activeCategory ? preferences[activeCategory] : undefined
          }
          onSelect={handleSelect}
          testIDPrefix="media-auto-download-option"
        />
      </BottomSheet>
    </AccountPageShell>
  );
}
