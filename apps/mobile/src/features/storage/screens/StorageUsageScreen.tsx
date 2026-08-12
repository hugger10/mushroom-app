import { useMemo, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "react-native-vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAppTheme } from "../../../styles/app-styles";
import type { AppStackParamList } from "../../../types/navigation";
import { AccountPageShell } from "../../account/AccountPageShell";
import {
  clearMobileCacheDirectory,
  formatStorageSize,
  useStorageUsage
} from "../useStorageUsage";

type LegendKey =
  | "photos"
  | "videos"
  | "audio"
  | "documents"
  | "cache"
  | "other";

type LegendItem = {
  key: LegendKey;
  bytes: number;
  color: string;
};

export function StorageUsageScreen() {
  const { t, i18n } = useTranslation();
  const { styles, theme } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { usage, loading, refresh } = useStorageUsage();
  const [clearing, setClearing] = useState(false);

  const palette: Record<LegendKey, string> = useMemo(
    () => ({
      photos: "#3FB6FF",
      videos: "#A874FF",
      audio: "#FF7A59",
      documents: "#59C18A",
      cache: "#F5B946",
      other: theme.colors.textSoft
    }),
    [theme.colors.textSoft]
  );

  const legend: LegendItem[] = useMemo(
    () => [
      { key: "photos", bytes: usage.photosBytes, color: palette.photos },
      { key: "videos", bytes: usage.videosBytes, color: palette.videos },
      { key: "audio", bytes: usage.audioBytes, color: palette.audio },
      {
        key: "documents",
        bytes: usage.documentsBytes,
        color: palette.documents
      },
      { key: "cache", bytes: usage.cacheBytes, color: palette.cache },
      { key: "other", bytes: usage.otherBytes, color: palette.other }
    ],
    [palette, usage]
  );

  const total = usage.totalBytes;
  const totalLabel = loading
    ? t("me.storage.usagePage.loading")
    : formatStorageSize(total, i18n.language);
  const availableLabel =
    usage.freeBytes !== null
      ? t("me.storage.usagePage.availableLabel", {
          size: formatStorageSize(usage.freeBytes, i18n.language)
        })
      : "";

  const visibleSegments = legend.filter(item => item.bytes > 0);

  function handleClearCache() {
    if (clearing) {
      return;
    }
    Alert.alert(
      t("me.storage.usagePage.clearCacheConfirmTitle"),
      t("me.storage.usagePage.clearCacheConfirmMessage"),
      [
        {
          text: t("me.storage.usagePage.clearCacheCancel"),
          style: "cancel"
        },
        {
          text: t("me.storage.usagePage.clearCacheConfirm"),
          style: "destructive",
          onPress: async () => {
            setClearing(true);
            try {
              const cleared = await clearMobileCacheDirectory();
              await refresh();
              Alert.alert(
                t("me.storage.usagePage.clearCacheDoneTitle"),
                t("me.storage.usagePage.clearCacheDoneMessage", {
                  size: formatStorageSize(cleared, i18n.language)
                })
              );
            } finally {
              setClearing(false);
            }
          }
        }
      ]
    );
  }

  return (
    <AccountPageShell
      title={t("me.storage.usagePage.title")}
      onBack={() => navigation.goBack()}
      testID="storage-usage"
    >
      <ScrollView
        style={styles.meScreenEditorScroll}
        contentContainerStyle={styles.accountSecurityContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.storageUsageHero}>
          <Text style={styles.storageUsageHeroLabel}>
            {t("me.storage.usagePage.totalLabel")}
          </Text>
          <Text style={styles.storageUsageHeroTotal}>{totalLabel}</Text>
          {availableLabel ? (
            <Text style={styles.storageUsageHeroSub}>{availableLabel}</Text>
          ) : null}

          <View style={styles.storageUsageBarTrack}>
            {visibleSegments.length > 0 ? (
              visibleSegments.map((item, index) => (
                <View
                  key={item.key}
                  style={[
                    styles.storageUsageBarSegment,
                    {
                      flex: item.bytes,
                      backgroundColor: item.color,
                      marginLeft: index === 0 ? 0 : 1
                    }
                  ]}
                />
              ))
            ) : (
              <View style={styles.storageUsageBarEmpty} />
            )}
          </View>
        </View>

        <Text style={styles.accountSecuritySectionLabel}>
          {t("me.storage.usagePage.breakdown")}
        </Text>
        <View style={styles.accountSecurityListSection}>
          {legend.map((item, index) => (
            <View key={item.key}>
              {index > 0 ? (
                <View style={styles.accountSecurityListSeparator} />
              ) : null}
              <View style={styles.accountSecurityListRow}>
                <View
                  style={[
                    styles.storageLegendDot,
                    { backgroundColor: item.color }
                  ]}
                />
                <Text style={styles.accountSecurityListTitle}>
                  {t(`me.storage.usagePage.${item.key}`)}
                </Text>
                <Text style={styles.accountSecurityListValue}>
                  {item.bytes > 0
                    ? formatStorageSize(item.bytes, i18n.language)
                    : t("me.storage.usagePage.legendUnavailable")}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.storageUsageHint}>
          {t("me.storage.usagePage.otherHint")}
        </Text>

        <View style={styles.accountSecurityListSection}>
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={handleClearCache}
            disabled={clearing || usage.cacheBytes <= 0}
            style={styles.accountSecurityListRow}
            testID="storage-clear-cache"
          >
            <View style={styles.accountSecurityListIconDanger}>
              <Icon
                name="trash-outline"
                size={20}
                color={theme.colors.danger}
              />
            </View>
            <Text style={styles.accountSecurityDangerRowTitle}>
              {clearing
                ? t("me.storage.usagePage.clearing")
                : t("me.storage.usagePage.clearCache")}
            </Text>
            <Text style={styles.accountSecurityListValue}>
              {usage.cacheBytes > 0
                ? formatStorageSize(usage.cacheBytes, i18n.language)
                : t("me.storage.usagePage.emptyCache")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </AccountPageShell>
  );
}
