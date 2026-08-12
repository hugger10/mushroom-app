import type { MobileMessageSearchResult } from "@mushroom/app-core";
import { memo, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import Lucide from "@react-native-vector-icons/lucide/static";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../styles/app-styles";

export interface PinnedMessagesBannerProps {
  /**
   * 当前会话的置顶消息（来自 searchMessages(filter: "pinned")，
   * 按消息时间倒序）。已撤回的消息会在组件内部被剔除。
   */
  results: MobileMessageSearchResult[];
  /**
   * 多条置顶消息时点击横条 → 打开置顶消息面板。
   */
  onOpenPanel: () => void;
  /**
   * 仅一条置顶消息时点击横条 → 直接跳转到该消息（Telegram 行为）。
   */
  onJumpToMessage: (result: MobileMessageSearchResult) => void;
}

/**
 * 置顶消息横条（Telegram 式）。
 *
 * 固定在消息列表顶部、不随滚动：由 ChatDetailScreen 渲染在 MessageList
 * 之外。单条置顶时展示摘要并直接跳转；多条时展示「N 条置顶消息」并打开
 * 底部面板列出全部置顶消息。
 */
export const PinnedMessagesBanner = memo(function PinnedMessagesBanner({
  results,
  onOpenPanel,
  onJumpToMessage
}: PinnedMessagesBannerProps) {
  const { styles, theme } = useAppTheme();
  const { t } = useTranslation();

  const active = useMemo(
    () => results.filter(r => Number(r.message.is_recalled || 0) === 0),
    [results]
  );

  const single = active.length === 1;

  const label = useMemo(() => {
    if (single) {
      return active[0].summary || t("chat.pinnedMessages");
    }
    return t("chat.pinnedCount", { count: active.length });
  }, [single, active, t]);

  if (active.length === 0) {
    return null;
  }

  const onPress = () => {
    if (single) {
      onJumpToMessage(active[0]);
    } else {
      onOpenPanel();
    }
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pinnedBanner,
        pressed && styles.pinnedBannerPressed
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="pinned-messages-banner"
    >
      <Lucide
        name="pin"
        size={16}
        color={theme.colors.accent}
        style={styles.pinnedBannerIcon}
      />
      <Text style={styles.pinnedBannerText} numberOfLines={1}>
        {label}
      </Text>
      {active.length > 1 ? (
        <View style={styles.pinnedBannerCount}>
          <Text style={styles.pinnedBannerCountText}>{active.length}</Text>
        </View>
      ) : null}
      <Ionicons
        name="chevron-forward"
        size={16}
        color={theme.colors.textSoft}
      />
    </Pressable>
  );
});
