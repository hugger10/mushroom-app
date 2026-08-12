import {
  buildTypingPreview,
  getConversationContentPreview,
  isGroupMessageRead,
  resolvePresenceLevel,
  type Conversation,
  type UserPresenceSummary
} from "@mushroom/shared";
import { Pressable, Text, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import Lucide from "@react-native-vector-icons/lucide/static";
import Ionicons from "react-native-vector-icons/Ionicons";
import { AppAvatar, GroupAvatar, OnlineStatusDot, TypingDots } from "../ui";
import { useAppTheme } from "../../styles/app-styles";
import { hapticHeavy } from "../../platform/haptics";
import { colorFromSeed } from "../../styles/theme";
import { formatChatTimeUnified } from "../../utils/app-ui";
import {
  getConversationAvatarSeed,
  getConversationDisplayAvatar,
  getConversationDisplayName
} from "../../utils/display";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ConversationRow(props: {
  conversation: Conversation;
  loginUserId?: number | null;
  peerPresence?: UserPresenceSummary | null;
  /**
   * 群已读高水位 (reader user_id → last_read_seq)。仅当前会话对应群有数据；
   * 列表层从 `groupReadStateByConversation[server_conversation_id]` 取一份传入。
   * 冷启动由本地缓存回灌。
   */
  groupReadState?: Record<number, number> | null;
  /**
   * 当前会话的 typer 映射（senderId → activity）。null/undefined 表示无人输入。
   * 列表层按 server_conversation_id 直接传入；ConversationRow 决定是否替换
   * 第二行预览为 "正在输入…" / "Alice 正在输入…"（typing 优先于 draft 和最近消息）。
   */
  typers?: Record<number, { activity: "text" | "voice" }> | null;
  /**
   * 当前登录用户的"已读回执"开关。false = 用户在隐私设置里关闭了，
   * 双向都不显示 ✓✓。controller 已在 inbound 路径过滤群已读，这里
   * 是 UI 兜底；私聊则依赖 server SQL JOIN 双向 gate 后回到 0。
   */
  isReceiptsEnabled?: boolean;
  hideDivider?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { t } = useTranslation();
  const { styles, theme } = useAppTheme();

  // 按压背景色过渡动画
  const bgProgress = useSharedValue(0);
  const rowAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      bgProgress.value,
      [0, 1],
      [theme.colors.background, theme.colors.surfaceMuted]
    )
  }));
  const handlePressIn = () => {
    bgProgress.value = withTiming(1, { duration: 150 });
  };
  const handlePressOut = () => {
    bgProgress.value = withTiming(0, { duration: 200 });
  };

  const displayName = getConversationDisplayName(props.conversation);
  const unreadCount = Number(props.conversation.unread_count || 0);
  const isArchived = Number(props.conversation.is_archived || 0) > 0;

  const isSelfSent =
    props.loginUserId != null &&
    Number(props.conversation.last_message_send_id || 0) === props.loginUserId;

  const lastMessageSenderName = (() => {
    if (props.conversation.type !== 2) {
      return props.conversation.display_name || displayName;
    }
    // 群聊：自己发的显示"你"/"You"
    if (isSelfSent) {
      return t("conversationList.selfSenderPrefix", "你");
    }
    if (props.conversation.last_message_sender_display_name) {
      return props.conversation.last_message_sender_display_name;
    }
    const senderId = props.conversation.last_message_send_id;
    if (!senderId) return undefined;
    const member = props.conversation.members?.find(
      m => Number(m.user_id) === Number(senderId)
    );
    return member?.nickname || undefined;
  })();
  const hasMention = Number(props.conversation.mention_unread_count || 0) > 0;
  // 预览文本不含 @ 前缀；前缀单独以高亮色渲染（对齐 WhatsApp 的 "@你" 强调）。
  const preview = getConversationContentPreview(
    {
      ...props.conversation,
      display_name: lastMessageSenderName,
      mention_unread_count: 0
    },
    t
  );
  const mentionPrefix = hasMention
    ? t("conversationList.mentionMe", "有人@你")
    : "";

  // 输入中状态优先级高于草稿和最近消息（对齐 WhatsApp / Telegram）。
  // 服务端已按会话成员全量分发 typing 事件，所以列表层就能拿到 typers。
  const typingPreview = props.typers
    ? buildTypingPreview({
        typers: props.typers,
        isGroup: props.conversation.type !== 1,
        resolveDisplayName: userId => {
          const member = props.conversation.members?.find(
            m => Number(m.user_id) === Number(userId)
          );
          return member?.nickname ?? null;
        }
      })
    : null;

  // 私聊自己发的：显示已送达/已读勾
  const lastSeq = Math.max(
    Number(props.conversation.last_server_sequence || 0),
    Number(props.conversation.last_sync_sequence || 0)
  );
  const receiptsEnabled = props.isReceiptsEnabled !== false;
  const showTick = isSelfSent && lastSeq > 0;
  const isRead =
    showTick &&
    receiptsEnabled &&
    (props.conversation.type === 1
      ? Number(props.conversation.peer_last_read_sequence || 0) >= lastSeq
      : isGroupMessageRead(
          lastSeq,
          props.groupReadState ?? null,
          props.loginUserId ?? null
        ));
  const avatarColor = colorFromSeed(
    displayName ||
      props.conversation.server_conversation_id ||
      props.conversation.client_conversation_id,
    theme.avatarPalette
  );
  const avatarUrl = getConversationDisplayAvatar(props.conversation);
  const isDirectChat = props.conversation.type === 1;
  const presenceLevel = isDirectChat
    ? resolvePresenceLevel(
        props.peerPresence?.is_online,
        props.peerPresence?.last_active_at
      )
    : "offline";

  return (
    <>
      <AnimatedPressable
        style={[
          styles.rowCard,
          isArchived ? styles.rowCardArchived : null,
          rowAnimatedStyle
        ]}
        onLongPress={() => {
          hapticHeavy();
          props.onLongPress?.();
        }}
        onPress={props.onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        testID={`conversation-row-${props.conversation.client_conversation_id}`}
      >
        <View style={styles.rowMain}>
          {props.conversation.type === 2 && !avatarUrl ? (
            <GroupAvatar
              seed={getConversationAvatarSeed(props.conversation)}
              name={displayName}
              size={48}
              style={{ marginRight: 12 }}
            />
          ) : (
            <View
              style={[
                styles.rowAvatarWrap,
                isDirectChat && presenceLevel === "online"
                  ? styles.rowAvatarRingOnline
                  : isDirectChat && presenceLevel === "recent"
                    ? styles.rowAvatarRingRecent
                    : null
              ]}
            >
              <AppAvatar
                label={displayName}
                imageUrl={avatarUrl}
                style={[
                  styles.rowAvatar,
                  { backgroundColor: avatarColor, marginRight: 0 }
                ]}
                textStyle={styles.rowAvatarText}
              />
              {isDirectChat && presenceLevel !== "offline" ? (
                <View pointerEvents="none" style={styles.rowOnlineDotWrap}>
                  <OnlineStatusDot
                    level={presenceLevel}
                    testID={`presence-dot-row-${props.conversation.client_conversation_id}-${presenceLevel}`}
                  />
                </View>
              ) : null}
            </View>
          )}
          <View style={styles.rowBody}>
            <View style={styles.rowHeader}>
              <Text numberOfLines={1} style={styles.rowTitle}>
                {displayName}
              </Text>
              <View style={styles.rowHeaderTrailing}>
                {props.conversation.is_pinned ? (
                  <Lucide
                    name="pin"
                    size={14}
                    color={theme.colors.textSoft}
                    style={styles.rowStateIcon}
                  />
                ) : null}
                {props.conversation.is_muted ? (
                  <Ionicons
                    name="volume-mute"
                    size={14}
                    color={theme.colors.textSoft}
                    style={styles.rowStateIcon}
                  />
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {showTick ? (
                    <Ionicons
                      name={isRead ? "checkmark-done" : "checkmark"}
                      size={14}
                      color={theme.colors.accent}
                      style={{ marginRight: 2 }}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.rowTime,
                      unreadCount > 0 ? styles.rowTimeUnread : null
                    ]}
                  >
                    {formatChatTimeUnified(
                      props.conversation.last_message_time
                    )}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.rowPreviewStatus}>
              {typingPreview ? (
                <View style={styles.rowTypingLine}>
                  <TypingDots size="sm" />
                  <Text numberOfLines={1} style={styles.rowSubtitleTyping}>
                    {typingPreview.text}
                  </Text>
                </View>
              ) : (
                <Text numberOfLines={1} style={styles.rowSubtitle}>
                  {mentionPrefix ? (
                    <Text>
                      [
                      <Text style={styles.rowSubtitleMention}>
                        {mentionPrefix}
                      </Text>
                      ]{" "}
                    </Text>
                  ) : null}
                  {preview}
                </Text>
              )}
              {unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                </View>
              ) : null}
            </View>
            {!typingPreview && props.conversation.draft?.trim() ? (
              <View style={styles.rowMeta}>
                <Text style={styles.metaDraft}>
                  {t("conversationList.stateDraft")}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </AnimatedPressable>
      {props.hideDivider ? null : <View style={styles.rowDivider} />}
    </>
  );
}
