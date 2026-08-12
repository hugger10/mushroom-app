import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import { deviceStorage } from "../../data/storage";
import { useAppTheme } from "../../styles/app-styles";

export interface GroupAnnouncementBannerProps {
  conversationId: string;
  announcement: string;
  announcementUpdatedAt?: string;
  onPress: () => void;
}

const STORAGE_KEY_PREFIX = "announcement_banner_dismissed";

function getDismissedAt(conversationId: string): string | null {
  try {
    return (
      deviceStorage.getString(`${STORAGE_KEY_PREFIX}.${conversationId}`) ?? null
    );
  } catch {
    return null;
  }
}

function setDismissedAt(conversationId: string, updatedAt: string) {
  try {
    deviceStorage.set(`${STORAGE_KEY_PREFIX}.${conversationId}`, updatedAt);
  } catch {
    // best effort
  }
}

export const GroupAnnouncementBanner = memo(function GroupAnnouncementBanner({
  conversationId,
  announcement,
  announcementUpdatedAt,
  onPress
}: GroupAnnouncementBannerProps) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();

  const dismissSentinel = announcementUpdatedAt ?? "";

  const [dismissed, setDismissed] = useState(() => {
    const storedAt = getDismissedAt(conversationId);
    return storedAt != null && storedAt === dismissSentinel;
  });

  useEffect(() => {
    const storedAt = getDismissedAt(conversationId);
    setDismissed(storedAt != null && storedAt === dismissSentinel);
  }, [conversationId, dismissSentinel]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setDismissedAt(conversationId, dismissSentinel);
  }, [conversationId, dismissSentinel]);

  if (dismissed) return null;

  const preview =
    announcement.length > 40 ? announcement.slice(0, 40) + "…" : announcement;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.announcementBanner,
        pressed && styles.announcementBannerPressed
      ]}
      accessibilityRole="button"
      accessibilityLabel={t("ui.announcementPrefix", { content: announcement })}
    >
      <Text style={styles.announcementBannerIcon}>📢</Text>
      <Text style={styles.announcementBannerText} numberOfLines={1}>
        {preview}
      </Text>
      <Pressable
        onPress={handleDismiss}
        hitSlop={8}
        style={styles.announcementBannerDismiss}
        accessibilityRole="button"
        accessibilityLabel={t("ui.closeAnnouncementBanner")}
      >
        <Ionicons name="close" size={16} color={theme.colors.textSoft} />
      </Pressable>
    </Pressable>
  );
});
