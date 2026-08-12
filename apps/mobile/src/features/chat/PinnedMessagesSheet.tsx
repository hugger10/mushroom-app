import type { MobileMessageSearchResult } from "@mushroom/app-core";
import { memo, useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "../../components/ui";
import { useAppTheme } from "../../styles/app-styles";
import { formatConversationTime } from "../../utils/app-ui";

export interface PinnedMessagesSheetProps {
  visible: boolean;
  /**
   * 当前会话的置顶消息（按消息时间倒序）。已撤回的消息会在组件内部被剔除。
   */
  results: MobileMessageSearchResult[];
  /**
   * 点击某条置顶消息 → 关闭面板并跳转到原位置。
   */
  onSelect: (result: MobileMessageSearchResult) => void;
  /**
   * 点击条目右侧的取消置顶按钮（复用既有 handleTogglePin）。
   */
  onUnpin: (message: MobileMessageSearchResult["message"]) => void;
  onClose: () => void;
}

/**
 * 置顶消息列表面板（Telegram 展开式）。
 *
 * 由 PinnedMessagesBanner（多条时）打开，列出当前会话全部置顶消息；
 * 点击条目跳转到原位置，右侧按钮可直接取消置顶。
 */
export const PinnedMessagesSheet = memo(function PinnedMessagesSheet({
  visible,
  results,
  onSelect,
  onUnpin,
  onClose
}: PinnedMessagesSheetProps) {
  const { styles, theme } = useAppTheme();
  const { t } = useTranslation();

  const active = useMemo(
    () => results.filter(r => Number(r.message.is_recalled || 0) === 0),
    [results]
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      testID="pinned-messages-sheet"
      title={t("chat.pinnedMessages")}
      containerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {active.map(result => {
          const message = result.message;
          const key = `${message.client_message_id}:${message.server_message_id}`;
          const sender =
            message.sender_nickname ||
            t("chatMessage.unknownUser", { id: message.sender_id });
          const time = message.created_at
            ? formatConversationTime(message.created_at)
            : "";
          return (
            <Pressable
              key={key}
              onPress={() => onSelect(result)}
              style={({ pressed }) => [
                styles.pinnedSheetRow,
                pressed && styles.pinnedSheetRowPressed
              ]}
              testID={`pinned-sheet-item-${message.client_message_id}`}
            >
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.searchResultTitle}>
                  {sender}
                  {time ? (
                    <Text style={styles.searchResultMeta}>{` · ${time}`}</Text>
                  ) : null}
                </Text>
                <Text numberOfLines={2} style={styles.searchResultBody}>
                  {result.summary}
                </Text>
              </View>
              <Pressable
                onPress={() => onUnpin(message)}
                hitSlop={8}
                style={styles.pinnedSheetUnpin}
                accessibilityRole="button"
                accessibilityLabel={t("conversationList.unpin")}
                testID={`pinned-sheet-unpin-${message.client_message_id}`}
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={theme.colors.textSoft}
                />
              </Pressable>
            </Pressable>
          );
        })}
        {active.length === 0 ? (
          <Text style={styles.pinnedSheetEmpty}>{t("chat.pinnedEmpty")}</Text>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
});
